/**
 * Xbox / PC Game Pass saves. The Microsoft Store build keeps no Level.sav on
 * disk; it keeps a "wgs" folder of containers with names only an index knows:
 *
 *   wgs/<16 hex>_<32 hex>/containers.index          every container: name, folder
 *   wgs/<16 hex>_<32 hex>/<GUID>/container.<n>      that container's files: name, blob
 *   wgs/<16 hex>_<32 hex>/<GUID>/<GUID>             a blob: the bytes of one .sav
 *
 * A container's name is the Steam path with '-' for '/':
 * `<worldid>-Level`, `<worldid>-LevelMeta`, `<worldid>-Players-<uid>`. This turns
 * a picked wgs folder into the Steam layout findWorlds() already reads. Nothing is
 * decoded here: the blobs are ordinary save files inside a 12-byte CNK wrapper,
 * which decodeSave() unwraps.
 *
 * The layout is the one the open-source extractors read (Z1ni's
 * XGP-save-extractor, Palworld Save Pal). All integers are little-endian and all
 * strings UTF-16.
 */

import type { PickedFile } from './findWorlds.ts';

export interface XboxContainer {
  name: string;
  /** Which `container.<n>` file lists this container's blobs. */
  seq: number;
  /** The container's folder: its GUID as Windows prints it, in upper-case hex. */
  dir: string;
  /** Last written, ms since 1970. */
  modified: number;
}

const INDEX_NAME = 'containers.index';
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** True when a picked folder holds an Xbox container index somewhere inside. */
export const hasXboxIndex = (files: Array<PickedFile<unknown>>): boolean =>
  files.some((f) => nameOf(norm(f.path)).toLowerCase() === INDEX_NAME);

class Cursor {
  private readonly view: DataView;
  pos = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.length) throw new Error('the Xbox container index ends early');
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.pos++];
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  u64(): bigint {
    this.need(8);
    const v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return v;
  }

  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }

  /** `units` UTF-16 code units, with the padding NULs dropped. */
  utf16(units: number): string {
    this.need(units * 2);
    let s = '';
    for (let i = 0; i < units; i++) s += String.fromCharCode(this.view.getUint16(this.pos + i * 2, true));
    this.pos += units * 2;
    return s.replace(/\0+$/, '');
  }

  /** A string with its length in front. */
  str(): string {
    return this.utf16(this.u32());
  }

  /**
   * A GUID as the folder and blob names spell it: Windows stores the first three
   * fields little-endian and prints them big-endian, so those bytes swap.
   */
  guid(): string {
    this.need(16);
    const b = this.bytes.subarray(this.pos, this.pos + 16);
    this.pos += 16;
    const order = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15];
    return order.map((i) => b[i].toString(16).padStart(2, '0')).join('').toUpperCase();
  }
}

/** FILETIME (100 ns ticks since 1601) to ms since 1970. */
const fromFiletime = (ticks: bigint): number => Number(ticks / 10_000n) - 11_644_473_600_000;

/** Every container `containers.index` lists. */
export function parseContainersIndex(bytes: Uint8Array): XboxContainer[] {
  const r = new Cursor(bytes);
  r.skip(4); // format version
  const count = r.u32();
  r.str(); // display name, empty on PC
  r.str(); // package name
  r.skip(8 + 4); // written at, flags
  r.str(); // the index's own id
  r.skip(8);

  const containers: XboxContainer[] = [];
  for (let i = 0; i < count; i++) {
    const name = r.str();
    r.str(); // the name again
    r.str(); // cloud id
    const seq = r.u8();
    r.skip(4); // flags
    const dir = r.guid();
    const modified = fromFiletime(r.u64());
    r.skip(8 + 8); // reserved, size
    containers.push({ name, seq, dir, modified });
  }
  return containers;
}

/** The files a `container.<n>` lists: each name with the blob names it may be stored under. */
export function parseContainerFiles(bytes: Uint8Array): Array<{ name: string; blobs: string[] }> {
  const r = new Cursor(bytes);
  r.skip(4); // format version
  const count = r.u32();
  const files: Array<{ name: string; blobs: string[] }> = [];
  for (let i = 0; i < count; i++) {
    const name = r.utf16(64);
    // Two ids: the cloud's and the disk's. They match on some machines and the
    // first is all zeros on others, so the caller takes whichever file exists.
    const first = r.guid();
    const second = r.guid();
    files.push({ name, blobs: first === second ? [first] : [second, first] });
  }
  return files;
}

/**
 * Where a container belongs in the Steam layout, relative to the index's folder.
 * `part` is set for a Level.sav stored in numbered pieces (`<worldid>-Level-01`).
 */
export function steamPathFor(containerName: string): { path: string; part?: number } {
  // "-Slot1-" marks a save slot on some builds and is not part of the path.
  const name = containerName.replace(/-Slot\d*-/g, '-');
  const dash = name.indexOf('-');
  if (dash < 0) return { path: `${name}.sav` };
  const world = name.slice(0, dash);
  const rest = name.slice(dash + 1);
  const piece = /^Level-(\d{2})$/.exec(rest);
  if (piece) return { path: `${world}/Level.sav`, part: Number(piece[1]) };
  return { path: `${world}/${rest.replace(/-/g, '/')}.sav` };
}

/**
 * Rewrite a picked wgs folder as the Steam layout. `read` returns a file's bytes
 * (only the small index files are read); `join` makes one file out of a Level.sav
 * stored in pieces. Containers whose blob is missing from the pick are left out.
 */
export async function xboxToSteamLayout<T>(
  files: Array<PickedFile<T>>,
  read: (file: T) => Promise<Uint8Array>,
  join: (parts: T[]) => T,
): Promise<Array<PickedFile<T>>> {
  const byPath = new Map<string, PickedFile<T>>();
  for (const f of files) byPath.set(norm(f.path).toLowerCase(), { ...f, path: norm(f.path) });

  const out: Array<PickedFile<T>> = [];
  for (const index of byPath.values()) {
    if (nameOf(index.path).toLowerCase() !== INDEX_NAME) continue;
    const root = parentOf(index.path);
    const under = (rel: string) => byPath.get((root ? `${root}/${rel}` : rel).toLowerCase());

    // The index can list a name more than once after a sync: keep the newest.
    const newest = new Map<string, XboxContainer>();
    for (const c of parseContainersIndex(await read(index.file))) {
      const seen = newest.get(c.name);
      if (!seen || c.seq > seen.seq || (c.seq === seen.seq && c.modified > seen.modified)) newest.set(c.name, c);
    }

    const pieces = new Map<string, Array<{ part: number; file: PickedFile<T> }>>();
    for (const c of newest.values()) {
      const list = under(`${c.dir}/container.${c.seq}`) ?? latestList(byPath, root ? `${root}/${c.dir}` : c.dir);
      if (!list) continue;
      const entries = parseContainerFiles(await read(list.file));
      // Palworld stores one blob per container, named "Data".
      const entry = entries.find((e) => e.name.toLowerCase() === 'data') ?? entries[0];
      const blob = entry?.blobs.map((b) => under(`${c.dir}/${b}`)).find(Boolean);
      if (!blob) continue;

      // Always one folder deep, so a world's parent folder can hold GlobalPalStorage.sav.
      const to = steamPathFor(c.name);
      const path = `${root || 'wgs'}/${to.path}`;
      const file = { path, file: blob.file, modified: blob.modified };
      if (to.part == null) out.push(file);
      else pieces.set(path, [...(pieces.get(path) ?? []), { part: to.part, file }]);
    }

    for (const [path, parts] of pieces) {
      // A whole `<worldid>-Level` beside the pieces is the same file: keep that one.
      if (out.some((f) => f.path.toLowerCase() === path.toLowerCase())) continue;
      parts.sort((a, b) => a.part - b.part);
      out.push({
        path,
        file: parts.length === 1 ? parts[0].file.file : join(parts.map((p) => p.file.file)),
        modified: Math.max(...parts.map((p) => p.file.modified)),
      });
    }
  }
  return out;
}

/** The highest-numbered `container.<n>` in a folder, when the index names one that is not there. */
function latestList<T>(byPath: Map<string, PickedFile<T>>, dir: string): PickedFile<T> | undefined {
  const prefix = `${dir}/container.`.toLowerCase();
  let best: { n: number; file: PickedFile<T> } | undefined;
  for (const [key, file] of byPath) {
    if (!key.startsWith(prefix)) continue;
    const n = Number(key.slice(prefix.length));
    if (Number.isInteger(n) && (!best || n > best.n)) best = { n, file };
  }
  return best?.file;
}
