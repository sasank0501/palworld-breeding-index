/**
 * The outer `.sav` wrapper: a 12-byte header followed by a compressed GVAS blob.
 *
 *   u32 rawSize | u32 compressedSize | char[3] magic | u8 compressionType
 *
 * Magic tells you the codec, and it changed under us: `PlZ` is the original zlib
 * era, and `PlM` is the Oodle (Kraken) format shipped from Palworld 0.6 onward.
 * Saves written by current builds are `PlM`, which is why most zlib-era tooling
 * simply cannot open them.
 *
 * Xbox / Game Pass saves put one more 12-byte header in front, with the magic
 * `CNK`; the real header and the same payload follow it.
 */

export type SaveMagic = 'PlZ' | 'PlM';

export interface SaveContainer {
  rawSize: number;
  compressedSize: number;
  magic: SaveMagic;
  compressionType: number;
  /** True for an Xbox / Game Pass save: a CNK header came first. */
  chunked: boolean;
  /** Where the payload starts. */
  dataOffset: number;
  data: Uint8Array;
}

const HEADER_BYTES = 12;

export function readContainerHeader(bytes: Uint8Array): Omit<SaveContainer, 'data'> {
  if (bytes.length < HEADER_BYTES) throw new Error('file is too short to be a Palworld save');
  const magicAt = (at: number) => String.fromCharCode(bytes[at + 8], bytes[at + 9], bytes[at + 10]);
  const chunked = magicAt(0) === 'CNK';
  const at = chunked ? HEADER_BYTES : 0;
  if (bytes.length < at + HEADER_BYTES) throw new Error('file is too short to be a Palworld save');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    rawSize: view.getUint32(at, true),
    compressedSize: view.getUint32(at + 4, true),
    magic: magicAt(at) as SaveMagic,
    compressionType: bytes[at + 11],
    chunked,
    dataOffset: at + HEADER_BYTES,
  };
}

/** Unwraps a `.sav` file to its decompressed GVAS bytes. */
export async function decodeSave(bytes: Uint8Array): Promise<SaveContainer> {
  const head = readContainerHeader(bytes);
  const payload = bytes.subarray(head.dataOffset);

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
