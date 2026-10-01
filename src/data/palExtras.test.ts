import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import extrasJson from './palExtras.json';
import expJson from './palExp.json';
import palsJson from './pals.json';
import { workBonuses } from './work.ts';
import { levelProgress, rarityTier } from '../design/palExtras.ts';
import type { Roster } from '../types.ts';

const EXTRAS = extrasJson as Record<string, { food?: number; rarity?: number; partner?: { name: string; description: string } }>;
const EXP = expJson as number[];

describe('palExtras.json', () => {
  it('gives every dex species a food amount and a partner skill', () => {
    for (const [id, pal] of Object.entries(palsJson as Record<string, { name: string }>)) {
      const e = EXTRAS[id];
      expect(e?.food, `${id} ${pal.name} food`).toBeGreaterThanOrEqual(1);
      expect(e?.food, `${id} ${pal.name} food`).toBeLessThanOrEqual(10);
      expect(e?.partner?.name, `${id} ${pal.name} partner`).toBeTruthy();
      expect(e?.partner?.description, `${id} ${pal.name} partner text`).toBeTruthy();
    }
  });

  it('gives every species a 1-20 rarity', () => {
    for (const id of Object.keys(palsJson)) {
      expect(EXTRAS[id]?.rarity, id).toBeGreaterThanOrEqual(1);
      expect(EXTRAS[id]?.rarity, id).toBeLessThanOrEqual(20);
    }
  });

  it('buckets rarity into tiers with no gaps, legendaries on top', () => {
    const tiers = Array.from({ length: 20 }, (_, i) => rarityTier(i + 1));
    expect(tiers.slice(0, 4).every((t) => t === 'common')).toBe(true);
    expect(tiers.slice(4, 7).every((t) => t === 'uncommon')).toBe(true);
    expect(tiers[7]).toBe('rare');
    expect(tiers[8]).toBe('epic');
    expect(tiers[19]).toBe('legendary');
    expect(rarityTier(EXTRAS['202.0'].rarity)).toBe('legendary'); // Jetragon
  });

  // Confirmed against paldb.cc v1.0.5 and the in-game screen. The wiki's
  // PalPartnerSkill table still has the Early Access wording for this one.
  it('carries 1.0 partner skill text', () => {
    expect(EXTRAS['137.0']).toMatchObject({ food: 9, partner: { name: 'Magma Kaiser' } });
    expect(EXTRAS['137.0'].partner?.description).toContain('Attack and Defense');
  });
});

describe('palExp.json', () => {
  it('rises strictly from level 1', () => {
    expect(EXP[1]).toBe(0);
    for (let lv = 2; lv < EXP.length; lv++) expect(EXP[lv], `level ${lv}`).toBeGreaterThan(EXP[lv - 1]);
  });

  it('is the pal curve, not the player one', () => {
    // Player totals are 5,510 at 10 and 6,498,533 at 60.
    expect(EXP[10]).toBe(843);
    expect(EXP[60]).toBe(16625481);
  });

  // The real check: every imported pal's exp falls inside its level's bracket.
  // A few pals granted at a set level sit just under the floor, so allow a
  // sliver — but none may ever exceed the next level's threshold.
  const rosterFile = path.resolve(__dirname, '../../public/roster.json');
  it.skipIf(!fs.existsSync(rosterFile))('brackets the pals in the imported save', () => {
    const roster = JSON.parse(fs.readFileSync(rosterFile, 'utf8')) as Roster;
    const over = roster.pals.filter((p) => EXP[p.level + 1] !== undefined && p.exp >= EXP[p.level + 1]);
    const under = roster.pals.filter((p) => p.exp < EXP[p.level]);
    expect(over.map((p) => `${p.characterId} Lv${p.level} ${p.exp}`)).toEqual([]);
    expect(under.length / roster.pals.length).toBeLessThan(0.01);
  });

  it('turns exp into a clamped fraction of the current level', () => {
    expect(levelProgress(10, 843)).toBe(0);
    expect(levelProgress(10, (843 + EXP[11]) / 2)).toBeCloseTo(0.5);
    expect(levelProgress(10, 100)).toBe(0);
    expect(levelProgress(EXP.length - 1, 1e12)).toBe(1);
  });
});

describe('workBonuses', () => {
  it('reads suitability boosts out of passive ids', () => {
    const b = workBonuses(['WorkSuitabilityAddRank_MonsterFarm_2', 'Deffence_up2', 'WorkSuitabilityAddRank_Mining_1']);
    expect(Object.fromEntries(b)).toEqual({ Frm: 2, Min: 1 });
  });
});
