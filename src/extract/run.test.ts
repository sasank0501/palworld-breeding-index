import { describe, expect, it } from 'vitest';

import { extractAll, type RunProgress } from './run.ts';
import type { PalExport } from './types.ts';

const exported = (name: string, glb = true): PalExport => ({
  name,
  mesh: `SK_${name}`,
  glb: glb ? new Uint8Array(100) : null,
  materials: {},
  textures: [],
  animations: [],
  errors: glb ? [] : ['mesh: NullReferenceException'],
  ms: { mesh: 1, textures: 1, animations: 1, total: 10 },
  reads: 3,
  bytes: glb ? 100 : 0,
  heapMB: 400,
});

/** A stand-in extractor over a list of pals; `broken` ones throw, `meshless` ones have no glb. */
function fake(pals: string[], { broken = [] as string[], meshless = [] as string[] } = {}) {
  const asked: string[] = [];
  return {
    asked,
    x: {
      listPals: async () => ({ pals, animations: 0, aliases: {} }),
      exportPal: async (name: string) => {
        asked.push(name);
        if (broken.includes(name)) throw new Error('the worker crashed');
        return exported(name, !meshless.includes(name));
      },
    },
  };
}

describe('extractAll', () => {
  it('hands every pal to onPal, in order, and counts what moved', async () => {
    const { x } = fake(['Anubis', 'SheepBall', 'JetDragon']);
    const got: string[] = [];
    const end = await extractAll(x, { onPal: (p) => void got.push(p.name) });
    expect(got).toEqual(['Anubis', 'SheepBall', 'JetDragon']);
    expect(end).toMatchObject({ done: 3, total: 3, skipped: 0, failed: [], bytes: 300, ms: 30, current: null });
  });

  it('skips what a previous run finished: resuming costs nothing', async () => {
    const { x, asked } = fake(['Anubis', 'SheepBall', 'JetDragon']);
    const end = await extractAll(x, { isDone: (n) => n !== 'JetDragon', onPal: () => undefined });
    expect(asked).toEqual(['JetDragon']);
    expect(end).toMatchObject({ done: 3, skipped: 2 });
  });

  it('records a failing pal and carries on with the rest', async () => {
    const { x } = fake(['A', 'B', 'C', 'D'], { broken: ['B'], meshless: ['C'] });
    const built: string[] = [];
    const end = await extractAll(x, {
      onPal: (p) => {
        if (p.name === 'D') throw new Error('builder failed');
        built.push(p.name);
      },
    });
    expect(built).toEqual(['A']);
    expect(end.failed).toEqual([
      { name: 'B', error: 'the worker crashed' },
      { name: 'C', error: 'mesh: NullReferenceException' },
      { name: 'D', error: 'builder failed' },
    ]);
    expect(end.done).toBe(4);
  });

  it('runs only the pals asked for, ignoring case', async () => {
    const { x, asked } = fake(['Anubis', 'SheepBall', 'JetDragon']);
    await extractAll(x, { only: ['sheepball'], onPal: () => undefined });
    expect(asked).toEqual(['SheepBall']);
  });

  it('stops between pals when asked, and reports progress as it goes', async () => {
    const { x, asked } = fake(['A', 'B', 'C']);
    const stop = new AbortController();
    const seen: RunProgress[] = [];
    const run = extractAll(x, {
      signal: stop.signal,
      onProgress: (p) => seen.push(p),
      onPal: (p) => {
        if (p.name === 'B') stop.abort();
      },
    });
    await expect(run).rejects.toThrow();
    expect(asked).toEqual(['A', 'B']);
    expect(seen.find((p) => p.current === 'B')).toMatchObject({ done: 1, total: 3 });
  });

  it('gives up with the first error when the first pals all fail: the browser, not the pals', async () => {
    const { x, asked } = fake(['A', 'B', 'C', 'D', 'E']);
    const run = extractAll(x, {
      giveUpAfter: 3,
      onPal: () => {
        throw new Error('OffscreenCanvas is not defined');
      },
    });
    await expect(run).rejects.toThrow('No pal could be made in this browser. The first error: OffscreenCanvas is not defined');
    expect(asked).toEqual(['A', 'B', 'C']);
  });

  it('keeps going past failures once a pal has worked', async () => {
    const { x } = fake(['A', 'B', 'C', 'D', 'E'], { broken: ['B', 'C', 'D'] });
    const end = await extractAll(x, { giveUpAfter: 3, onPal: () => undefined });
    expect(end.failed.map((f) => f.name)).toEqual(['B', 'C', 'D']);
    expect(end.done).toBe(5);
  });
});

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));
const NAMES = Array.from({ length: 12 }, (_, i) => `P${i}`);

/** An extractor that takes a moment per pal, so two of them really interleave. */
function slow(opts: { fails?: (name: string) => boolean; ms?: number } = {}) {
  const asked: string[] = [];
  return {
    asked,
    exportPal: async (name: string) => {
      asked.push(name);
      await tick(opts.ms ?? 1);
      if (opts.fails?.(name)) throw new Error('out of memory');
      return exported(name);
    },
  };
}
const first = (ex: ReturnType<typeof slow>) => ({ ...ex, listPals: async () => ({ pals: NAMES, animations: 0, aliases: {} }) });

describe('extractAll with helpers', () => {
  it('shares one list: every pal is built once, and each extractor does some', async () => {
    const a = slow();
    const b = slow();
    const built: string[] = [];
    const end = await extractAll(first(a), { helpers: Promise.resolve([b]), onPal: (p) => void built.push(p.name) });
    expect([...built].sort()).toEqual([...NAMES].sort());
    expect(a.asked.length).toBeGreaterThan(0);
    expect(b.asked.length).toBeGreaterThan(0);
    expect(a.asked.length + b.asked.length).toBe(NAMES.length);
    expect(end).toMatchObject({ done: 12, total: 12, failed: [], current: null, ms: 120 });
  });

  it('retires an extractor that keeps failing and gives its pals to the other', async () => {
    const a = slow();
    const sick = slow({ fails: () => true });
    const built: string[] = [];
    const end = await extractAll(first(a), { helpers: Promise.resolve([sick]), onPal: (p) => void built.push(p.name) });
    expect(sick.asked).toHaveLength(2); // two failures in a row, then it stops taking pals
    expect([...built].sort()).toEqual([...NAMES].sort());
    expect(end.failed).toEqual([]);
    expect(end.done).toBe(12);
  });

  it('still records a pal that fails on every extractor, once', async () => {
    const bad = (name: string) => name === 'P1' || name === 'P2' || name === 'P3';
    const a = slow({ fails: bad });
    const b = slow({ fails: bad });
    const end = await extractAll(first(a), { helpers: Promise.resolve([b]), onPal: () => undefined });
    expect(end.failed.map((f) => f.name).sort()).toEqual(['P1', 'P2', 'P3']);
    expect(end.done).toBe(12);
  });

  it('does not retire an extractor over the page’s own failures (onPal)', async () => {
    const a = slow();
    const b = slow();
    const end = await extractAll(first(a), {
      helpers: Promise.resolve([b]),
      onPal: (p) => {
        if (p.name !== 'P0') throw new Error('builder failed');
      },
    });
    expect(end.failed).toHaveLength(11);
    expect(a.asked.length + b.asked.length).toBe(NAMES.length); // nothing was retried
  });

  it('waits for every extractor on a stop: nothing is handed over afterwards', async () => {
    const a = slow({ ms: 5 });
    const b = slow({ ms: 5 });
    const stop = new AbortController();
    let handed = 0;
    let rejected = false;
    const run = extractAll(first(a), {
      signal: stop.signal,
      helpers: Promise.resolve([b]),
      onPal: () => {
        expect(rejected).toBe(false);
        if (++handed === 3) stop.abort();
      },
    }).catch((e: unknown) => {
      rejected = true;
      throw e;
    });
    await expect(run).rejects.toThrow();
    const after = handed;
    await tick(30);
    expect(handed).toBe(after);
    expect(handed).toBeLessThan(NAMES.length);
  });

  it('goes on alone when the helpers never start', async () => {
    const a = slow();
    const end = await extractAll(first(a), { helpers: Promise.reject(new Error('no memory')), onPal: () => undefined });
    expect(a.asked).toEqual(NAMES);
    expect(end.done).toBe(12);
  });

  it('does not wait for helpers that are still starting when the work is done', async () => {
    const a = slow();
    const late = slow();
    const end = await extractAll(first(a), { helpers: tick(200).then(() => [late]), onPal: () => undefined });
    expect(end.done).toBe(12);
    await tick(250);
    expect(late.asked).toEqual([]);
  });
});
