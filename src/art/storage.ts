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
/** Only in dedicated workers; see writeFile for the page. */
type SyncHandle = { write(b: BufferSource, o: { at: number }): number; truncate(n: number): void; flush(): void; close(): void };

async function walk(dir: Dir, parts: string[], create: boolean): Promise<Dir> {
  let d = dir;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}

/**
 * Write one file under the art root. In a worker: a sync access handle, the fastest
 * write there is. On the page: createWritable, then the size is checked, because a
 * WebKit was found reporting success and leaving the file empty; when that fails or
 * createWritable is missing (stable Safari), a small worker writes it with a sync handle.
 */
async function writeFile(root: Dir, parts: string[], name: string, data: Blob): Promise<void> {
  const fh = await (await walk(root, parts, true)).getFileHandle(name, { create: true });
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
  if (typeof fh.createWritable === 'function') {
    try {
      const w = await fh.createWritable();
      await w.write(data);
      await w.close();
      if ((await fh.getFile()).size === data.size) return;
    } catch (e) {
      if ((e as DOMException)?.name === 'QuotaExceededError') throw e;
    }
  }
  await writeInWorker(['art', ...parts], name, data);
  if ((await fh.getFile()).size !== data.size) throw new Error(`This browser didn’t keep ${[...parts, name].join('/')} (it came back the wrong size).`);
}

let writer: Worker | null = null;
let nextWrite = 0;
const waiting = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();

function writeInWorker(parts: string[], name: string, data: Blob): Promise<void> {
  if (!writer) {
    writer = new Worker(new URL('./opfsWrite.worker.ts', import.meta.url), { type: 'module' });
    writer.addEventListener('message', (e: MessageEvent<import('./opfsWrite.worker.ts').WriteReply>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve();
      else w.reject(Object.assign(new Error(e.data.message || `Writing ${name} failed`), { name: e.data.name }));
    });
  }
  const w = writer;
  return data.arrayBuffer().then(
    (buf) =>
      new Promise<void>((resolve, reject) => {
        const id = ++nextWrite;
        waiting.set(id, { resolve, reject });
        w.postMessage({ id, parts, name, data: buf }, [buf]);
      }),
  );
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
      if (info) await writeFile(root, [], 'current.json', new Blob([JSON.stringify(info)], { type: 'application/json' }));
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
      await writeFile(root, [id, ...dirs], name, data);
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
      // Bytes since 2026-10-09; packs stored before that hold Blobs, which still read.
      const v = await get<Blob | ArrayBuffer>(`${id}/${path}`, store);
      return v ? new Blob([v], { type: mimeOf(path) }) : null;
    },
    // Stored as plain bytes, not a Blob: WebKit has refused Blobs in IndexedDB in Safari
    // private windows more than once (WebKit bugs 188438, 198278, 268037), Playwright's
    // Windows WebKit refuses them outright, and reading Blobs back crashed iOS 18.4
    // (292142). Bytes are also a copy that survives the picked folder going away.
    async write(id, path, data) {
      try {
        await set(`${id}/${path}`, await data.arrayBuffer(), store);
      } catch (e) {
        if ((e as DOMException)?.name === 'QuotaExceededError') throw e;
        throw new Error(`This browser wouldn’t store ${path} (${(e as Error)?.name ?? 'IndexedDB refused it'}).`);
      }
    },
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
