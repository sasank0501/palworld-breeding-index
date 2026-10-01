/**
 * The twelve work suitabilities, keyed by the abbreviations used in pals.json.
 *
 * Hand-written rather than extracted: the legacy tool stored suitabilities as
 * three-letter codes with no accompanying labels, and these twelve are the
 * complete, stable set in the game. `work.test.ts` asserts every code appearing
 * in pals.json resolves here, so a dex refresh that introduces a new code fails
 * loudly instead of rendering an abbreviation at the user.
 *
 * `order` follows the in-game suitability row so UI listings match the game.
 */

export interface WorkSuitability {
  code: string;
  name: string;
  order: number;
}

export const WORK_SUITABILITIES: WorkSuitability[] = [
  { code: 'Kdl', name: 'Kindling', order: 0 },
  { code: 'Wtr', name: 'Watering', order: 1 },
  { code: 'Plt', name: 'Planting', order: 2 },
  { code: 'Elc', name: 'Generating Electricity', order: 3 },
  { code: 'Hnd', name: 'Handiwork', order: 4 },
  { code: 'Gth', name: 'Gathering', order: 5 },
  { code: 'Lmb', name: 'Lumbering', order: 6 },
  { code: 'Min', name: 'Mining', order: 7 },
  { code: 'Med', name: 'Medicine Production', order: 8 },
  { code: 'Cool', name: 'Cooling', order: 9 },
  { code: 'Trn', name: 'Transporting', order: 10 },
  { code: 'Frm', name: 'Farming', order: 11 },
];

const BY_CODE = new Map(WORK_SUITABILITIES.map((w) => [w.code, w]));

/** Display name for a suitability code, falling back to the raw code. */
export const workName = (code: string): string => BY_CODE.get(code)?.name ?? code;

export const workOrder = (code: string): number => BY_CODE.get(code)?.order ?? 99;

export const isKnownWorkCode = (code: string): boolean => BY_CODE.has(code);

/**
 * Highest species base level in the current dex (Farming peaks at 4,
 * Transporting at 7). For drawing one pal's gauge use WORK_LEVEL_CAP instead —
 * boosts can take a pal past the species base.
 */
export const MAX_WORK_LEVEL = 8;

/** The in-game ceiling on a single pal's suitability (species base + boosts). */
export const WORK_LEVEL_CAP = 10;

/** The game's `EPalWorkSuitability` names, as they appear in passive ids. */
const ENUM_TO_CODE: Record<string, string> = {
  EmitFlame: 'Kdl',
  Watering: 'Wtr',
  Seeding: 'Plt',
  GenerateElectricity: 'Elc',
  Handcraft: 'Hnd',
  Collection: 'Gth',
  Deforest: 'Lmb',
  Mining: 'Min',
  ProductMedicine: 'Med',
  Cool: 'Cool',
  Transport: 'Trn',
  MonsterFarm: 'Frm',
};

/**
 * Per-pal suitability boosts. The save has no separate list for them: they are
 * passives named `WorkSuitabilityAddRank_<EPalWorkSuitability>_<n>` (Farmhand is
 * `…_MonsterFarm_1`). Returns code -> total bonus.
 */
export function workBonuses(passives: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of passives) {
    const m = /^WorkSuitabilityAddRank_([A-Za-z]+)_(\d+)$/.exec(id);
    const code = m && ENUM_TO_CODE[m[1]];
    if (code) out.set(code, (out.get(code) ?? 0) + Number(m[2]));
  }
  return out;
}
