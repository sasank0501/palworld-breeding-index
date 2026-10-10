/**
 * The player's extraction (Phase 6): game file in, art pack out, as one shared
 * state, so the "add the art" notice and the settings panel show the same thing.
 * The pieces are the ones the bench (#extract) proved: start .NET, open the pak,
 * find mappings, then extractToPack. Leaving the page stops the run; the pack it
 * was filling stays and the next run carries on from it (the file has to be
 * chosen again: a browser can't keep a picked file across visits).
 */

import { useSyncExternalStore } from 'react';

import { acceptPlayerFile, findMappings, mappingsStore, type Attempt, type MappingsStatus } from '../art/mappings.ts';
import { artChanged } from '../art/resolve.ts';
import pals from '../data/pals.json';
import { buildSpeciesIndex, type PalDexEntry } from '../save/species.ts';
import { openStorage } from '../art/storage.ts';
import { startExtractor, type Extractor } from './client.ts';
import { extractToPack, type PipelineProgress } from './pipeline.ts';

export type ExtractStage =
  | { kind: 'idle' }
  | { kind: 'starting'; step: string }
  /** No mappings source worked: the player can give a file. */
  | { kind: 'needMappings'; attempts: Attempt[]; problem: string | null; checking: boolean }
  | { kind: 'running'; progress: PipelineProgress; msPerPal: number | null }
  | { kind: 'done'; models: number; failed: Array<{ name: string; error: string }>; seconds: number }
  | { kind: 'stopped'; done: number; total: number }
  | { kind: 'error'; message: string };

let stage: ExtractStage = { kind: 'idle' };
const subs = new Set<() => void>();
const set = (s: ExtractStage) => {
  stage = s;
  for (const f of subs) f();
};

export function useExtractStage(): ExtractStage {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => stage,
  );
}

const species = buildSpeciesIndex(pals as unknown as Record<string, PalDexEntry>);

/** The pal's name as players know it ("Azurobe" for BlueSkyDragon); null for meshes that are no dex species. */
export function palName(codename: string): string | null {
  const m = species.lookup(codename);
  return m ? ((pals as Record<string, { name: string }>)[m.palId]?.name ?? null) : null;
}

export const isExtracting =(s: ExtractStage): boolean => s.kind === 'starting' || s.kind === 'running' || s.kind === 'needMappings';

let extractor: Extractor | null = null;
let abort: AbortController | null = null;
/** Set while the run waits for the player's mappings file. */
let mappingsWaiter: ((file: File) => void) | null = null;

/** .NET can hang on start in rare cases (dotnet/runtime#114918 mentions Chrome); don't wait forever. */
const BOOT_TIMEOUT = 90_000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

const describeMappings = (s: MappingsStatus) =>
  s.step === 'list' ? 'Looking for the game’s field list…' : s.step === 'download' ? `Downloading the field list (${s.label})…` : 'Checking it against your game…';

/** The browser's "leave site?" question while a run is going: leaving stops it. */
const askBeforeLeaving = (e: BeforeUnloadEvent) => e.preventDefault();

function release() {
  window.removeEventListener('beforeunload', askBeforeLeaving);
  // The extractor holds ~500 MB of WebAssembly memory: let it go as soon as the run ends.
  extractor?.stop();
  extractor = null;
  abort = null;
  mappingsWaiter = null;
}

export async function startExtraction(pak: File): Promise<void> {
  if (isExtracting(stage)) return;
  abort = new AbortController();
  const signal = abort.signal;
  window.addEventListener('beforeunload', askBeforeLeaving);
  const t0 = performance.now();
  try {
    set({ kind: 'starting', step: 'Starting the reader (about 40 MB the first time)…' });
    const x = (extractor = startExtractor());
    await withTimeout(x.boot(), BOOT_TIMEOUT, 'The game reader didn’t start. Reload the page and try again.');
    signal.throwIfAborted();
    set({ kind: 'starting', step: 'Opening the game file…' });
    await x.mount(pak);
    signal.throwIfAborted();

    const store = mappingsStore();
    const found = await findMappings({ store, verify: x.verify, signal, onStatus: (s) => set({ kind: 'starting', step: describeMappings(s) }) });
    if (!found.ok) {
      // Wait for a file from the player, as many tries as they like, or a stop.
      let problem: string | null = null;
      for (;;) {
        set({ kind: 'needMappings', attempts: found.attempts, problem, checking: false });
        const file = await new Promise<File>((resolve, reject) => {
          mappingsWaiter = resolve;
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
        set({ kind: 'needMappings', attempts: found.attempts, problem: null, checking: true });
        const r = await acceptPlayerFile(file, { store, verify: x.verify });
        if (r.ok) break;
        problem = r.problem;
      }
    }

    const storage = await openStorage();
    if (!storage) throw new Error('This browser is blocking site storage, so the art has nowhere to go. Allow site data for this page and try again.');
    const [{ buildModel, foldAliases, manifestText }, { encodeImage }] = await Promise.all([import('./model/build.ts'), import('./model/encodeImage.ts')]);

    // Time left comes from the pals built in this run (resumed ones cost nothing).
    let runStart = 0;
    const result = await extractToPack(x, storage, {
      build: (pal) => buildModel(pal, { encode: encodeImage }),
      foldAliases,
      manifestText,
      signal,
      onChange: artChanged,
      onProgress: (p) => {
        if (p.phase === 'models' && !runStart) runStart = performance.now();
        const built = p.done - p.resumed;
        set({ kind: 'running', progress: p, msPerPal: built >= 3 ? (performance.now() - runStart) / built : null });
      },
    });
    release();
    artChanged();
    set({ kind: 'done', models: result.info.models, failed: result.failed, seconds: Math.round((performance.now() - t0) / 1000) });
    if (result.failed.length) console.warn('Pals that could not be extracted:', result.failed);
    // Like the folder load: ask the browser to keep the art under disk pressure.
    void navigator.storage?.persist?.().catch(() => false);
  } catch (e) {
    const p = stage.kind === 'running' ? stage.progress : null;
    const stopped = signal.aborted;
    release();
    artChanged();
    if (stopped) set(p ? { kind: 'stopped', done: p.done, total: p.total } : { kind: 'idle' });
    else set({ kind: 'error', message: explain(e) });
  }
}

function explain(e: unknown): string {
  const name = (e as DOMException)?.name;
  if (name === 'QuotaExceededError') return 'This browser has run out of room for the art (about 210 MB). Free some disk space, or try another browser.';
  if (name === 'NotReadableError' || name === 'NotFoundError') return 'The game file changed or moved while it was being read (did Steam update the game?). Choose it again.';
  return e instanceof Error ? e.message : String(e);
}

/** The player's .usmap file, while the run is waiting for one. */
export function giveMappingsFile(file: File): void {
  mappingsWaiter?.(file);
  mappingsWaiter = null;
}

/** Stop between pals; what is written stays, and the next run carries on from it. */
export function stopExtraction(): void {
  abort?.abort();
}

/** Back to the start after an error or a finished run's message. */
export function dismissExtraction(): void {
  if (!isExtracting(stage)) set({ kind: 'idle' });
}
