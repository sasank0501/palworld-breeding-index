import { describe, expect, it, vi } from 'vitest';

import type { Extractor } from './client.ts';
import { extractorCount, startHelpers } from './pool.ts';

describe('extractorCount', () => {
  it.each([
    [{ hardwareConcurrency: 32, deviceMemory: 8 }, 4, 'a strong machine: four'],
    [{ hardwareConcurrency: 16, deviceMemory: 8 }, 4, 'the measured one: 8 cores, 16 threads'],
    [{ hardwareConcurrency: 12, deviceMemory: 8 }, 3, 'the usual: three'],
    [{ hardwareConcurrency: 8, deviceMemory: 8 }, 3, ''],
    [{ hardwareConcurrency: 6, deviceMemory: 8 }, 2, 'weaker: two'],
    [{ hardwareConcurrency: 4, deviceMemory: 8 }, 2, ''],
    [{ hardwareConcurrency: 2, deviceMemory: 8 }, 1, 'two processors: the page needs one'],
    [{ hardwareConcurrency: 32, deviceMemory: 4 }, 2, 'memory caps it at two'],
    [{ hardwareConcurrency: 16, deviceMemory: 4 }, 2, ''],
    [{ hardwareConcurrency: 16, deviceMemory: 2 }, 1, 'too little memory for two'],
    [{ hardwareConcurrency: 16 }, 2, 'memory unknown (Firefox, Safari): two at most'],
    [{ hardwareConcurrency: 4 }, 2, ''],
    [{ hardwareConcurrency: 2 }, 1, ''],
    [{}, 1, 'nothing known: one, as before'],
  ])('%j -> %i %s', (machine, expected, _why) => {
    expect(extractorCount(machine)).toBe(expected);
  });
});

const pak = new File(['pak'], 'Pal-Windows.pak');
const mappings = new Uint8Array([1, 2, 3]);

function fakeExtractor(over: Partial<Extractor> = {}) {
  const calls: string[] = [];
  const log = (name: string) => (calls.push(name), undefined);
  const x = {
    boot: async () => (log('boot'), { cue4parse: '', runtime: '', bootMs: 1 }),
    mount: async () => (log('mount'), { files: 0, palMeshes: 0, mountMs: 1, reads: 0, bytesRead: 0 }),
    verify: async () => (log('verify'), null),
    listPals: async () => (log('listPals'), { pals: [], animations: 0, aliases: {} }),
    exportPal: async () => {
      throw new Error('unused');
    },
    exportIcons: async () => {
      throw new Error('unused');
    },
    stop: () => log('stop'),
    ...over,
  } as Extractor;
  return { x, calls };
}

describe('startHelpers', () => {
  it('brings each helper to where the first extractor is, in order', async () => {
    const made = [fakeExtractor(), fakeExtractor()];
    let i = 0;
    const helpers = startHelpers(2, pak, mappings, { timeoutMs: 1000, start: () => made[i++].x });
    expect(await helpers.ready).toEqual([made[0].x, made[1].x]);
    for (const m of made) expect(m.calls).toEqual(['boot', 'mount', 'verify', 'listPals']);
  });

  it('leaves out a helper that fails, stops it, and keeps the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const good = fakeExtractor();
    const noMemory = fakeExtractor({ boot: async () => Promise.reject(new Error('out of memory')) });
    const wrongMappings = fakeExtractor({ verify: async () => 'Lamball’s mesh came back empty.' });
    const made = [good, noMemory, wrongMappings];
    let i = 0;
    const helpers = startHelpers(3, pak, mappings, { timeoutMs: 1000, start: () => made[i++].x });
    expect(await helpers.ready).toEqual([good.x]);
    expect(noMemory.calls).toContain('stop');
    expect(wrongMappings.calls).toContain('stop');
    expect(good.calls).not.toContain('stop');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('gives up on a helper that never starts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hung = fakeExtractor({ boot: () => new Promise(() => undefined) });
    const helpers = startHelpers(1, pak, mappings, { timeoutMs: 10, start: () => hung.x });
    expect(await helpers.ready).toEqual([]);
    expect(hung.calls).toContain('stop');
    warn.mockRestore();
  });

  it('stop ends every helper, even one still starting, and none is handed over', async () => {
    let release: () => void = () => undefined;
    const starting = fakeExtractor({ boot: () => new Promise((r) => (release = () => r({ cue4parse: '', runtime: '', bootMs: 1 }))) });
    const helpers = startHelpers(1, pak, mappings, { timeoutMs: 1000, start: () => starting.x });
    helpers.stop();
    release();
    expect(await helpers.ready).toEqual([]);
    expect(starting.calls).toContain('stop');
  });

  it('starts none when asked for none', async () => {
    const helpers = startHelpers(0, pak, mappings, { timeoutMs: 1000, start: () => fakeExtractor().x });
    expect(await helpers.ready).toEqual([]);
  });
});
