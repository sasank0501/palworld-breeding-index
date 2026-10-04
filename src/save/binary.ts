/**
 * Little-endian cursor over a save blob.
 *
 * Everything downstream reads through this, so the two Unreal-specific quirks live
 * here rather than being re-derived at each call site:
 *   - FString stores a *negative* length to mean UTF-16LE, and the count includes
 *     the terminating null.
 *   - FGuid is four u32s, not a byte-ordered UUID. We only ever compare/format
 *     them, never interpret them, so a stable hex rendering is enough.
 */

const decodeAscii = new TextDecoder('latin1');
const decodeUtf16 = new TextDecoder('utf-16le');

export class Reader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  pos: number;

  constructor(bytes: Uint8Array, pos = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
  }

  get eof(): boolean {
    return this.pos >= this.bytes.length;
  }

  u8(): number {
    return this.view.getUint8(this.pos++);
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  i16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i64(): bigint {
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return v;
  }

  u64(): bigint {
    const v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return v;
  }

  /** i64 narrowed to a JS number. Save counters stay far below 2^53. */
  i64n(): number {
    return Number(this.i64());
  }

  f32(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  skip(n: number): void {
    this.pos += n;
  }

  /** Zero-copy view of the next `n` bytes. */
  take(n: number): Uint8Array {
    const v = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }

  /**
   * FString. Positive length = 1-byte chars, negative = UTF-16LE; either way the
   * count includes a trailing null that we drop.
   */
  fstring(): string {
    const len = this.i32();
    if (len === 0) return '';
    if (len > 0) {
      const s = decodeAscii.decode(this.bytes.subarray(this.pos, this.pos + len - 1));
      this.pos += len;
      return s;
    }
    const chars = -len;
    const s = decodeUtf16.decode(this.bytes.subarray(this.pos, this.pos + (chars - 1) * 2));
    this.pos += chars * 2;
    return s;
  }

  /** FGuid as canonical hex. Stable and comparable; not a round-trippable UUID. */
  guid(): string {
    const b = this.bytes;
    let out = '';
    for (let i = 0; i < 16; i++) out += HEX[b[this.pos + i]];
    this.pos += 16;
    return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
  }
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

