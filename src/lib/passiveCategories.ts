/**
 * Passive ranks, the way paldb groups them, and the planner's presets.
 */

import type { PassiveInfo } from '../types.ts';

/* ---------- rank (paldb's grouping) --------------------------------------
   paldb lists passives by rank and nothing else: 5 down to 1, then the debuffs
   -1 to -3, and it colours each plate from that rank alone. We store the same
   thing, except that passives.json collapses ranks 4 and 5 into "diamond" — the
   rank-5 set is exactly the World Tree implants, which carry a `WorldTree_`
   id prefix, so the split is recoverable without a data refresh. */

export type Rank = 5 | 4 | 3 | 2 | 1 | -1 | -2 | -3;

/** Descending, the way paldb orders its list. */
export const RANK_ORDER: Rank[] = [5, 4, 3, 2, 1, -1, -2, -3];

const RANKS = new Set<number>([5, 4, 3, 2, 1, -1, -2, -3]);

/** The rank paldb would show, or null when the id is unverified in our data. */
export function rankOf(id: string, info: PassiveInfo | undefined): Rank | null {
  if (!info || info.name === null) return null;
  const t = info.tier;
  if (t === 'diamond') return id.startsWith('WorldTree_') ? 5 : 4;
  if (typeof t === 'number' && RANKS.has(t)) return t as Rank;
  return null;
}

/**
 * Sortable rank: 5 down through the debuffs, with unverified ids last since
 * claiming a rank for them would be a guess.
 */
export function rankSort(rank: Rank | null): number {
  return rank ?? -99;
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
