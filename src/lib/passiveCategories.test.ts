import { describe, expect, it } from 'vitest';

import passivesJson from '../data/passives.json';
import type { PassiveInfo } from '../types.ts';
import { PRESETS, RANK_ORDER, rankOf, rankSort } from './passiveCategories.ts';

const PASSIVES = passivesJson as unknown as Record<string, PassiveInfo>;

describe('rankOf', () => {
  it('splits the stored "diamond" tier into paldb ranks 5 and 4', () => {
    // paldb puts the World Tree implants alone at rank 5; everything else that
    // we store as "diamond" — Demon God, Legend, Lucky — is rank 4 there.
    expect(rankOf('WorldTree_CraftSpeed', PASSIVES.WorldTree_CraftSpeed)).toBe(5);
    expect(rankOf('WorldTree_ATK_DEF', PASSIVES.WorldTree_ATK_DEF)).toBe(5);
    expect(rankOf('PAL_ALLAttack_up3', PASSIVES.PAL_ALLAttack_up3)).toBe(4);
    expect(rankOf('Legend', PASSIVES.Legend)).toBe(4);
  });

  it('passes numeric tiers straight through, debuffs included', () => {
    expect(rankOf('CraftSpeed_up2', PASSIVES.CraftSpeed_up2)).toBe(3);
    expect(rankOf('Noukin', PASSIVES.Noukin)).toBe(2);
    expect(rankOf('PAL_ALLAttack_up1', PASSIVES.PAL_ALLAttack_up1)).toBe(1);
    expect(rankOf('CraftSpeed_down2', PASSIVES.CraftSpeed_down2)).toBe(-3);
  });

  it('gives every named passive a rank the picker can group under', () => {
    const missed: string[] = [];
    for (const [id, info] of Object.entries(PASSIVES)) {
      if (!info.name) continue;
      if (rankOf(id, info) === null) missed.push(`${id} (${info.name}): tier ${String(info.tier)}`);
    }
    expect(missed).toEqual([]);
  });

  it('returns null rather than guessing for an unverified entry', () => {
    expect(rankOf('x', { name: 'x', tier: null, effects: [], lock: null })).toBeNull();
    expect(rankOf('x', undefined)).toBeNull();
  });
});

describe('rankSort', () => {
  it('orders 5 down through the debuffs, unverified last', () => {
    const ranks = RANK_ORDER.map(rankSort);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(rankSort(null)).toBeLessThan(rankSort(-3));
  });
});

describe('presets', () => {
  it('reference only real passive ids', () => {
    const unknown: string[] = [];
    for (const preset of PRESETS) {
      for (const id of preset.passives) if (!PASSIVES[id]) unknown.push(`${preset.id}: ${id}`);
    }
    expect(unknown).toEqual([]);
  });

  it('stay within the four-slot cap', () => {
    for (const preset of PRESETS) expect(preset.passives.length).toBeLessThanOrEqual(4);
  });

});
