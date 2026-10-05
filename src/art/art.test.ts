import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';

import { describePack, selectPackFiles } from './pack.ts';
import { idbStorage } from './storage.ts';
import { removePack, storePack } from './store-pack.ts';

const blob = (text: string) => new Blob([text]);
const picked = (paths: string[]) => paths.map((path) => ({ path, file: blob(path), size: path.length }));

const PACK = [
  'art-pack/pal-models/index.json',
  'art-pack/pal-models/Anubis.chibi.glb',
  'art-pack/pal-portraits/index.json',
  'art-pack/pal-portraits/Anubis.webp',
  'art-pack/pals/anubis.webp',
  'art-pack/pack.json',
];

describe('selectPackFiles', () => {
  it('starts each path at the art folder, whatever folder was picked', () => {
    expect(selectPackFiles(picked(PACK)).map((f) => f.path)).toEqual([
      'pal-models/index.json',
      'pal-models/Anubis.chibi.glb',
      'pal-portraits/index.json',
      'pal-portraits/Anubis.webp',
      'pals/anubis.webp',
    ]);
    expect(selectPackFiles(picked(['Desktop/stuff/art-pack/pal-models/Anubis.chibi.glb'])).map((f) => f.path)).toEqual([
      'pal-models/Anubis.chibi.glb',
    ]);
  });

  it('ignores anything that is not art, and paths that try to climb out', () => {
    const got = selectPackFiles(
      picked(['art/pal-models/notes.txt', 'art/pal-models/../../evil.glb', 'art/roster.json', 'art/pals/x.png', 'art/pals/ok.webp']),
    );
    expect(got.map((f) => f.path)).toEqual(['pals/ok.webp']);
  });
});

describe('describePack', () => {
  it('counts what a pack holds', () => {
    const d = describePack(selectPackFiles(picked(PACK)));
    expect(d).toMatchObject({ models: 1, stills: 1, icons: 1, problem: null });
  });

  it('refuses a pack with no 3D models: the 3D is the point', () => {
    expect(describePack(selectPackFiles(picked(['a/pals/x.webp']))).problem).toMatch(/no 3D models/);
  });

  it('refuses models without their list', () => {
    expect(describePack(selectPackFiles(picked(['a/pal-models/Anubis.chibi.glb']))).problem).toMatch(/index\.json/);
  });
});

describe('storePack', () => {
  it('writes the pack, then makes it current', async () => {
    const s = idbStorage(createStore('art-test-1', 'files'));
    const info = await storePack(s, selectPackFiles(picked(PACK)), 'folder');
    expect(await s.current()).toEqual(info);
    expect(info).toMatchObject({ complete: true, models: 1, stills: 1, icons: 1, files: 5 });
    expect(await (await s.read(info.id, 'pal-models/Anubis.chibi.glb'))?.text()).toBe('art-pack/pal-models/Anubis.chibi.glb');
    expect((await s.read(info.id, 'pal-models/Anubis.chibi.glb'))?.type).toBe('model/gltf-binary');
    expect(await s.read(info.id, 'pals/missing.webp')).toBeNull();
  });

  it('replaces the old pack and sweeps it away', async () => {
    const s = idbStorage(createStore('art-test-2', 'files'));
    const first = await storePack(s, selectPackFiles(picked(PACK)), 'folder');
    const second = await storePack(s, selectPackFiles(picked(PACK)), 'folder');
    expect((await s.current())?.id).toBe(second.id);
    expect(await s.ids()).toEqual([second.id]);
    expect(await s.read(first.id, 'pal-models/index.json')).toBeNull();
  });

  it('leaves the live pack untouched when a load is stopped', async () => {
    const s = idbStorage(createStore('art-test-3', 'files'));
    const live = await storePack(s, selectPackFiles(picked(PACK)), 'folder');
    const stop = new AbortController();
    const load = storePack(s, selectPackFiles(picked(PACK)), 'folder', (p) => p.done === 2 && stop.abort(), stop.signal);
    await expect(load).rejects.toThrow();
    expect((await s.current())?.id).toBe(live.id);
    expect(await s.ids()).toEqual([live.id]);
  });

  it('removes everything', async () => {
    const s = idbStorage(createStore('art-test-4', 'files'));
    await storePack(s, selectPackFiles(picked(PACK)), 'folder');
    await removePack(s);
    expect(await s.current()).toBeNull();
    expect(await s.ids()).toEqual([]);
  });
});
