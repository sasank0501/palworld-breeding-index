/// <reference lib="webworker" />
/**
 * Loads an art pack off the page's thread. In a worker OPFS has synchronous file
 * handles, the fastest way to write (and on some browsers the only one), and a
 * 180 MB copy never stutters the page.
 *
 *   page -> { type: 'load', files }   the pack files picked from a folder
 *   worker -> { type: 'progress', ... } ... { type: 'done', info } or { type: 'error' }
 *   page -> { type: 'cancel' }
 */

import type { PackFile, PackInfo } from './pack.ts';
import { storePack, type Progress } from './store-pack.ts';
import { openStorage } from './storage.ts';

export type ToArtWorker = { type: 'load'; files: Array<PackFile<File>> } | { type: 'cancel' };
export type FromArtWorker =
  | ({ type: 'progress' } & Progress)
  | { type: 'done'; info: PackInfo; backend: 'opfs' | 'idb' }
  | { type: 'error'; message: string; cancelled?: boolean };

const post = (m: FromArtWorker) => postMessage(m);
let abort: AbortController | null = null;

function explain(e: unknown): string {
  const name = (e as DOMException)?.name;
  if (name === 'QuotaExceededError') return 'This browser has run out of room for the art. Free some disk space, or try another browser.';
  if (name === 'NotReadableError' || name === 'NotFoundError') return 'A file in the art folder changed or moved while it was being read. Pick the folder again.';
  return e instanceof Error ? e.message : String(e);
}

onmessage = async (e: MessageEvent<ToArtWorker>) => {
  const m = e.data;
  if (m.type === 'cancel') {
    abort?.abort();
    return;
  }
  abort = new AbortController();
  try {
    const storage = await openStorage();
    if (!storage) throw new Error('This browser is blocking site storage, so the art has nowhere to go. Allow site data for this page and try again.');
    let last = 0;
    const info = await storePack(
      storage,
      m.files,
      'folder',
      (p) => {
        // A message per file would flood the page; ten a second is plenty.
        const now = performance.now();
        if (now - last > 100 || p.done === p.total) {
          last = now;
          post({ type: 'progress', ...p });
        }
      },
      abort.signal,
    );
    post({ type: 'done', info, backend: storage.kind });
  } catch (err) {
    const cancelled = abort?.signal.aborted ?? false;
    post({ type: 'error', message: cancelled ? 'Stopped. The art you had before is unchanged.' : explain(err), cancelled });
  } finally {
    abort = null;
  }
};
