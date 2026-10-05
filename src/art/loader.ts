/**
 * Loading an art pack from a folder the player picks: one shared state, so the
 * "add the art" notice and the settings panel show the same progress.
 *
 * Today the folder is one `npm run make-art-pack` built. Phase 6 replaces the
 * folder with the game folder and an extractor writing the same pack.
 */

import { useSyncExternalStore } from 'react';

import type { FromArtWorker } from './art.worker.ts';
import { describePack, selectPackFiles, type PackInfo } from './pack.ts';
import { artChanged } from './resolve.ts';
import { openStorage } from './storage.ts';
import { removePack } from './store-pack.ts';

export type LoadStage =
  | { kind: 'idle' }
  | { kind: 'picking' }
  | { kind: 'loading'; done: number; total: number; bytes: number; totalBytes: number }
  | { kind: 'done'; info: PackInfo; persisted: boolean }
  | { kind: 'error'; message: string };

let stage: LoadStage = { kind: 'idle' };
const subs = new Set<() => void>();
const setStage = (s: LoadStage) => {
  stage = s;
  for (const f of subs) f();
};
let worker: Worker | null = null;

export function useLoadStage(): LoadStage {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => stage,
  );
}

function pickFolder(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Ask the browser to keep the site's storage under disk pressure. Chrome decides
 * from how the site is used and may say no at first; Firefox asks the player.
 */
async function persist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) || ((await navigator.storage?.persist?.()) ?? false);
  } catch {
    return false;
  }
}

export async function loadArtFolder(): Promise<void> {
  if (stage.kind === 'loading' || stage.kind === 'picking') return;
  setStage({ kind: 'picking' });
  const picked = await pickFolder();
  if (!picked) return setStage({ kind: 'idle' });

  const files = selectPackFiles(picked.map((file) => ({ path: file.webkitRelativePath || file.name, file, size: file.size })));
  const summary = describePack(files);
  if (summary.problem) return setStage({ kind: 'error', message: summary.problem });

  setStage({ kind: 'loading', done: 0, total: files.length, bytes: 0, totalBytes: summary.bytes });
  worker ??= new Worker(new URL('./art.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = async (e: MessageEvent<FromArtWorker>) => {
    const m = e.data;
    if (m.type === 'progress') setStage({ kind: 'loading', done: m.done, total: m.total, bytes: m.bytes, totalBytes: m.totalBytes });
    else if (m.type === 'error') setStage(m.cancelled ? { kind: 'idle' } : { kind: 'error', message: m.message });
    else {
      artChanged();
      setStage({ kind: 'done', info: m.info, persisted: await persist() });
    }
  };
  worker.onerror = () => setStage({ kind: 'error', message: 'The art loader stopped unexpectedly. Reload the page and try again.' });
  worker.postMessage({ type: 'load', files });
}

export function cancelArtLoad(): void {
  worker?.postMessage({ type: 'cancel' });
}

export async function removeArt(): Promise<void> {
  const storage = await openStorage();
  if (storage) await removePack(storage);
  artChanged();
  setStage({ kind: 'idle' });
}

export const formatBytes = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
