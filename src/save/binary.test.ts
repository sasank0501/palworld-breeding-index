import { describe, expect, it } from 'vitest';

import { Reader } from './binary.ts';

/** Builds an FString the way Unreal writes one. */
function fstring(s: string, utf16 = false): Uint8Array {
  if (utf16) {
    const chars = s.length + 1;
    const out = new Uint8Array(4 + chars * 2);
    new DataView(out.buffer).setInt32(0, -chars, true);
    for (let i = 0; i < s.length; i++) {
      new DataView(out.buffer).setUint16(4 + i * 2, s.charCodeAt(i), true);
    }
    return out;
  }
  const bytes = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + bytes.length + 1);
  new DataView(out.buffer).setInt32(0, bytes.length + 1, true);
  out.set(bytes, 4);
  return out;
}

describe('Reader.fstring', () => {
  it('reads an ascii string and consumes its null terminator', () => {
    const r = new Reader(fstring('CharacterID'));
    expect(r.fstring()).toBe('CharacterID');
    expect(r.pos).toBe(4 + 12);
  });

  it('reads a UTF-16 string signalled by a negative length', () => {
    const r = new Reader(fstring('Pal★', true));
    expect(r.fstring()).toBe('Pal★');
    expect(r.pos).toBe(4 + 5 * 2);
  });

  it('treats length 0 as the empty string', () => {
    const buf = new Uint8Array(4);
    expect(new Reader(buf).fstring()).toBe('');
  });

  it('reads consecutive strings without drift', () => {
    const a = fstring('SaveParameter');
    const b = fstring('None');
    const buf = new Uint8Array(a.length + b.length);
    buf.set(a);
    buf.set(b, a.length);
    const r = new Reader(buf);
    expect(r.fstring()).toBe('SaveParameter');
    expect(r.fstring()).toBe('None');
    expect(r.pos).toBe(buf.length);
  });
});

describe('Reader scalars', () => {
  it('reads little-endian integers and advances exactly', () => {
    const buf = new Uint8Array(16);
    const dv = new DataView(buf.buffer);
    dv.setInt32(0, -5, true);
    dv.setUint16(4, 65535, true);
    dv.setBigInt64(6, 1234567890123n, true);
    const r = new Reader(buf);
    expect(r.i32()).toBe(-5);
    expect(r.u16()).toBe(65535);
    expect(r.i64n()).toBe(1234567890123);
    expect(r.pos).toBe(14);
  });

  it('formats a guid as canonical hex', () => {
    const buf = new Uint8Array(16);
    buf[0] = 0xa2;
    buf[1] = 0xcc;
    buf[15] = 0xe4;
    expect(new Reader(buf).guid()).toBe('a2cc0000-0000-0000-0000-0000000000e4');
  });

  it('take() returns a view and advances', () => {
    const r = new Reader(Uint8Array.from([1, 2, 3, 4, 5]));
    r.skip(1);
    expect([...r.take(3)]).toEqual([2, 3, 4]);
    expect(r.pos).toBe(4);
  });
});
