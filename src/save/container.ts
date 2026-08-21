/**
 * The outer `.sav` wrapper: a 12-byte header followed by a compressed GVAS blob.
 *
 *   u32 rawSize | u32 compressedSize | char[3] magic | u8 compressionType
 *
 * Magic tells you the codec, and it changed under us: `PlZ` is the original zlib
 * era, `PlM` is the Oodle (Kraken) format shipped from Palworld 0.6 onward, and
 * `CNK` is the Xbox chunked container. Saves written by current builds are `PlM`,
 * which is why most zlib-era tooling simply cannot open them.
 */

export type SaveMagic = 'PlZ' | 'PlM' | 'CNK';

export interface SaveContainer {
  rawSize: number;
  compressedSize: number;
  magic: SaveMagic;
  compressionType: number;
  data: Uint8Array;
}

const HEADER_BYTES = 12;

export function readContainerHeader(bytes: Uint8Array): Omit<SaveContainer, 'data'> {
  if (bytes.length < HEADER_BYTES) throw new Error('file is too short to be a Palworld save');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[8], bytes[9], bytes[10]) as SaveMagic;
  return {
    rawSize: view.getUint32(0, true),
    compressedSize: view.getUint32(4, true),
    magic,
    compressionType: bytes[11],
  };
}

/** Unwraps a `.sav` file to its decompressed GVAS bytes. */
export async function decodeSave(bytes: Uint8Array): Promise<SaveContainer> {
  const head = readContainerHeader(bytes);
  const payload = bytes.subarray(HEADER_BYTES);

  if (head.magic === 'CNK') {
    throw new Error(
      'Xbox/Game Pass chunked saves (CNK) are not supported — this reader handles the Steam PlZ/PlM formats.',
    );
  }
  if (head.magic !== 'PlZ' && head.magic !== 'PlM') {
    throw new Error(`unrecognised save magic ${JSON.stringify(head.magic)}`);
  }

  let data: Uint8Array;
  if (head.compressionType === 0x30) {
    data = payload.subarray(0, head.rawSize);
  } else if (head.magic === 'PlM') {
    data = await oodleDecompress(payload, head.rawSize);
  } else if (head.compressionType === 0x31) {
    data = await inflate(payload);
  } else if (head.compressionType === 0x32) {
    data = await inflate(await inflate(payload));
  } else {
    throw new Error(`unsupported compression type 0x${head.compressionType.toString(16)}`);
  }

  if (data.length !== head.rawSize) {
    throw new Error(`decompressed ${data.length} bytes, header expected ${head.rawSize}`);
  }
  return { ...head, data };
}

/**
 * Oodle Kraken. UE5 links the encoder statically into the shipping binary, so
 * there is no redistributable DLL to borrow — we use the open-source `ooz`
 * decoder compiled to wasm, which runs identically in Node and the browser.
 */
async function oodleDecompress(payload: Uint8Array, rawSize: number): Promise<Uint8Array> {
  const { decompress } = await import('ooz-wasm');
  return decompress(payload, rawSize);
}

/** zlib via the platform stream API, present in both Node and browsers. */
async function inflate(payload: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  // Re-home the bytes in a plain ArrayBuffer; the stream API will not accept a
  // view that might be backed by a SharedArrayBuffer.
  const owned = new Uint8Array(payload.byteLength);
  owned.set(payload);
  void writer.write(owned);
  void writer.close();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
