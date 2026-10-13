import type { Combos } from './breeding.ts';

/**
 * The pair calculator: two parents in, their child out. combos.json is keyed the other way
 * (child -> every pair that makes it), so this turns it round once into pair -> child.
 *
 * A pair has one child whichever parent is which, with one exception the game decides by sex
 * (meta.json `gender`: Katress with Wixen). A pair with no entry is one the data doesn't cover
 * (Astralym sits outside the matrix, docs/data-gaps.md), not proof that the two can't breed.
 */

/** meta.json's rule: parents a and b make `child` when a is `sexA` and b is `sexB`. */
export type GenderRule = [a: string, b: string, child: string, sexA: 'male' | 'female', sexB: 'male' | 'female'];

export type PairResult =
  | { kind: 'none' }
  | { kind: 'child'; child: string }
  | { kind: 'bySex'; outcomes: { child: string; female: string; male: string }[] };

export type PairIndex = Map<string, string[]>;

const key = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function pairIndex(combos: Combos): PairIndex {
  const index: PairIndex = new Map();
  for (const [child, pairs] of Object.entries(combos)) {
    for (const [a, b] of pairs) {
      const k = key(a, b);
      const children = index.get(k);
      if (!children) index.set(k, [child]);
      else if (!children.includes(child)) children.push(child);
    }
  }
  return index;
}

export function childOf(index: PairIndex, a: string, b: string, gender: GenderRule[] = []): PairResult {
  const children = index.get(key(a, b));
  if (!children?.length) return { kind: 'none' };
  if (children.length === 1) return { kind: 'child', child: children[0] };
  const outcomes = gender
    .filter(([ga, gb, child]) => key(ga, gb) === key(a, b) && children.includes(child))
    .map(([ga, gb, child, sexA]) => ({ child, female: sexA === 'female' ? ga : gb, male: sexA === 'female' ? gb : ga }));
  // Two children and no rule saying which: show the first rather than invent one.
  return outcomes.length ? { kind: 'bySex', outcomes } : { kind: 'child', child: children[0] };
}
