/**
 * Unreal GVAS property-tree reader, narrowed to what Palworld saves actually use.
 *
 * The one design rule that matters here: every property declares its payload size,
 * so we can seek past anything we don't want. `Level.sav` is 29 MB and its
 * MapObjectSaveData (every structure you have ever built) dwarfs the pal data — a
 * reader that eagerly decoded the whole tree would be slow for no benefit. Callers
 * pass `select` to descend into named branches only; everything else is skipped by
 * its declared size.
 */

import { Reader } from './binary.ts';

export interface GvasHeader {
  saveGameVersion: number;
  packageFileVersionUE4: number;
  packageFileVersionUE5: number;
  engine: { major: number; minor: number; patch: number; changelist: number; branch: string };
  customVersionFormat: number;
  customVersions: Array<{ id: string; version: number }>;
  saveGameClassName: string;
}

export function readHeader(r: Reader): GvasHeader {
  const magic = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
  if (magic !== 'GVAS') throw new Error(`not a GVAS blob (magic ${JSON.stringify(magic)})`);

  const saveGameVersion = r.i32();
  const packageFileVersionUE4 = r.i32();
  const packageFileVersionUE5 = r.i32();
  const engine = {
    major: r.u16(),
    minor: r.u16(),
    patch: r.u16(),
    changelist: r.u32(),
    branch: r.fstring(),
  };
  const customVersionFormat = r.i32();
  const count = r.i32();
  const customVersions: Array<{ id: string; version: number }> = [];
  for (let i = 0; i < count; i++) customVersions.push({ id: r.guid(), version: r.i32() });

  return {
    saveGameVersion,
    packageFileVersionUE4,
    packageFileVersionUE5,
    engine,
    customVersionFormat,
    customVersions,
    saveGameClassName: r.fstring(),
  };
}

export type PropValue = unknown;
export type Props = Record<string, PropValue>;

export interface ReadOpts {
  /** Property names to decode at this level; everything else is skipped. */
  select?: Set<string>;
  /** Per-property options applied when descending into that property's value. */
  nested?: Record<string, ReadOpts>;
}

function optionalGuid(r: Reader): void {
  if (r.u8()) r.skip(16);
}

/** Reads a tagged property list until the `None` terminator. */
export function readProperties(r: Reader, opts?: ReadOpts): Props {
  const out: Props = {};
  const select = opts?.select;

  for (;;) {
    if (r.eof) break;
    const name = r.fstring();
    if (name === 'None' || name === '') break;

    const type = r.fstring();
    const size = r.i64n();
    const want = !select || select.has(name);

    const value = readValue(r, type, size, want, opts?.nested?.[name]);
    if (want) out[name] = value;
  }
  return out;
}

/**
 * Reads one property's type-specific header, then its `size`-byte payload.
 * Always lands the cursor exactly at the end of the payload, decoded or not.
 */
function readValue(r: Reader, type: string, size: number, want: boolean, opts?: ReadOpts): PropValue {
  // Bools carry their value in the tag itself and declare size 0.
  if (type === 'BoolProperty') {
    const v = r.bool();
    optionalGuid(r);
    return v;
  }

  if (type === 'StructProperty') {
    const structType = r.fstring();
    r.skip(16); // struct guid
    optionalGuid(r);
    const end = r.pos + size;
    const v = want ? readStructBody(r, structType, opts) : undefined;
    r.pos = end;
    return v;
  }

  if (type === 'ArrayProperty') {
    const inner = r.fstring();
    optionalGuid(r);
    const end = r.pos + size;
    const v = want ? readArrayBody(r, inner, opts) : undefined;
    r.pos = end;
    return v;
  }

  // Sets carry an inner-type header like arrays. Getting this wrong shortens the
  // skip and desyncs everything after it, which is exactly how worldSaveData's
  // trailing InLockerCharacterInstanceIDArray used to derail the whole parse.
  if (type === 'SetProperty') {
    const inner = r.fstring();
    optionalGuid(r);
    const end = r.pos + size;
    const v = want ? readSetBody(r, inner) : undefined;
    r.pos = end;
    return v;
  }

  if (type === 'MapProperty') {
    const keyType = r.fstring();
    const valueType = r.fstring();
    optionalGuid(r);
    const end = r.pos + size;
    const v = want ? readMapBody(r, keyType, valueType, opts) : undefined;
    r.pos = end;
    return v;
  }

  if (type === 'EnumProperty') {
    r.fstring(); // enum type name, recoverable from the value
    optionalGuid(r);
    const end = r.pos + size;
    const v = want ? r.fstring() : undefined;
    r.pos = end;
    return v;
  }

  if (type === 'ByteProperty') {
    r.fstring(); // enum name, or "None" for a plain byte
    optionalGuid(r);
    const end = r.pos + size;
    // A 1-byte payload is a raw byte; anything longer is an enum value string.
    const v = want ? (size === 1 ? r.u8() : r.fstring()) : undefined;
    r.pos = end;
    return v;
  }

  optionalGuid(r);
  const end = r.pos + size;
  const v = want ? readScalar(r, type) : undefined;
  r.pos = end;
  return v;
}

function readScalar(r: Reader, type: string): PropValue {
  switch (type) {
    case 'IntProperty':
      return r.i32();
    case 'Int64Property':
      return r.i64n();
    case 'UInt16Property':
      return r.u16();
    case 'UInt32Property':
      return r.u32();
    case 'FloatProperty':
      return r.f32();
    case 'DoubleProperty':
      return r.f64();
    case 'StrProperty':
    case 'NameProperty':
      return r.fstring();
    default:
      return undefined; // unknown scalar: caller's `end` seek covers it
  }
}

/**
 * Struct bodies are either a fixed native layout or a nested property list.
 * Unknown struct types fall through to the property-list path, which terminates
 * on `None`; the caller's size-based seek makes a wrong guess non-fatal.
 */
function readStructBody(r: Reader, structType: string, opts?: ReadOpts): PropValue {
  switch (structType) {
    case 'Guid':
      return r.guid();
    case 'DateTime':
      // UE ticks exceed 2^53, so keep it lossless as a string.
      return r.u64().toString();
    case 'Vector':
    case 'Rotator':
      return [r.f64(), r.f64(), r.f64()];
    case 'Quat':
      return [r.f64(), r.f64(), r.f64(), r.f64()];
    case 'Vector2D':
      return [r.f64(), r.f64()];
    case 'LinearColor':
      return [r.f32(), r.f32(), r.f32(), r.f32()];
    case 'IntPoint':
      return [r.i32(), r.i32()];
    default:
      return readProperties(r, opts);
  }
}

function readArrayBody(r: Reader, inner: string, opts?: ReadOpts): PropValue {
  const count = r.i32();

  // RawData and friends: keep as bytes, re-parsed by the caller when needed.
  if (inner === 'ByteProperty') return r.take(count);

  if (inner === 'StructProperty') {
    // Struct arrays repeat the tag once, then concatenate bodies with no per-item size.
    r.fstring(); // field name
    r.fstring(); // "StructProperty"
    r.i64(); // total payload size
    const structType = r.fstring();
    r.skip(16); // struct guid
    optionalGuid(r);
    const out: PropValue[] = [];
    for (let i = 0; i < count; i++) out.push(readStructBody(r, structType, opts));
    return out;
  }

  const out: PropValue[] = [];
  for (let i = 0; i < count; i++) out.push(readArrayScalar(r, inner));
  return out;
}

/** Sets serialise as [toRemove][count][elements]; Palworld only uses guid sets. */
function readSetBody(r: Reader, inner: string): PropValue {
  r.i32(); // elements-to-remove, always 0
  const count = r.i32();
  const out: PropValue[] = [];
  for (let i = 0; i < count; i++) {
    out.push(inner === 'StructProperty' ? r.guid() : readArrayScalar(r, inner));
  }
  return out;
}

function readArrayScalar(r: Reader, inner: string): PropValue {
  switch (inner) {
    case 'NameProperty':
    case 'StrProperty':
    case 'EnumProperty':
      return r.fstring();
    case 'IntProperty':
      return r.i32();
    case 'Int64Property':
      return r.i64n();
    case 'FloatProperty':
      return r.f32();
    case 'DoubleProperty':
      return r.f64();
    case 'BoolProperty':
      return r.bool();
    default:
      throw new Error(`unsupported array element type ${inner}`);
  }
}

function readMapBody(
  r: Reader,
  keyType: string,
  valueType: string,
  opts?: ReadOpts,
): Array<{ key: PropValue; value: PropValue }> {
  r.i32(); // keys-to-remove, always 0 in save data
  const count = r.i32();
  const out: Array<{ key: PropValue; value: PropValue }> = [];
  for (let i = 0; i < count; i++) {
    out.push({ key: readMapEntry(r, keyType), value: readMapEntry(r, valueType, opts) });
  }
  return out;
}

/** Map entries are untagged, so struct entries are read as bare property lists. */
function readMapEntry(r: Reader, type: string, opts?: ReadOpts): PropValue {
  switch (type) {
    case 'StructProperty':
      return readProperties(r, opts);
    case 'NameProperty':
    case 'StrProperty':
    case 'EnumProperty':
      return r.fstring();
    case 'IntProperty':
      return r.i32();
    case 'Int64Property':
      return r.i64n();
    case 'FloatProperty':
      return r.f32();
    case 'BoolProperty':
      return r.bool();
    case 'ByteProperty':
      return r.u8();
    default:
      throw new Error(`unsupported map entry type ${type}`);
  }
}
