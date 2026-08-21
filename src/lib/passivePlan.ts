/**
 * Plans a breeding chain that lands a chosen passive set on a chosen species.
 *
 * The design rests on one verified fact: `X × X = X` for all 288 species, and
 * `combos.json` is an exhaustive parent-pair -> child matrix. So every step the
 * planner emits is a real pairing, and species never has to be traded against
 * passives — they are independent axes.
 *
 * Inheritance is probabilistic and those rates are not sourced, so this does not
 * model odds. It answers "is this chain possible?" and leaves re-rolling to the
 * player, ranking steps by how diluted the parent pool is instead. A step wanting
 * 4 passives from a 4-passive pool is very different from 4 out of 9, and that
 * difference is real even without knowing the exact numbers.
 *
 * Search is a fixpoint relaxation over (species, passive-subset) states rather
 * than a memoised DFS: the state graph has cycles (A breeds B breeds A), and
 * memoising a DFS that returns Infinity for in-progress states would cache those
 * failures and give wrong answers depending on visit order.
 */

import type { Combos, Pair } from './breeding.ts';

export interface PlannerPal {
  instanceId: string;
  palId: string;
  gender: 'male' | 'female' | null;
  passives: string[];
  nickname?: string | null;
  level?: number;
  location?: string;
}

export interface SeedNode {
  kind: 'seed';
  species: string;
  /** Target passives this node supplies. */
  need: string[];
  /** Best candidate — fewest extra passives. */
  pal: PlannerPal;
  /** Every owned pal that could fill this slot, for the UI to offer choices. */
  candidates: PlannerPal[];
}

export interface BreedNode {
  kind: 'breed';
  species: string;
  need: string[];
  parents: [PlanNode, PlanNode];
  /** Distinct passives across both parents — the pool the child draws from. */
  poolSize: number;
}

export type PlanNode = SeedNode | BreedNode;

export interface Plan {
  root: PlanNode;
  /** Number of breeding operations. */
  steps: number;
  /** Sum of (poolSize - wanted) across steps; lower is a cleaner grind. */
  contamination: number;
}

export interface SolveInput {
  target: string;
  /** Up to 4 internal passive ids — the game's per-pal cap. */
  want: string[];
  owned: PlannerPal[];
  combos: Combos;
  /** Species that cannot be bred; excluded as target AND as parent. */
  unbreedable: string[];
}

export type SolveResult =
  | { ok: true; plan: Plan }
  | { ok: false; reason: string; blocking?: string[] };

export const MAX_PASSIVES = 4;

/** Gender reachability of a node: bred pals can be re-rolled to either. */
interface Flags {
  male: boolean;
  female: boolean;
}

interface Entry {
  cost: number;
  contam: number;
  flags: Flags;
  /**
   * Set for bred entries. `seedA`/`seedB` record whether each parent was taken
   * as an owned Pal or as a bred one — without them, reconstruction can pick a
   * different variant than the one whose genders actually satisfied the pairing.
   */
  via?: { pair: Pair; maskA: number; maskB: number; seedA: boolean; seedB: boolean };
  seedPal?: PlannerPal;
  seedCandidates?: PlannerPal[];
}

const BOTH: Flags = { male: true, female: true };

function canPair(a: Flags, b: Flags): boolean {
  return (a.male && b.female) || (a.female && b.male);
}

/** Lexicographic: fewer steps first, then a cleaner pool. */
function better(a: Entry | undefined, b: Entry): boolean {
  if (!a) return true;
  if (b.cost !== a.cost) return b.cost < a.cost;
  return b.contam < a.contam;
}

export function solvePassivePlan(input: SolveInput): SolveResult {
  const { target, want, owned, combos, unbreedable } = input;

  if (want.length === 0) return { ok: false, reason: 'Pick at least one passive.' };
  if (want.length > MAX_PASSIVES) {
    return { ok: false, reason: `A Pal can hold at most ${MAX_PASSIVES} passives.` };
  }

  const blocked = new Set(unbreedable);
  if (blocked.has(target)) {
    return { ok: false, reason: 'That species cannot be bred, so it can never receive passives.' };
  }

  // A passive nobody owns can never enter a chain — say so before searching.
  const ownedPassives = new Set<string>();
  for (const p of owned) for (const s of p.passives) ownedPassives.add(s);
  const missing = want.filter((s) => !ownedPassives.has(s));
  if (missing.length) {
    return { ok: false, reason: 'No Pal in your box carries these.', blocking: missing };
  }

  const full = (1 << want.length) - 1;
  const bitOf = new Map(want.map((s, i) => [s, 1 << i]));
  const maskPassives = (mask: number): string[] => want.filter((_, i) => mask & (1 << i));

  // ---- seeds: owned pals that already satisfy a state outright ---------------
  const bySpecies = new Map<string, PlannerPal[]>();
  for (const p of owned) {
    if (!p.palId) continue;
    const list = bySpecies.get(p.palId);
    if (list) list.push(p);
    else bySpecies.set(p.palId, [p]);
  }

  /** Bitmask of wanted passives a pal carries. */
  const palMask = (p: PlannerPal): number => {
    let m = 0;
    for (const s of p.passives) m |= bitOf.get(s) ?? 0;
    return m;
  };

  const seedEntry = (species: string, mask: number): Entry | undefined => {
    const pool = bySpecies.get(species);
    if (!pool) return undefined;
    const candidates = pool.filter((p) => (palMask(p) & mask) === mask);
    if (!candidates.length) return undefined;
    // Fewest total passives = least dilution when this pal is used as a parent.
    const sorted = [...candidates].sort((a, b) => a.passives.length - b.passives.length);
    const flags: Flags = { male: false, female: false };
    for (const c of candidates) {
      if (c.gender === 'male') flags.male = true;
      if (c.gender === 'female') flags.female = true;
    }
    return { cost: 0, contam: 0, flags, seedPal: sorted[0], seedCandidates: sorted };
  };

  const species = Object.keys(combos);

  // Two tables: what a state costs as an owned pal, and as a bred one. Kept apart
  // because a seed may be the cheapest yet be the wrong gender for a pairing,
  // where the bred version costs more but can be either.
  //
  // Indexed as species -> array-by-mask rather than a `${species}#${mask}` map:
  // the relaxation performs tens of millions of lookups, and building those key
  // strings dominated the runtime.
  type Row = Array<Entry | undefined>;
  const seedTab = new Map<string, Row>();
  const bredTab = new Map<string, Row>();

  const getSeed = (sp: string, mask: number): Entry | undefined => seedTab.get(sp)?.[mask];
  const getBred = (sp: string, mask: number): Entry | undefined => bredTab.get(sp)?.[mask];
  const setBred = (sp: string, mask: number, e: Entry): void => {
    let row = bredTab.get(sp);
    if (!row) {
      row = new Array<Entry | undefined>(full + 1);
      bredTab.set(sp, row);
    }
    row[mask] = e;
  };

  for (const sp of species) {
    let row: Row | undefined;
    for (let mask = 0; mask <= full; mask++) {
      const e = seedEntry(sp, mask);
      if (!e) continue;
      if (!row) {
        row = new Array<Entry | undefined>(full + 1);
        seedTab.set(sp, row);
      }
      row[mask] = e;
    }
  }

  const bestOf = (sp: string, mask: number): Entry | undefined => {
    const s = getSeed(sp, mask);
    const b = getBred(sp, mask);
    if (s && b) return b.cost < s.cost ? b : s;
    return s ?? b;
  };

  /**
   * What each species can currently supply: the exact masks, plus `reach`, the
   * OR of them all.
   *
   * `reach` is what makes this fast. Most species carry none of the wanted
   * passives, so for a given pairing `(reach[a] | reach[b]) & mask !== mask`
   * rejects it in one integer test — before touching masks, variants or genders.
   * Without it the relaxation walks ~40M combinations a round and takes seconds.
   */
  interface Supply {
    masks: number[];
    set: Set<number>;
    reach: number;
  }

  const supplyIndex = (): Map<string, Supply> => {
    const idx = new Map<string, Supply>();
    const add = (sp: string, mask: number) => {
      let s = idx.get(sp);
      if (!s) {
        s = { masks: [], set: new Set(), reach: 0 };
        idx.set(sp, s);
      }
      if (!s.set.has(mask)) {
        s.set.add(mask);
        s.masks.push(mask);
        s.reach |= mask;
      }
    };
    const collect = (tab: Map<string, Row>) => {
      for (const [sp, row] of tab) {
        for (let mask = 0; mask <= full; mask++) if (row[mask]) add(sp, mask);
      }
    };
    collect(seedTab);
    collect(bredTab);
    return idx;
  };

  // ---- fixpoint relaxation ---------------------------------------------------
  for (let round = 0; round < MAX_PASSIVES + 2; round++) {
    let changed = false;
    const supply = supplyIndex();

    for (const child of species) {
      if (blocked.has(child)) continue; // cannot be produced by breeding
      const pairs = combos[child];
      if (!pairs) continue;

      for (let mask = 1; mask <= full; mask++) {
        // Already obtainable as an owned pal at zero cost — nothing to beat.
        if (getSeed(child, mask)) continue;

        for (const pair of pairs) {
          const [a, b] = pair;
          if (blocked.has(a) || blocked.has(b)) continue;

          const supplyA = supply.get(a);
          if (!supplyA) continue;
          const supplyB = supply.get(b);
          if (!supplyB) continue;
          // Between them, can these two even cover what this state needs?
          if (((supplyA.reach | supplyB.reach) & mask) !== mask) continue;

          for (const maskA of supplyA.masks) {
            if ((maskA & mask) !== maskA) continue; // must be a subset of what we need
            const maskB = mask & ~maskA;
            if (!supplyB.set.has(maskB)) continue;

            const sA = getSeed(a, maskA);
            const bA = getBred(a, maskA);
            const sB = getSeed(b, maskB);
            const bB = getBred(b, maskB);

            for (const [ea, seedA] of [
              [sA, true],
              [bA, false],
            ] as const) {
              if (!ea) continue;
              for (const [eb, seedB] of [
                [sB, true],
                [bB, false],
              ] as const) {
                if (!eb) continue;
                if (!canPair(ea.flags, eb.flags)) continue;
                // Same species and same requirement means the same pal pool; it
                // needs two distinct individuals, which the gender check implies.
                const poolSize = poolFor(ea, eb, maskA, maskB, maskPassives);
                const cand: Entry = {
                  cost: ea.cost + eb.cost + 1,
                  contam: ea.contam + eb.contam + Math.max(0, poolSize - bitCount(mask)),
                  flags: BOTH,
                  via: { pair, maskA, maskB, seedA, seedB },
                };
                if (better(getBred(child, mask), cand)) {
                  setBred(child, mask, cand);
                  changed = true;
                }
              }
            }
          }
        }
      }
    }

    if (!changed) break;
    // Round k discovers every plan of depth <= k, and a cheaper plan is never
    // deeper — so once the target has any solution, further rounds can only find
    // longer ones. Stopping here typically halves the work.
    if (bestOf(target, full)) break;
  }

  const rootEntry = bestOf(target, full);
  if (!rootEntry) {
    return {
      ok: false,
      reason: 'No chain reaches that combination from the Pals you own.',
      blocking: want,
    };
  }

  const root = reconstruct(target, full);
  if (!root) return { ok: false, reason: 'Found a cost but could not rebuild the chain.' };

  return { ok: true, plan: { root, steps: countSteps(root), contamination: rootEntry.contam } };

  // ---- helpers that close over the tables ------------------------------------
  /**
   * `need` is the gender this node must present to its pairing. Seeds must show a
   * real Pal of that gender — picking purely by "fewest passives" can name two
   * females for one pairing, a plan that reads fine and cannot be executed.
   * Bred nodes are re-rollable and ignore the request.
   */
  function reconstruct(sp: string, mask: number, wantGender?: 'male' | 'female', useSeed?: boolean): PlanNode | null {
    const seed = getSeed(sp, mask);
    const brd = getBred(sp, mask);
    const e = useSeed === undefined ? bestOf(sp, mask) : useSeed ? seed : brd;
    if (!e) return null;

    if (e.seedPal && e.cost === 0) {
      const pool = e.seedCandidates ?? [e.seedPal];
      const pick = wantGender ? pool.find((p) => p.gender === wantGender) : pool[0];
      if (!pick) return null;
      return { kind: 'seed', species: sp, need: maskPassives(mask), pal: pick, candidates: pool };
    }

    if (!e.via) return null;
    const { pair, maskA, maskB, seedA, seedB } = e.via;

    // Try both gender assignments; the relaxation guaranteed one of them works.
    for (const [gA, gB] of [
      ['male', 'female'],
      ['female', 'male'],
    ] as const) {
      const left = reconstruct(pair[0], maskA, seedA ? gA : undefined, seedA);
      const right = reconstruct(pair[1], maskB, seedB ? gB : undefined, seedB);
      if (!left || !right) continue;
      if (!genderOk(left, right)) continue;
      return {
        kind: 'breed',
        species: sp,
        need: maskPassives(mask),
        parents: [left, right],
        poolSize: nodePool(left).size + nodePool(right).size - overlap(nodePool(left), nodePool(right)),
      };
    }
    return null;
  }
}

/** A pairing needs one of each; bred parents can be re-rolled to either gender. */
function genderOk(a: PlanNode, b: PlanNode): boolean {
  if (a.kind !== 'seed' || b.kind !== 'seed') return true;
  if (a.pal.instanceId === b.pal.instanceId) return false;
  if (!a.pal.gender || !b.pal.gender) return false;
  return a.pal.gender !== b.pal.gender;
}

const bitCount = (n: number): number => {
  let c = 0;
  for (let x = n; x; x >>= 1) c += x & 1;
  return c;
};

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const v of a) if (b.has(v)) n++;
  return n;
}

/** Passives a finished node actually carries — seeds bring their extras along. */
export function nodePool(node: PlanNode): Set<string> {
  return node.kind === 'seed' ? new Set(node.pal.passives) : new Set(node.need);
}

function poolFor(
  ea: Entry,
  eb: Entry,
  maskA: number,
  maskB: number,
  maskPassives: (m: number) => string[],
): number {
  const set = new Set<string>();
  for (const s of ea.seedPal && ea.cost === 0 ? ea.seedPal.passives : maskPassives(maskA)) set.add(s);
  for (const s of eb.seedPal && eb.cost === 0 ? eb.seedPal.passives : maskPassives(maskB)) set.add(s);
  return set.size;
}

export function countSteps(node: PlanNode): number {
  if (node.kind === 'seed') return 0;
  return 1 + countSteps(node.parents[0]) + countSteps(node.parents[1]);
}

/** Post-order: parents are always bred before the child that needs them. */
export function flattenPlan(node: PlanNode): BreedNode[] {
  const out: BreedNode[] = [];
  const walk = (n: PlanNode): void => {
    if (n.kind === 'seed') return;
    walk(n.parents[0]);
    walk(n.parents[1]);
    out.push(n);
  };
  walk(node);
  return out;
}

/**
 * Re-checks a finished plan against the raw data. The solver is the kind of code
 * where a subtle bug produces a plausible-looking chain, so every plan is verified
 * independently: each pairing must exist in combos, and each child's passives must
 * genuinely come from its parents.
 */
export function validatePlan(node: PlanNode, combos: Combos, ownedById: Map<string, PlannerPal>): string[] {
  const errors: string[] = [];

  const walk = (n: PlanNode): void => {
    if (n.kind === 'seed') {
      const pal = ownedById.get(n.pal.instanceId);
      if (!pal) errors.push(`seed ${n.pal.instanceId} is not in the roster`);
      else {
        if (pal.palId !== n.species) errors.push(`seed ${n.pal.instanceId} is ${pal.palId}, expected ${n.species}`);
        for (const s of n.need) {
          if (!pal.passives.includes(s)) errors.push(`seed ${n.pal.instanceId} lacks ${s}`);
        }
      }
      return;
    }

    const [a, b] = n.parents;
    const pairs = combos[n.species] ?? [];
    const ok = pairs.some(
      ([x, y]) => (x === a.species && y === b.species) || (x === b.species && y === a.species),
    );
    if (!ok) errors.push(`${a.species} × ${b.species} does not produce ${n.species}`);

    const pool = new Set([...nodePool(a), ...nodePool(b)]);
    for (const s of n.need) {
      if (!pool.has(s)) errors.push(`${n.species} needs ${s}, absent from both parents`);
    }

    // Two owned Pals of the same gender cannot breed. The solver checks this on
    // aggregated gender flags, so only the reconstructed individuals prove it.
    if (a.kind === 'seed' && b.kind === 'seed') {
      if (a.pal.instanceId === b.pal.instanceId) {
        errors.push(`${n.species} pairs Pal ${a.pal.instanceId} with itself`);
      } else if (!a.pal.gender || !b.pal.gender) {
        errors.push(`${n.species} pairs a Pal of unknown gender`);
      } else if (a.pal.gender === b.pal.gender) {
        errors.push(`${n.species} pairs two ${a.pal.gender} Pals`);
      }
    }

    walk(a);
    walk(b);
  };

  walk(node);
  return errors;
}
