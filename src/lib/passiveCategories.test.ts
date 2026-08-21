import { describe, expect, it } from 'vitest';

import passivesJson from '../data/passives.json';
import type { PassiveInfo } from '../types.ts';
import { CATEGORY_ORDER, PRESETS, categorise, isNegative } from './passiveCategories.ts';

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
