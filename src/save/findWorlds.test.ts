import { describe, expect, it } from 'vitest';

import { findWorlds, type PickedFile } from './findWorlds.ts';

const W1 = '402FCE184636F52E0AAE788CF2892671';
const W2 = '7AC316124DFCFF911FA76DB2D14AD4D3';
const f = (path: string, modified = 0): PickedFile<string> => ({ path, file: path, modified });

// The layout of a real Steam save folder, picked at the steam id level.
const steamPick = [
  f('76561198988158222/GlobalPalStorage.sav'),
  f('76561198988158222/steam_autocloud.vdf'),
  f(`76561198988158222/${W1}/Level.sav`, 100),
  f(`76561198988158222/${W1}/LevelMeta.sav`),
  f(`76561198988158222/${W1}/Players/0000000000000000000000000000000A.sav`),
  f(`76561198988158222/${W2}/Level.sav`, 200),
  f(`76561198988158222/${W2}/LevelMeta.sav`),
  f(`76561198988158222/${W2}/Players/0000000000000000000000000000000B.sav`),
  f(`76561198988158222/${W2}/Players/0000000000000000000000000000000B_dps.sav`),
  f(`76561198988158222/${W2}/backup/world/2026.09.02-18.29.30/Level.sav`, 999),
  f(`76561198988158222/${W2}/backup/world/2026.09.02-18.29.30/Players/0000000000000000000000000000000B.sav`),
];

describe('findWorlds', () => {
  it('finds each world, newest first, with its players and the shared global storage', () => {
    const { worlds, missingGlobal, hint } = findWorlds(steamPick);
    expect(worlds.map((w) => w.id)).toEqual([W2, W1]);
    expect(worlds[0].players.map((p) => p.name)).toEqual(['0000000000000000000000000000000B.sav', '0000000000000000000000000000000B_dps.sav']);
    expect(worlds[0].global).toBe('76561198988158222/GlobalPalStorage.sav');
    expect(worlds[0].levelMeta).toBe(`76561198988158222/${W2}/LevelMeta.sav`);
    expect(missingGlobal).toBe(false);
    expect(hint).toBeUndefined();
  });

  it('never treats a backup copy as a world', () => {
    // The backup Level.sav is the newest file of all; it must still be ignored.
    const { worlds } = findWorlds(steamPick);
    expect(worlds).toHaveLength(2);
    expect(worlds.every((w) => !w.dir.includes('backup'))).toBe(true);
  });

  it('accepts Windows separators and a pick one level higher', () => {
    const higher = steamPick.map((p) => ({ ...p, path: `SaveGames\\${p.path.replace(/\//g, '\\')}` }));
    expect(findWorlds(higher).worlds.map((w) => w.id)).toEqual([W2, W1]);
  });

  it('reports a pick of the world folder itself, which leaves out GlobalPalStorage.sav', () => {
    const { worlds, missingGlobal } = findWorlds([f(`${W2}/Level.sav`), f(`${W2}/Players/B.sav`)]);
    expect(worlds.map((w) => w.id)).toEqual([W2]);
    expect(worlds[0].global).toBeUndefined();
    expect(missingGlobal).toBe(true);
  });

  it('says why nothing was found', () => {
    expect(findWorlds([]).hint).toBe('empty');
    expect(findWorlds([f('Downloads/notes.txt')]).hint).toBe('no-level');
    expect(findWorlds([f('Packages/Pal/SystemAppData/wgs/000901/C7A0/7F9E3C')]).hint).toBe('xbox');
  });
});
