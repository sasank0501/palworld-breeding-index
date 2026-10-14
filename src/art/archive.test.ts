import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';

import { archiveParts, readArchive } from './archive.ts';
import { idbStorage } from './storage.ts';
import { storePack } from './store-pack.ts';

const PACK = [
  ['pals/anubis.webp', 'icon-bytes'],
  ['pal-portraits/index.json', '{"Anubis":"Anubis.webp"}'],
  ['pal-portraits/Anubis.webp', 'still'],
  ['pal-models/index.json', '{"Anubis":{}}'],
  ['pal-models/Anubis.chibi.glb', 'a model, the longest file here'],
] as const;
const files = (): Array<{ path: string; blob: Blob }> => PACK.map(([path, text]) => ({ path, blob: new Blob([text]) }));
const archive = (list = files()) => new Blob(archiveParts(list, '2026-10-13T00:00:00.000Z'));

describe('a saved copy of the art', () => {
  it('reads back every file, byte for byte, with what the pack holds', async () => {
    const r = await readArchive(archive());
    if (!r.ok) throw new Error(r.problem);
    expect(r).toMatchObject({ createdAt: '2026-10-13T00:00:00.000Z', models: 1, stills: 1, icons: 1 });
    expect(r.files.map((f) => f.path)).toEqual(PACK.map(([p]) => p));
    for (const [i, f] of r.files.entries()) {
      expect(await f.file.text()).toBe(PACK[i][1]);
      expect(f.size).toBe(PACK[i][1].length);
    }
  });

  it('goes through the pack writer into storage like a picked folder', async () => {
    const r = await readArchive(archive());
    if (!r.ok) throw new Error(r.problem);
    const s = idbStorage(createStore('archive-test-1', 'files'));
    const info = await storePack(s, r.files, 'folder');
    expect(info).toMatchObject({ complete: true, models: 1, stills: 1, icons: 1, files: 5 });
    expect(await (await s.read(info.id, 'pal-models/Anubis.chibi.glb'))?.text()).toBe('a model, the longest file here');
  });

  it('is made from a stored pack and loads back the same', async () => {
    const s = idbStorage(createStore('archive-test-2', 'files'));
    const first = await readArchive(archive());
    if (!first.ok) throw new Error(first.problem);
    const info = await storePack(s, first.files, 'folder');
    const paths = await s.list(info.id);
    expect([...paths].sort()).toEqual(PACK.map(([p]) => p).sort());
    const again = new Blob(archiveParts(await Promise.all(paths.map(async (path) => ({ path, blob: (await s.read(info.id, path))! })))));
    const r = await readArchive(again);
    if (!r.ok) throw new Error(r.problem);
    expect(r.files).toHaveLength(5);
    expect(await r.files.find((f) => f.path === 'pals/anubis.webp')!.file.text()).toBe('icon-bytes');
  });

  it('turns away a file that is not one', async () => {
    expect(await readArchive(new Blob(['GIF89a, some other file entirely']))).toMatchObject({ ok: false, problem: expect.stringMatching(/isn’t a saved copy/) });
    expect(await readArchive(new Blob(['x']))).toMatchObject({ ok: false, problem: expect.stringMatching(/too small/) });
  });

  it('turns away one that was cut short, or has bytes added', async () => {
    const whole = archive();
    expect(await readArchive(whole.slice(0, whole.size - 3))).toMatchObject({ ok: false, problem: expect.stringMatching(/incomplete/) });
    expect(await readArchive(new Blob([whole, 'extra']))).toMatchObject({ ok: false, problem: expect.stringMatching(/incomplete/) });
    expect(await readArchive(whole.slice(0, 20))).toMatchObject({ ok: false, problem: expect.stringMatching(/damaged/) });
  });

  it('turns away one whose list is not valid', async () => {
    const head = new TextEncoder().encode('PALDOC-ART\n');
    const withIndex = (json: string) => {
      const body = new TextEncoder().encode(json);
      const len = new Uint8Array(4);
      new DataView(len.buffer).setUint32(0, body.byteLength, true);
      return new Blob([head, len, body]);
    };
    expect(await readArchive(withIndex('not json'))).toMatchObject({ ok: false, problem: expect.stringMatching(/damaged/) });
    expect(await readArchive(withIndex('{"format":1,"files":[{"path":"pals/a.webp","size":-4}]}'))).toMatchObject({ ok: false, problem: expect.stringMatching(/damaged/) });
    expect(await readArchive(withIndex('{"format":99,"files":[]}'))).toMatchObject({ ok: false, problem: expect.stringMatching(/newer PalDoc/) });
  });

  it('refuses paths that are not pal art, or that try to climb out', async () => {
    for (const path of ['../../evil.glb', 'pal-models/../../x.glb', 'roster.json', 'pal-models/run.exe']) {
      const r = await readArchive(archive([...files(), { path, blob: new Blob(['x']) }]));
      expect(r, path).toMatchObject({ ok: false, problem: expect.stringMatching(/aren’t pal art/) });
    }
  });

  it('refuses a copy with no 3D models', async () => {
    const r = await readArchive(archive([{ path: 'pals/anubis.webp', blob: new Blob(['x']) }]));
    expect(r).toMatchObject({ ok: false, problem: expect.stringMatching(/no 3D models/) });
  });
});
