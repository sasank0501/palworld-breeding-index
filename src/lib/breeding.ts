/**
 * Breeding reachability over the roster.
 *
 * combos.json is an exhaustive parent-pair -> child matrix (41,617 pairs covering
 * all 288 children in the rank ladder), so "what can I breed?" is a plain BFS from
 * the species you already own — no heuristics, no partial recipe table. Astralym is
 * the one dex entry outside the matrix; it is marked unbreedable, and the `combos[id]`
 * lookup below tolerates a missing key regardless.
 *
 * The part a generic breeding calculator cannot do: gender. Owning one Lamball
 * does not let you breed Lamball x Lamball. Because the roster carries per-instance
 * gender we can require a real male/female pairing for the first step. Species
 * obtained *by* breeding are treated as either gender, since egg gender is random
 * and repeatable — the constraint only genuinely binds on what is already in the box.
 */

export type Pair = [string, string];
export type Combos = Record<string, Pair[]>;

export interface OwnedSpecies {
  palId: string;
  count: number;
  male: boolean;
  female: boolean;
}

export interface Reach {
  /** palId -> breeding steps away. 0 means already owned. */
  depth: Map<string, number>;
  /** palId -> the parent pair chosen for it (only for depth >= 1). */
  recipe: Map<string, Pair>;
  /** Breedable species that no chain reaches from the current roster. */
  unreachable: string[];
  /** Owned species that cannot currently be paired with themselves. */
  missingMate: string[];
}

export interface Availability {
  male: boolean;
  female: boolean;
}

/**
 * A pair is usable when it can produce one male and one female between the two
 * species — including the same-species case, which needs both genders of it.
 */
export function canPair(a: string, b: string, have: Map<string, Availability>): boolean {
  const av = have.get(a);
  const bv = have.get(b);
  if (!av || !bv) return false;
  if (a === b) return av.male && av.female;
  return (av.male && bv.female) || (av.female && bv.male);
}

export interface SolveInput {
  owned: OwnedSpecies[];
  combos: Combos;
  /** Every dex id, so we can report what is neither owned nor reachable. */
  allIds: string[];
  /** Species that cannot be produced by breeding at all. */
  unbreedable: string[];
  /** Cap on chain length; guards against pathological input, not normally hit. */
  maxDepth?: number;
}

export function solveReach({ owned, combos, allIds, unbreedable, maxDepth = 12 }: SolveInput): Reach {
  const cannotBeBred = new Set(unbreedable);
  const depth = new Map<string, number>();
  const recipe = new Map<string, Pair>();
  const have = new Map<string, Availability>();
  const missingMate: string[] = [];

  for (const o of owned) {
    depth.set(o.palId, 0);
    have.set(o.palId, { male: o.male, female: o.female });
    if (!(o.male && o.female)) missingMate.push(o.palId);
  }

  const pending = allIds.filter((id) => !depth.has(id) && !cannotBeBred.has(id));

  for (let round = 1; round <= maxDepth; round++) {
    // Collect the whole round before applying it, so a species bred this round
    // cannot also be used as a parent within the same round.
    const found: Array<[string, Pair]> = [];
    for (const id of pending) {
      if (depth.has(id)) continue;
      const pairs = combos[id];
      if (!pairs) continue;
      for (const pair of pairs) {
        if (canPair(pair[0], pair[1], have)) {
          found.push([id, pair]);
          break;
        }
      }
    }
    if (found.length === 0) break;
    for (const [id, pair] of found) {
      depth.set(id, round);
      recipe.set(id, pair);
      // Bred pals can be re-bred for either gender, so both become available.
      have.set(id, { male: true, female: true });
    }
  }

  const unreachable = pending.filter((id) => !depth.has(id));
  return { depth, recipe, unreachable, missingMate };
}

/** Collapses a roster into per-species ownership with gender flags. */
export function summariseOwned(
  pals: Array<{ palId: string | null; gender: 'male' | 'female' | null }>,
): OwnedSpecies[] {
  const map = new Map<string, OwnedSpecies>();
  for (const p of pals) {
    if (!p.palId) continue;
    let e = map.get(p.palId);
    if (!e) {
      e = { palId: p.palId, count: 0, male: false, female: false };
      map.set(p.palId, e);
    }
    e.count++;
    if (p.gender === 'male') e.male = true;
    if (p.gender === 'female') e.female = true;
  }
  return [...map.values()];
}
