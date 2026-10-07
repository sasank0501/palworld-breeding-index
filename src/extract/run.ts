/**
 * Every pal, one at a time (Phase 6, step 5): export it, hand it to `onPal`
 * (step 6's model builder, which writes the art pack), let it go, next.
 *
 * Resumable by design: `isDone` says which pals a previous run already finished
 * (in step 6, the ones whose model is in the pack), and they are skipped. A pal
 * that fails is recorded and the run goes on: one broken pal must not cost the
 * other 332. Stopping is checked between pals; to stop mid-pal, the page ends the
 * worker (Extractor.stop), and that pal simply runs again next time.
 */

import type { Extractor } from './client.ts';
import type { PalExport } from './types.ts';

export interface RunProgress {
  /** Pals finished in this run, including skipped ones. */
  done: number;
  total: number;
  /** The pal being exported now; null between pals and at the end. */
  current: string | null;
  skipped: number;
  failed: Array<{ name: string; error: string }>;
  /** Bytes handed to onPal so far. */
  bytes: number;
  /** Milliseconds spent exporting (not building) so far. */
  ms: number;
}

export interface RunOptions {
  /** Which pals; all of them when absent. */
  only?: readonly string[];
  /** Already finished: skipped without exporting. */
  isDone?: (name: string) => boolean | Promise<boolean>;
  /** Where each pal goes. Its failure counts as the pal's. */
  onPal: (pal: PalExport) => void | Promise<void>;
  onProgress?: (p: RunProgress) => void;
  signal?: AbortSignal;
  /** Texture edge to decode at; 1024 by default. */
  maxEdge?: number;
}

export async function extractAll(x: Pick<Extractor, 'listPals' | 'exportPal'>, opts: RunOptions): Promise<RunProgress> {
  const { pals } = await x.listPals();
  const wanted = opts.only ? pals.filter((p) => opts.only!.some((o) => o.toLowerCase() === p.toLowerCase())) : pals;
  const progress: RunProgress = { done: 0, total: wanted.length, current: null, skipped: 0, failed: [], bytes: 0, ms: 0 };
  const report = () => opts.onProgress?.({ ...progress, failed: [...progress.failed] });
  report();

  for (const name of wanted) {
    opts.signal?.throwIfAborted();
    if (await opts.isDone?.(name)) {
      progress.done++;
      progress.skipped++;
      report();
      continue;
    }
    progress.current = name;
    report();
    try {
      const pal = await x.exportPal(name, opts.maxEdge ?? 1024);
      progress.ms += pal.ms.total;
      progress.bytes += pal.bytes;
      if (!pal.glb) throw new Error(pal.errors[0] ?? 'the mesh didn’t export');
      await opts.onPal(pal);
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      progress.failed.push({ name, error: e instanceof Error ? e.message : String(e) });
    }
    progress.done++;
    progress.current = null;
    report();
  }
  return progress;
}
