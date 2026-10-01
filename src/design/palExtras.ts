/**
 * The species data the save does not carry: partner skill, food amount and the
 * exp curve, from `npm run build-pal-extras` (sources credited in that script).
 *
 * Partner skill *level* is per pal and comes from the save: it follows the
 * condenser rank, so it is `pal.rank`, not anything here.
 */
import extrasJson from '../data/palExtras.json';
import expJson from '../data/palExp.json';

export interface PartnerSkill {
  name: string;
  /** paldb's wording, with per-level values as a range: "(5~10)%". */
  description: string;
}

interface PalExtras {
  food?: number;
  /** The game's 1-20 species rarity. In 1.0 only 1-10 and 20 occur. */
  rarity?: number;
  partner?: PartnerSkill;
}

const EXTRAS = extrasJson as Record<string, PalExtras>;
/** `EXP_TOTALS[lv]` is the career exp a pal needs to reach level `lv`. */
const EXP_TOTALS = expJson as number[];

/** The in-game food gauge is ten slots wide. */
export const FOOD_SLOTS = 10;

export const partnerSkillFor = (palId: string | null): PartnerSkill | null =>
  (palId && EXTRAS[palId]?.partner) || null;

/** How much the species eats, in gauge slots (1-9). Not how full it is now. */
export const foodFor = (palId: string | null): number | null => (palId && EXTRAS[palId]?.food) || null;

export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * Pals have a rarity number but no named tiers in game; the tier names and
 * colours are the game's *item* rarities. The cut-offs are ours, chosen against
 * the 1.0 spread so the tiers thin out going up (112 / 104 / 37 / 28 / 8
 * species) and 20 is exactly the legendaries (Jetragon, Frostallion, ...).
 */
export function rarityTier(rarity: number | null | undefined): RarityTier {
  if (!rarity || rarity <= 4) return 'common';
  if (rarity <= 7) return 'uncommon';
  if (rarity <= 8) return 'rare';
  if (rarity <= 19) return 'epic';
  return 'legendary';
}

export const rarityFor = (palId: string | null): number | null => (palId && EXTRAS[palId]?.rarity) || null;

/**
 * 0-1 progress from `level` toward the next one. Clamped: a handful of pals sit
 * a little under their level's threshold (seemingly ones granted at a set level),
 * and the level cap has no next level to fill toward.
 */
export function levelProgress(level: number, exp: number): number {
  const floor = EXP_TOTALS[level];
  const ceiling = EXP_TOTALS[level + 1];
  if (floor === undefined || ceiling === undefined) return 1;
  return Math.min(1, Math.max(0, (exp - floor) / (ceiling - floor)));
}
