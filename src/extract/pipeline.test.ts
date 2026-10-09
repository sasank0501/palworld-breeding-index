import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';

import { idbStorage } from '../art/storage.ts';
import type { Extractor } from './client.ts';
import { foldAliases, manifestText, type BuiltModel, type ModelEntry } from './model/build.ts';
import { extractToPack } from './pipeline.ts';
import type { PalExport } from './types.ts';

let n = 0;
const fresh = () => idbStorage(createStore(`pipeline-test-${++n}`, 'files'));

const PALS = ['Alpaca', 'Anubis', 'Lamball', 'Horus'];
const entry = (): ModelEntry => ({ v: 1, chibi: true, anim: null, chibiAnim: 'Rest', clips: ['Rest'], head: 2, normal: false });

function fakeExtractor(opts: { failOn?: string } = {}): Pick<Extractor, 'listPals' | 'exportPal' | 'exportIcons'> & { exported: string[] } {
  const exported: string[] = [];
  return {
    exported,
    listPals: async () => ({ pals: PALS, animations: 0, aliases: { Alpaca_Dark: 'Alpaca', Anubis: 'Alpaca' } }),
    exportIcons: async () => ({
      icons: [{ codename: 'Alpaca', path: 'pals/alpaca.webp', size: 256, blob: new Blob(['icon']) }],
      failed: [],
      unmatched: [],
      ms: 1,
    }),
    exportPal: async (name) => {
      if (name === opts.failOn) throw new Error('mesh missing');
      exported.push(name);
      return { name, glb: new Uint8Array([1]), ms: { total: 1 }, bytes: 1, errors: [] } as unknown as PalExport;
    },
  };
}

const build = async (pal: PalExport): Promise<BuiltModel> => ({ glb: new Uint8Array([7, 7, 7]), entry: entry(), notes: [`${pal.name} built`] });
const base = { build, foldAliases, manifestText };

describe('extractToPack', () => {
  it('writes icons and every model, folds aliases, and ends with a complete live pack', async () => {
    const s = fresh();
    const x = fakeExtractor();
    const r = await extractToPack(x, s, base);

    expect(x.exported).toEqual(PALS);
    expect(r.info).toMatchObject({ complete: true, source: 'extractor', models: 4, icons: 1 });
    expect(await s.current()).toEqual(r.info);

    const manifest = JSON.parse(await (await s.read(r.info.id, 'pal-models/index.json'))!.text()) as Record<string, ModelEntry>;
    expect(Object.keys(manifest).sort()).toEqual(['Alpaca', 'Alpaca_Dark', 'Anubis', 'Horus', 'Lamball']);
    expect(manifest.Alpaca_Dark.file).toBe('Alpaca');
    expect(manifest.Anubis.file).toBeUndefined(); // a model of its own beats an alias
    expect(await s.read(r.info.id, 'pal-models/Lamball.chibi.glb')).not.toBeNull();
    expect(await s.read(r.info.id, 'pals/alpaca.webp')).not.toBeNull();
  });

  it('keeps a stopped run live but incomplete, and the next run finishes it without redoing pals', async () => {
    const s = fresh();
    const stop = new AbortController();
    const first = fakeExtractor();
    let built = 0;
    await expect(
      extractToPack(first, s, {
        ...base,
        signal: stop.signal,
        build: async (pal) => {
          if (++built === 3) stop.abort();
          return build(pal);
        },
      }),
    ).rejects.toThrow();

    const partial = (await s.current())!;
    expect(partial).toMatchObject({ complete: false, source: 'extractor', icons: 1 });
    expect(partial.models).toBeGreaterThanOrEqual(2);

    const second = fakeExtractor();
    const r = await extractToPack(second, s, base);
    expect(r.info.id).toBe(partial.id); // the same pack, continued
    expect(r.info.complete).toBe(true);
    expect(second.exported.length).toBeLessThan(PALS.length);
    expect(second.exported).not.toContain('Alpaca');
    expect(r.info.models).toBe(4);
  });

  it('records a pal that fails and still completes the pack', async () => {
    const s = fresh();
    const r = await extractToPack(fakeExtractor({ failOn: 'Anubis' }), s, base);
    expect(r.failed).toEqual([{ name: 'Anubis', error: 'mesh missing' }]);
    expect(r.info.complete).toBe(true);
    expect(r.info.models).toBe(3);
  });

  it('replaces an older pack once its icons are in, and deletes the old files when the new pack is complete', async () => {
    const s = fresh();
    const old = await extractToPack(fakeExtractor(), s, base);

    const stop = new AbortController();
    let built = 0;
    await expect(
      extractToPack(fakeExtractor(), s, { ...base, signal: stop.signal, build: async (pal) => (++built === 2 && stop.abort(), build(pal)) }),
    ).rejects.toThrow();
    const partial = (await s.current())!;
    expect(partial.id).not.toBe(old.info.id);
    expect(partial.complete).toBe(false);
    expect((await s.ids()).sort()).toEqual([old.info.id, partial.id].sort()); // old files kept until the new pack is whole

    const done = await extractToPack(fakeExtractor(), s, base);
    expect(done.info.id).toBe(partial.id);
    expect(await s.ids()).toEqual([partial.id]);
  });
});
