import 'fake-indexeddb/auto';
import { createStore, entries, set } from 'idb-keyval';
import { describe, expect, it } from 'vitest';

import { applyRestore, buildBackup } from './backup.ts';
import { savePlan, setNote, toggleFavourite } from './edit.ts';
import { parseBackup } from './schema.ts';
import { readPrefs, readWorld, writePrefs, WorldStore } from './store.ts';

describe('WorldStore', () => {
  it('keeps edits across a reload', async () => {
    const a = await WorldStore.open('W1');
    a.update((d) => toggleFavourite(d, 'pal-a'));
    a.update((d) => setNote(d, 'pal-a', 'keep'));
    expect(a.status).toBe('unsaved');
    await a.close(); // close flushes
    const b = await WorldStore.open('W1');
    expect(Object.keys(b.data.favourites)).toEqual(['pal-a']);
    expect(b.data.notes['pal-a'].text).toBe('keep');
    expect(b.status).toBe('saved');
    await b.close();
  });

  it('lets two tabs edit at once without losing either change', async () => {
    const tab1 = await WorldStore.open('W2');
    const tab2 = await WorldStore.open('W2');
    tab1.update((d) => toggleFavourite(d, 'from-tab-1'));
    tab2.update((d) => savePlan(d, 'plan-x', { species: 'Anubis', passives: ['Legend'] }));
    await tab1.flush();
    await tab2.flush(); // merges with tab 1's write instead of overwriting it
    const stored = await readWorld('W2');
    expect(Object.keys(stored.favourites)).toEqual(['from-tab-1']);
    expect(Object.keys(stored.plans)).toEqual(['plan-x']);
    await tab1.close();
    await tab2.close();
  });

  it('keeps data it cannot read aside instead of deleting it', async () => {
    const docs = createStore('palworld-index-userdata', 'docs');
    await set('world:W3', { app: 'palworld-index', kind: 'world', schema: 1, world: 'W3', favourites: 'broken' }, docs);
    const d = await readWorld('W3');
    expect(d.favourites).toEqual({});
    const keys = (await entries(docs)).map(([k]) => String(k));
    expect(keys.some((k) => k.startsWith('unreadable:W3:'))).toBe(true);
  });
});

describe('backup and restore', () => {
  it('round-trips through a file, and merge keeps newer local edits', async () => {
    const s = await WorldStore.open('W4');
    s.update((d) => setNote(d, 'pal-a', 'in the backup', '2026-10-01T00:00:00.000Z'));
    await s.flush();
    const file = JSON.stringify(await buildBackup());

    s.update((d) => setNote(d, 'pal-a', 'edited after the backup', '2026-10-02T00:00:00.000Z'));
    s.update((d) => toggleFavourite(d, 'pal-b', '2026-10-02T00:00:00.000Z'));
    await s.flush();

    const backup = parseBackup(file);
    await applyRestore(backup, 'merge');
    let stored = await readWorld('W4');
    expect(stored.notes['pal-a'].text).toBe('edited after the backup');
    expect(Object.keys(stored.favourites)).toEqual(['pal-b']);

    await applyRestore(backup, 'replace');
    stored = await readWorld('W4');
    expect(stored.notes['pal-a'].text).toBe('in the backup');
    expect(stored.favourites).toEqual({});
    await s.close();
  });

  it('carries the skin preference', async () => {
    await writePrefs({ skin: 'sakura' });
    expect((await readPrefs()).skin).toBe('sakura');
    const backup = parseBackup(JSON.stringify(await buildBackup()));
    expect(backup.prefs?.skin).toBe('sakura');
  });
});
