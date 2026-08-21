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
 * Highest suitability level present in the current dex. Not the in-game cap of 5 —
 * this dataset records values up to 8 (Farming peaks at 4, Transporting at 7), so
 * bars and thresholds should scale to this rather than a hard-coded 5.
 */
export const MAX_WORK_LEVEL = 8;
