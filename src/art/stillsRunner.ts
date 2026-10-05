/**
 * Runs the card-picture maker (src/art/stills.ts) for the pack in this browser:
 * on its own whenever the pack has models without pictures (right after an art
 * load, or on a later visit if a run was stopped), one run at a time. Its state
 * is shared, so the notice and the settings panel show the same progress.
 */

import { useSyncExternalStore } from 'react';

import { artState, artUrl, stillsChanged } from './resolve.ts';
import { makeStills, type StillsProgress } from './stills.ts';

export type StillsStage =
  | { kind: 'idle' }
  | ({ kind: 'making' } & StillsProgress)
  | { kind: 'done'; made: number; failed: number; seconds: number; failures: string[] }
  | { kind: 'stopped'; done: number; total: number }
  | { kind: 'error'; message: string };

let stage: StillsStage = { kind: 'idle' };
const subs = new Set<() => void>();
const set = (s: StillsStage) => {
  stage = s;
  for (const f of subs) f();
};
let running: AbortController | null = null;

export function useStillsStage(): StillsStage {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => stage,
  );
}

/** Make any missing pictures. A no-op when they all exist or a run is going. */
export async function ensureStills(): Promise<void> {
  if (running) return;
  const s = await artState();
  if (s.kind !== 'local') return;
  running = new AbortController();
  const t0 = performance.now();
  let last: StillsProgress | null = null;
  try {
    const result = await makeStills(
      s.storage,
      s.info,
      (path) => artUrl(path),
      (p) => {
        last = p;
        set({ kind: 'making', ...p });
      },
      () => stillsChanged(),
      running.signal,
    );
    if (result.total) {
      // Record the new picture count in the pack's description.
      const index = await s.storage.read(s.info.id, 'pal-portraits/index.json');
      const files = index ? new Set(Object.values(JSON.parse(await index.text()) as Record<string, { file: string }>).map((e) => e.file)) : new Set();
      const info = { ...s.info, stills: files.size };
      await s.storage.setCurrent(info).catch(() => undefined);
      stillsChanged(info);
      set({ kind: 'done', made: result.total - result.failed, failed: result.failed, seconds: Math.round((performance.now() - t0) / 1000), failures: result.failures });
      if (result.failures.length) console.warn('Card pictures that could not be made:', result.failures);
    } else set({ kind: 'idle' });
  } catch (e) {
    const p = last as StillsProgress | null;
    if (running?.signal.aborted) set({ kind: 'stopped', done: p?.done ?? 0, total: p?.total ?? 0 });
    else set({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    running = null;
  }
}

export function stopStills(): void {
  running?.abort();
}
