/**
 * Where an art pack lives in the browser. Two backends with one interface:
 *
 *   OPFS       the origin private file system: real files, made for large data.
 *              art/current.json names the live pack; art/<id>/... holds it.
 *   IndexedDB  for browsers with no OPFS, which today means Firefox private
 *              windows. One store; "<id>/<path>" -> Blob, "#current" -> PackInfo.
 *
 * Both sides pick with the same rule (OPFS if it opens, else IndexedDB), so the
 * worker that writes a pack and the page that reads it always agree.
 *
 * A pack is written under a fresh id and only made current once every file is in,
 * so a load that fails or is cut short never leaves the live pack half-replaced;
 * leftovers are swept on the next load.
 */

import { createStore, del, delMany, get, keys, set } from 'idb-keyval';

import type { PackInfo } from './pack.ts';

export interface ArtStorage {
  kind: 'opfs' | 'idb';
  current(): Promise<PackInfo | null>;
  setCurrent(info: PackInfo | null): Promise<void>;
  read(id: string, path: string): Promise<Blob | null>;
  write(id: string, path: string, data: Blob): Promise<void>;
  /** Every pack id present, live or left over. */
  ids(): Promise<string[]>;
  remove(id: string): Promise<void>;
}

const TYPES: Record<string, string> = { glb: 'model/gltf-binary', webp: 'image/webp', json: 'application/json' };
export const mimeOf = (path: string): string => TYPES[path.slice(path.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

// ---------------------------------------------------------------- OPFS

type Dir = FileSystemDirectoryHandle;
/** Only in dedicated workers; the page writes through createWritable instead. */
type SyncHandle = { write(b: BufferSource, o: { at: number }): number; truncate(n: number): void; flush(): void; close(): void };

async function walk(dir: Dir, parts: string[], create: boolean): Promise<Dir> {
  let d = dir;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}

async function writeFile(dir: Dir, name: string, data: Blob): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const sync = (fh as unknown as { createSyncAccessHandle?: () => Promise<SyncHandle> }).createSyncAccessHandle;
  if (sync) {
    const h = await sync.call(fh);
    try {
      h.truncate(0);
      h.write(new Uint8Array(await data.arrayBuffer()), { at: 0 });
      h.flush();
    } finally {
      h.close();
    }
    return;
  }
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

const notFound = (e: unknown) => (e as DOMException)?.name === 'NotFoundError' || (e as DOMException)?.name === 'TypeMismatchError';

async function opfs(): Promise<ArtStorage> {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('art', { create: true });
  const split = (path: string) => {
    const parts = path.split('/');
    return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
  };
  return {
    kind: 'opfs',
    async current() {
      try {
        const f = await (await root.getFileHandle('current.json')).getFile();
        return JSON.parse(await f.text()) as PackInfo;
      } catch {
        return null;
      }
    },
    async setCurrent(info) {
      if (info) await writeFile(root, 'current.json', new Blob([JSON.stringify(info)], { type: 'application/json' }));
      else await root.removeEntry('current.json').catch(() => undefined);
    },
    async read(id, path) {
      const { dirs, name } = split(path);
      try {
        const f = await (await (await walk(root, [id, ...dirs], false)).getFileHandle(name)).getFile();
        return new Blob([f], { type: mimeOf(path) });
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async write(id, path, data) {
      const { dirs, name } = split(path);
      await writeFile(await walk(root, [id, ...dirs], true), name, data);
    },
    async ids() {
      const out: string[] = [];
      for await (const [name, h] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (h.kind === 'directory') out.push(name);
      }
      return out;
    },
    async remove(id) {
      await root.removeEntry(id, { recursive: true }).catch((e: unknown) => {
        if (!notFound(e)) throw e;
      });
    },
  };
}

// ---------------------------------------------------------------- IndexedDB

const CURRENT = '#current';

export function idbStorage(store = createStore('palworld-art', 'files')): ArtStorage {
  return {
    kind: 'idb',
    current: async () => (await get<PackInfo>(CURRENT, store)) ?? null,
    setCurrent: async (info) => (info ? set(CURRENT, info, store) : del(CURRENT, store)),
    async read(id, path) {
      const b = await get<Blob>(`${id}/${path}`, store);
      return b ? new Blob([b], { type: mimeOf(path) }) : null;
    },
    // Copied into a plain Blob: a File from a picked folder can't always be stored
    // as itself once its folder is gone, and the copy is what survives.
    write: async (id, path, data) => set(`${id}/${path}`, new Blob([await data.arrayBuffer()], { type: mimeOf(path) }), store),
    async ids() {
      const all = (await keys(store)).map(String).filter((k) => k !== CURRENT);
      return [...new Set(all.map((k) => k.slice(0, k.indexOf('/'))))];
    },
    async remove(id) {
      const mine = (await keys(store)).filter((k) => String(k).startsWith(`${id}/`));
      if (mine.length) await delMany(mine, store);
    },
  };
}

// ---------------------------------------------------------------- choosing

/** OPFS where it opens, else IndexedDB, else null (storage blocked entirely). */
export async function openStorage(): Promise<ArtStorage | null> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function') return await opfs();
  } catch {
    // Firefox private windows reject getDirectory(): fall through to IndexedDB.
  }
  try {
    if (typeof indexedDB === 'undefined') return null;
    const s = idbStorage();
    await s.current(); // throws when IndexedDB is blocked
    return s;
  } catch {
    return null;
  }
}
