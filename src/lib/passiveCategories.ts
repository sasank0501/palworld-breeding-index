/**
 * Two ways to group passives: by rank, the way paldb does it, and by what they
 * are actually for, derived from their effect text. The picker offers both.
 *
 * --- purpose ---
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

/* ---------- rank (paldb's grouping) --------------------------------------
   paldb lists passives by rank and nothing else: 5 down to 1, then the debuffs
   -1 to -3, and it colours each plate from that rank alone. We store the same
   thing, except that passives.json collapses ranks 4 and 5 into "diamond" — the
   rank-5 set is exactly the World Tree implants, which carry a `WorldTree_`
   id prefix, so the split is recoverable without a data refresh. */

export type Rank = 5 | 4 | 3 | 2 | 1 | -1 | -2 | -3;

/** Descending, the way paldb orders its list. */
export const RANK_ORDER: Rank[] = [5, 4, 3, 2, 1, -1, -2, -3];

export const RANK_LABELS: Record<Rank, string> = {
  5: 'Rank 5 · World Tree',
  4: 'Rank 4',
  3: 'Rank 3',
  2: 'Rank 2',
  1: 'Rank 1',
  '-1': 'Rank -1 · debuff',
  '-2': 'Rank -2 · debuff',
  '-3': 'Rank -3 · debuff',
};

const RANKS = new Set<number>([5, 4, 3, 2, 1, -1, -2, -3]);

/** The rank paldb would show, or null when the id is unverified in our data. */
export function rankOf(id: string, info: PassiveInfo | undefined): Rank | null {
  if (!info || info.name === null) return null;
  const t = info.tier;
  if (t === 'diamond') return id.startsWith('WorldTree_') ? 5 : 4;
  if (typeof t === 'number' && RANKS.has(t)) return t as Rank;
  return null;
}

/** Rank drives the chip colour; unverified ids stay grey rather than pretending. */
export function rankClass(rank: Rank | null): string {
  if (rank === null) return 'rank-unknown';
  return rank < 0 ? 'rank-neg' : `rank-${rank}`;
}

/**
 * Sortable rank: 5 down through the debuffs, with unverified ids last since
 * claiming a rank for them would be a guess.
 */
export function rankSort(rank: Rank | null): number {
  return rank ?? -99;
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
