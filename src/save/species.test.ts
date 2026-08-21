import { describe, expect, it } from 'vitest';

import palsJson from '../data/pals.json';
import { buildSpeciesIndex, kebab, stripBoss, type PalDexEntry } from './species.ts';

const DEX = palsJson as unknown as Record<string, PalDexEntry>;
const index = buildSpeciesIndex(DEX);

describe('kebab', () => {
  it('splits camel case the way the image basenames do', () => {
    expect(kebab('SheepBall')).toBe('sheep-ball');
    expect(kebab('BluePlatypus_Fire')).toBe('blue-platypus-fire');
    expect(kebab('AmaterasuWolf_Dark')).toBe('amaterasu-wolf-dark');
  });
});

describe('stripBoss', () => {
  it('detects and removes the alpha prefix in either casing', () => {
    expect(stripBoss('BOSS_CubeTurtle')).toEqual({ base: 'CubeTurtle', isBoss: true });
    expect(stripBoss('Boss_LazyCatFish')).toEqual({ base: 'LazyCatFish', isBoss: true });
    expect(stripBoss('CubeTurtle')).toEqual({ base: 'CubeTurtle', isBoss: false });
  });
});

describe('species index', () => {
  it('resolves known codenames to dex ids', () => {
    expect(index.lookup('SheepBall')?.palId).toBe('1.0');
    expect(index.lookup('BluePlatypus_Fire')?.palId).toBe('5.1');
    expect(index.lookup('CatMage')?.palId).toBe('79.0');
  });

  it('flags alphas while resolving to the base species', () => {
    const alpha = index.lookup('BOSS_SheepBall');
    expect(alpha).toEqual({ palId: '1.0', isBoss: true });
  });

  it('tolerates the inconsistent casing the save actually uses', () => {
    // Lamball appears as both SheepBall and Sheepball across save files.
    expect(index.lookup('Sheepball')?.palId).toBe('1.0');
  });

  it('returns null for empty slots and captured humans', () => {
    expect(index.lookup('None')).toBeNull();
    expect(index.lookup('')).toBeNull();
    expect(index.lookup('BOSS_Hunter_Rifle')).toBeNull();
    expect(index.lookup('SalesPerson')).toBeNull();
  });

  it('round-trips every dex entry that has artwork', () => {
    // The image basename is the join key, so each must resolve from its codename.
    const unreachable: string[] = [];
    for (const pal of Object.values(DEX)) {
      if (!pal.img) continue;
      const codename = pal.img
        .replace(/^.*\//, '')
        .replace(/\.webp$/, '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      if (index.lookup(codename)?.palId !== pal.id) unreachable.push(`${pal.name} (${codename})`);
    }
    expect(unreachable).toEqual([]);
  });
});
