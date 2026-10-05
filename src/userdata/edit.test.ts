import { describe, expect, it } from 'vitest';

import { deletePlan, forgetMissing, mergeWorlds, missingPals, savePlan, setNote, summarise, toggleFavourite } from './edit.ts';
import { emptyWorld, migrate, parseBackup, type Backup, type WorldData } from './schema.ts';

const T = (n: number) => new Date(Date.UTC(2026, 9, 4, 12, 0, n)).toISOString();
const W = '7AC316124DFCFF911FA76DB2D14AD4D3';

describe('editing', () => {
  it('toggles a favourite and leaves a tombstone when it is removed', () => {
    const on = toggleFavourite(emptyWorld(W), 'pal-a', T(1));
    expect(on.favourites['pal-a']).toEqual({ at: T(1) });
    const off = toggleFavourite(on, 'pal-a', T(2));
    expect(off.favourites).toEqual({});
    expect(off.deleted['favourites:pal-a']).toBe(T(2));
    expect(on.favourites['pal-a']).toBeDefined(); // the input is never mutated
  });

  it('treats an empty note as deleting it', () => {
    const d = setNote(setNote(emptyWorld(W), 'pal-a', 'keep for Swift line', T(1)), 'pal-a', '   ', T(2));
    expect(d.notes).toEqual({});
    expect(d.deleted['notes:pal-a']).toBe(T(2));
  });

  it('clears the tombstone when something is added again', () => {
    let d = savePlan(emptyWorld(W), 'p1', { species: 'Anubis', passives: ['Legend'] }, T(1));
    d = deletePlan(d, 'p1', T(2));
    d = savePlan(d, 'p1', { species: 'Anubis', passives: [] }, T(3));
    expect(d.deleted).toEqual({});
    expect(d.plans.p1.at).toBe(T(3));
  });

  it('summarises for previews', () => {
    const d = setNote(toggleFavourite(emptyWorld(W), 'a', T(1)), 'a', 'x', T(1));
    expect(summarise(d)).toBe('1 favourite, 1 note, 0 plans');
  });
});

describe('mergeWorlds', () => {
  const base = toggleFavourite(setNote(emptyWorld(W), 'pal-a', 'old text', T(1)), 'pal-b', T(1));

  it('keeps the newer version of each item, whichever side it is on', () => {
    const mine = setNote(base, 'pal-a', 'newer text', T(5));
    const theirs = toggleFavourite(base, 'pal-c', T(3));
    const m = mergeWorlds(theirs, mine);
    expect(m.notes['pal-a'].text).toBe('newer text');
    expect(Object.keys(m.favourites).sort()).toEqual(['pal-b', 'pal-c']);
    expect(mergeWorlds(mine, theirs)).toEqual(m);
  });

  it('does not bring back something deleted after the backup was made', () => {
    // An old backup still has pal-b as a favourite; this browser removed it since.
    const oldBackup = base;
    const now = toggleFavourite(base, 'pal-b', T(9));
    expect(mergeWorlds(now, oldBackup).favourites['pal-b']).toBeUndefined();
    expect(mergeWorlds(oldBackup, now).favourites['pal-b']).toBeUndefined();
  });

  it('does keep something re-added after an older deletion', () => {
    const deleted = toggleFavourite(base, 'pal-b', T(2));
    const readded = toggleFavourite(deleted, 'pal-b', T(4));
    const m = mergeWorlds(deleted, readded);
    expect(m.favourites['pal-b']).toEqual({ at: T(4) });
    expect(m.deleted['favourites:pal-b']).toBeUndefined();
  });

  it('is unchanged by merging a copy with itself', () => {
    expect(mergeWorlds(base, base)).toEqual(base);
  });

  it('refuses to merge two different worlds', () => {
    expect(() => mergeWorlds(base, emptyWorld('OTHER'))).toThrow();
  });
});

describe('pals that left the save', () => {
  it('lists marks on pals the save no longer has, and forgets them on request', () => {
    const d = setNote(toggleFavourite(toggleFavourite(emptyWorld(W), 'kept', T(1)), 'sold', T(1)), 'condensed', 'was 4 stars', T(1));
    expect(missingPals(d, ['kept'])).toEqual([
      { instanceId: 'condensed', favourite: false, note: 'was 4 stars' },
      { instanceId: 'sold', favourite: true, note: undefined },
    ]);
    const clean = forgetMissing(d, ['kept'], T(2));
    expect(Object.keys(clean.favourites)).toEqual(['kept']);
    expect(clean.notes).toEqual({});
  });
});

describe('migrations and backups', () => {
  it('upgrades step by step and refuses files from a newer version', () => {
    const steps = { 0: (d: Record<string, unknown>) => ({ ...d, renamed: d.old }), 1: (d: Record<string, unknown>) => ({ ...d, extra: true }) };
    expect(migrate({ old: 5 }, steps, 2)).toEqual({ old: 5, renamed: 5, extra: true, schema: 2 });
    expect(() => migrate({ schema: 9 }, steps, 2)).toThrow(/newer version/);
  });

  const world: WorldData = setNote(emptyWorld(W), 'pal-a', 'hi', T(1));
  const backup: Backup = { app: 'palworld-index', kind: 'backup', schema: 1, exportedAt: T(2), prefs: null, worlds: [world] };

  it('reads back what it wrote', () => {
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it('rejects files that are not backups, with a plain reason', () => {
    expect(() => parseBackup('not json')).toThrow(/not valid JSON/);
    expect(() => parseBackup('{"hello":1}')).toThrow(/not a Palworld Breeding Index backup/);
    const damaged = { ...backup, worlds: [{ ...world, notes: { x: { text: 5, at: T(1) } } }] };
    expect(() => parseBackup(JSON.stringify(damaged))).toThrow(/note x is damaged/);
    const huge = { ...backup, worlds: [{ ...world, notes: { x: { text: 'a'.repeat(10_001), at: T(1) } } }] };
    expect(() => parseBackup(JSON.stringify(huge))).toThrow(/longer than/);
  });
});
