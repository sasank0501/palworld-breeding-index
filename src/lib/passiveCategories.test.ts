import { describe, expect, it } from 'vitest';

import passivesJson from '../data/passives.json';
import type { PassiveInfo } from '../types.ts';
import {
  CATEGORY_ORDER,
  PRESETS,
  RANK_LABELS,
  RANK_ORDER,
  categorise,
  isNegative,
  rankClass,
  rankOf,
  rankSort,
} from './passiveCategories.ts';

const PASSIVES = passivesJson as unknown as Record<string, PassiveInfo>;

describe('categorise', () => {
  it('assigns a category to every named passive', () => {
    // The picker groups by category, so anything uncategorised would vanish from
    // the UI. A passives.json refresh that adds new effect wording fails here.
    const missed: string[] = [];
    for (const [id, info] of Object.entries(PASSIVES)) {
      if (!info.name) continue;
      if (!categorise(info)) missed.push(`${id} (${info.name}): ${info.effects.join(', ')}`);
    }
    expect(missed).toEqual([]);
  });

  it('routes representative passives to the right bucket', () => {
    expect(categorise(PASSIVES.CraftSpeed_up2)).toBe('work');
    expect(categorise(PASSIVES.MoveSpeed_up_3)).toBe('mount');
    expect(categorise(PASSIVES.Stamina_Up_1)).toBe('mount');
    expect(categorise(PASSIVES.PAL_ALLAttack_up2)).toBe('combat');
    expect(categorise(PASSIVES.Deffence_up2)).toBe('combat');
    expect(categorise(PASSIVES.PAL_Sanity_Down_2)).toBe('sustain');
    expect(categorise(PASSIVES.SalePrice_Up_1)).toBe('utility');
  });

  it('classifies elemental resists as combat, not uncategorised', () => {
    // "Incoming X damage -10%" has no Attack/Defense keyword and fell through
    // the first draft of the rules.
    expect(categorise(PASSIVES.ElementResist_Fire_1_PAL)).toBe('combat');
    expect(categorise(PASSIVES.ElementResist_Dragon_1_PAL)).toBe('combat');
  });

  it('returns null for an unnamed passive', () => {
    expect(categorise({ name: null, tier: null, effects: [], lock: null })).toBeNull();
    expect(categorise(undefined)).toBeNull();
  });
});

describe('isNegative', () => {
  it('flags debuffs by negative tier', () => {
    // Keyed by internal id, not display name: CraftSpeed_down2 is "Slacker".
    expect(isNegative(PASSIVES.CraftSpeed_down2)).toBe(true);
    expect(isNegative(PASSIVES.CraftSpeed_up2)).toBe(false);
  });
});

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

describe('rankClass', () => {
  it('gives each positive rank its own plate and shares one for the debuffs', () => {
    expect(rankClass(5)).toBe('rank-5');
    expect(rankClass(1)).toBe('rank-1');
    expect(rankClass(-1)).toBe('rank-neg');
    expect(rankClass(-3)).toBe('rank-neg');
    expect(rankClass(null)).toBe('rank-unknown');
  });
});

describe('rankSort', () => {
  it('orders 5 down through the debuffs, unverified last', () => {
    const ranks = RANK_ORDER.map(rankSort);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(rankSort(null)).toBeLessThan(rankSort(-3));
  });
});

describe('rank labels', () => {
  it('labels every rank the picker can render', () => {
    for (const r of RANK_ORDER) expect(RANK_LABELS[r]).toBeTruthy();
    expect(new Set(RANK_ORDER).size).toBe(RANK_ORDER.length);
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

  it('covers every category in the order list', () => {
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });
});
