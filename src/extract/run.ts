/**
 * Every pal (Phase 6, step 5): export it, hand it to `onPal` (step 6's model
 * builder, which writes the art pack), let it go, next.
 *
 * One extractor does them in order. With helpers (Phase 6b) each extractor takes
 * the next pal off the same list as soon as it is free, so pals finish out of
 * order and `onPal` can be running for two pals at once. Helpers join when they
 * are ready: the run never waits for one to start.
 *
 * Resumable by design: `isDone` says which pals a previous run already finished
 * (in step 6, the ones whose model is in the pack), and they are skipped. A pal
 * that fails is recorded and the run goes on: one broken pal must not cost the
 * other 332. Stopping is checked between pals; to stop mid-pal, the page ends the
 * workers (Extractor.stop), and those pals simply run again next time.
 */

import type { Extractor } from './client.ts';
import { type PalExport, TEXTURE_EDGE } from './types.ts';

export interface RunProgress {
  /** Pals finished in this run, including skipped ones. */
  done: number;
  total: number;
  /** A pal being exported now (the latest started); null between pals and at the end. */
  current: string | null;
  skipped: number;
  failed: Array<{ name: string; error: string }>;
  /** Bytes handed to onPal so far. */
  bytes: number;
  /** Milliseconds spent exporting (not building) so far, summed over the extractors. */
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
  /** Texture edge to decode at; TEXTURE_EDGE by default. */
  maxEdge?: number;
  /**
   * Stop with the first error when this many pals fail before any succeeds: then it's
   * the browser, not the pals (a missing canvas, say), and carrying on would only
   * count failures. Off when absent.
   */
  giveUpAfter?: number;
  /**
   * More extractors on the same game file, sharing the list (src/extract/pool.ts).
   * They start work when this resolves; if it rejects, the run goes on without them.
   */
  helpers?: Promise<ReadonlyArray<Pick<Extractor, 'exportPal'>>>;
}

/**
 * An extractor whose exports fail this many times in a row, while another is still
 * working, is taken to be the broken one (out of memory, say) rather than the pals:
 * it stops, and those pals go back on the list for the others.
 */
const RETIRE_AFTER = 2;

export async function extractAll(x: Pick<Extractor, 'listPals' | 'exportPal'>, opts: RunOptions): Promise<RunProgress> {
  const { pals } = await x.listPals();
  const wanted = opts.only ? pals.filter((p) => opts.only!.some((o) => o.toLowerCase() === p.toLowerCase())) : pals;
  const progress: RunProgress = { done: 0, total: wanted.length, current: null, skipped: 0, failed: [], bytes: 0, ms: 0 };
  const report = () => opts.onProgress?.({ ...progress, failed: [...progress.failed] });
  report();

  let next = 0;
  const again: string[] = []; // pals a retired extractor failed, for another to try
  const triedTwice = new Set<string>();
  const take = () => again.shift() ?? (next < wanted.length ? wanted[next++] : undefined);

  const inFlight: string[] = [];
  const started = (name: string) => {
    inFlight.push(name);
    progress.current = name;
  };
  const finished = (name: string) => {
    inFlight.splice(inFlight.indexOf(name), 1);
    progress.current = inFlight.at(-1) ?? null;
  };

  let succeeded = 0;
  let working = 0; // extractors still taking pals
  let ended: { error: unknown } | null = null; // a stop or a give-up: every extractor winds down

  /** One extractor's share: pals off the list until it is empty, the run ends, or this extractor retires. */
  async function work(ex: Pick<Extractor, 'exportPal'>): Promise<void> {
    working++;
    const streak: string[] = []; // this extractor's exports that failed in a row
    try {
      for (;;) {
        if (ended) return;
        opts.signal?.throwIfAborted();
        const name = take();
        if (name === undefined) return;
        if (await opts.isDone?.(name)) {
          progress.done++;
          progress.skipped++;
          report();
          continue;
        }
        started(name);
        report();
        let exportFailed = true;
        try {
          const pal = await ex.exportPal(name, opts.maxEdge ?? TEXTURE_EDGE);
          progress.ms += pal.ms.total;
          progress.bytes += pal.bytes;
          if (!pal.glb) throw new Error(pal.errors[0] ?? 'the mesh didn’t export');
          exportFailed = false;
          streak.length = 0;
          await opts.onPal(pal);
          succeeded++;
        } catch (e) {
          if (opts.signal?.aborted) throw e;
          // Some engines reject with an empty error (null, no message): say something useful.
          progress.failed.push({ name, error: e instanceof Error ? e.message : e ? String(e) : 'the browser gave no reason' });
          if (exportFailed) streak.push(name);
          if (streak.length >= RETIRE_AFTER && working > 1) {
            // Hand this extractor's failures to the others, once each: a pal that fails
            // there too really is broken, and stays recorded.
            for (const failedName of streak) {
              if (triedTwice.has(failedName)) continue;
              triedTwice.add(failedName);
              progress.failed.splice(progress.failed.findIndex((f) => f.name === failedName), 1);
              progress.done--;
              again.push(failedName);
            }
            progress.done++;
            finished(name);
            report();
            return;
          }
          if (opts.giveUpAfter && !succeeded && progress.failed.length >= opts.giveUpAfter) {
            throw new Error(`No pal could be made in this browser. The first error: ${progress.failed[0].error}`);
          }
        }
        progress.done++;
        finished(name);
        report();
      }
    } catch (e) {
      ended ??= { error: e };
    } finally {
      working--;
    }
  }

  // The first extractor starts now; helpers join if they are ready before the work is over.
  // Every extractor is waited for, so nothing is still writing when this returns or throws.
  const running = new Set<Promise<void>>();
  const start = (ex: Pick<Extractor, 'exportPal'>) => {
    const p = work(ex).finally(() => running.delete(p));
    running.add(p);
  };
  let closed = false;
  start(x);
  void opts.helpers?.then(
    (helpers) => {
      if (!closed && !ended) helpers.forEach(start);
    },
    () => undefined,
  );
  while (running.size) await Promise.all(running);
  closed = true;

  if (ended) throw (ended as { error: unknown }).error;
  progress.current = null;
  return progress;
}
