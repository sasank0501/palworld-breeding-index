/**
 * More than one extractor on the same game file (Phase 6b). The .NET reader is
 * interpreted WebAssembly on one thread, and it is four fifths of a run's time, so
 * the way to go faster is to run more of them: each takes pals off the same list
 * (src/extract/run.ts). Measured in Edge on 8 cores (16 threads), all 333 pals:
 * one took 485 s, two about 213 s, three 143 s, four 115 s, and the packs were
 * byte for byte the same (docs/WEBSITE-PLAN.md, Phase 6b).
 *
 * The cost is memory: each one is its own runtime with its own copy of the game's
 * file index, about half a gigabyte, which WebAssembly never gives back (the
 * browser peaked at 1.5, 2.1, 2.5 and 3.0 GB in those runs). So the count comes
 * from the machine, and a helper that can't start is simply left out: the run is
 * slower, never broken.
 */

import { startExtractor, type Extractor } from './client.ts';

/** What the count is read from: `navigator`, or a stand-in in tests. */
export interface MachineHints {
  hardwareConcurrency?: number;
  /** Gigabytes, rounded down to a power of two and capped at 8. Chrome and Edge only. */
  deviceMemory?: number;
}

/**
 * How many extractors to run at once: half the logical processors (the page builds
 * the models on its own thread, and the machine should stay usable), capped by
 * memory. Where the browser won't say how much memory there is (Firefox, Safari),
 * two is the most: about a gigabyte.
 */
export function extractorCount(machine: MachineHints = navigator): number {
  const byProcessors = Math.floor((machine.hardwareConcurrency || 2) / 2);
  const memory = machine.deviceMemory;
  const byMemory = memory === undefined ? 2 : memory >= 8 ? 3 : memory >= 4 ? 2 : 1;
  return Math.max(1, Math.min(byProcessors, byMemory));
}

export interface HelperOptions {
  /** How long a helper may take to start before it is left out. */
  timeoutMs: number;
  /** Stand-in for startExtractor, in tests. */
  start?: () => Extractor;
}

export interface Helpers {
  /** The helpers that started and passed the mappings check; never rejects. */
  ready: Promise<Extractor[]>;
  /** End every helper, started or still starting, and free its memory. */
  stop(): void;
}

/**
 * Start `count` more extractors on `pak`, each brought to where the first one is:
 * runtime started, game file open, mappings checked, pals listed (exportPal needs
 * the list). They start side by side; the runtime's files are already in the
 * browser's cache from the first extractor.
 */
export function startHelpers(count: number, pak: File, mappings: Uint8Array, { timeoutMs, start = startExtractor }: HelperOptions): Helpers {
  const all: Extractor[] = [];
  let stopped = false;

  async function one(): Promise<Extractor | null> {
    const x = start();
    all.push(x);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await x.boot();
          await x.mount(pak);
          const problem = await x.verify(mappings);
          if (problem) throw new Error(problem);
          await x.listPals();
        })(),
        new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('a helper took too long to start')), timeoutMs))),
      ]);
      return stopped ? null : x;
    } catch (e) {
      if (!stopped) console.warn('An extra extractor didn’t start; carrying on without it.', e);
      x.stop();
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ready: Promise.all(Array.from({ length: Math.max(0, count) }, one)).then((xs) => xs.filter((x): x is Extractor => x !== null)),
    stop() {
      stopped = true;
      for (const x of all) x.stop();
    },
  };
}
