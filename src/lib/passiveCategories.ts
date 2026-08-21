/**
 * Groups passives by what they are actually for, derived from their effect text.
 *
 * passives.json stores effects as prose ("Work Speed +50%", "Max Stamina +25%
 * (rideable only)"), but the phrasing is highly regular — 55 normalised templates
 * across 104 ids — so a small ordered rule set tags every one of them. Deriving
 * the category beats hand-tagging 104 entries that would drift on the next data
 * refresh; `passivePlan.test.ts` asserts nothing falls through.
 *
 * Order matters: the first matching rule wins, so the narrow patterns (work,
 * mount) are tested before the broad combat catch-all.
 */

import type { PassiveInfo } from '../types.ts';

export type Category = 'work' | 'mount' | 'combat' | 'sustain' | 'utility';

export const CATEGORY_LABELS: Record<Category, string> = {
  work: 'Work',
  mount: 'Mount & movement',
  combat: 'Combat',
  sustain: 'Sustain',
  utility: 'Utility',
};

export const CATEGORY_ORDER: Category[] = ['combat', 'work', 'mount', 'sustain', 'utility'];

const RULES: Array<[RegExp, Category]> = [
  [/Work Speed|Work Suitability|Logging Efficiency|Mining Efficiency|Breeding Farm/i, 'work'],
  // "Player Stamina Consumption" is a rider stat, so it belongs with movement.
  [/Movement Speed|Max Stamina|movement speed on water|Mounted Jump|Stamina Consumption/i, 'mount'],
  [/SAN|Hunger|Health Regeneration|restores Health|Absorbs/i, 'sustain'],
  [/Sale price|buy price|Drop Items|Egg|nocturnal|night/i, 'utility'],
  // Broad catch-all last: covers Attack/Defense, elemental damage both ways,
  // "Incoming X damage", flinch/knockback immunity, cooldown and reload.
  [/Attack|Defense|damage|Immune to|cooldown|Reload|Flinch|Knockback/i, 'combat'],
];

export function categorise(info: PassiveInfo | undefined): Category | null {
  if (!info?.name) return null;
  const text = info.effects.join(' ');
  for (const [re, category] of RULES) if (re.test(text)) return category;
  return null;
}

/** Sign of a passive, for warning when a debuff is picked deliberately. */
export function isNegative(info: PassiveInfo | undefined): boolean {
  if (!info) return false;
  return typeof info.tier === 'number' && info.tier < 0;
}

export interface Preset {
  id: string;
  label: string;
  blurb: string;
  /** Internal passive ids, best-first — trimmed to the 4-slot cap by the UI. */
  passives: string[];
}

/**
 * Starting points, not recommendations. Each targets one role because there are
 * only four slots and the roles want different things — Max Stamina does nothing
 * off a mount, Work Speed does nothing in a fight.
 */
export const PRESETS: Preset[] = [
  {
    id: 'work',
    label: 'Base worker',
    blurb: 'Maximum work speed for a base or breeding farm.',
    passives: ['CraftSpeed_up3', 'CraftSpeed_up2', 'Rare', 'PAL_CorporateSlave'],
  },
  {
    id: 'mount',
    label: 'Mount',
    blurb: 'Ground or air travel speed and stamina.',
    passives: ['MoveSpeed_up_3', 'MoveSpeed_up_2', 'Stamina_Up_3', 'Stamina_Up_1'],
  },
  {
    id: 'combat',
    label: 'Combat',
    blurb: 'Raw attack for fighting and raids.',
    passives: ['PAL_ALLAttack_up3', 'PAL_ALLAttack_up2', 'Noukin', 'Rare'],
  },
  {
    id: 'tank',
    label: 'Tank',
    blurb: 'Survivability over damage.',
    passives: ['Deffence_up3', 'Deffence_up2', 'Vampire', 'PAL_masochist'],
  },
];
