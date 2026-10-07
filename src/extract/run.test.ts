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
});
