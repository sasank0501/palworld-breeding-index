import { describe, expect, it } from 'vitest';

import type { Combos } from './breeding.ts';
import {
  countSteps,
  flattenPlan,
  solvePassivePlan,
  validatePlan,
  type PlannerPal,
} from './passivePlan.ts';

let seq = 0;
const pal = (palId: string, gender: 'male' | 'female', passives: string[]): PlannerPal => ({
  instanceId: `i${seq++}`,
  palId,
  gender,
  passives,
});

/** Both genders of a species carrying the same passives. */
const pairOf = (palId: string, passives: string[]): PlannerPal[] => [
  pal(palId, 'male', passives),
  pal(palId, 'female', passives),
];

const selfBreeding = (ids: string[]): Combos =>
  Object.fromEntries(ids.map((id) => [id, [[id, id]] as Array<[string, string]>]));

describe('solvePassivePlan — base cases', () => {
  it('needs no steps when an owned Pal already has everything', () => {
    const combos = selfBreeding(['X']);
    const r = solvePassivePlan({
      target: 'X',
      want: ['A'],
      owned: [pal('X', 'male', ['A'])],
      combos,
      unbreedable: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.steps).toBe(0);
    expect(r.plan.root.kind).toBe('seed');
  });

  it('rejects more than four passives', () => {
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B', 'C', 'D', 'E'],
      owned: [],
      combos: selfBreeding(['X']),
      unbreedable: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/at most 4/i);
  });

  it('names the passives nobody owns instead of searching', () => {
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'GHOST'],
      owned: pairOf('X', ['A']),
      combos: selfBreeding(['X']),
      unbreedable: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.blocking).toEqual(['GHOST']);
  });
});

describe('solvePassivePlan — combining', () => {
  it('merges two passives from two same-species parents in one step', () => {
    const combos = selfBreeding(['X']);
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B'],
      owned: [pal('X', 'male', ['A']), pal('X', 'female', ['B'])],
      combos,
      unbreedable: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.steps).toBe(1);
    const [step] = flattenPlan(r.plan.root);
    expect(new Set(step.need)).toEqual(new Set(['A', 'B']));
  });

  it('builds a 2+2 tree for four passives — three breeding operations', () => {
    const combos = selfBreeding(['X']);
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B', 'C', 'D'],
      owned: [
        pal('X', 'male', ['A']),
        pal('X', 'female', ['B']),
        pal('X', 'male', ['C']),
        pal('X', 'female', ['D']),
      ],
      combos,
      unbreedable: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.steps).toBe(3);
    // Last step is the final merge to all four.
    const steps = flattenPlan(r.plan.root);
    expect(steps).toHaveLength(3);
    expect(new Set(steps[2].need)).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('pulls a passive across species when the target lacks it', () => {
    // Y x Y = X, so a passive held only on Y reaches X in one step.
    const combos: Combos = { X: [['Y', 'Y']], Y: [['Y', 'Y']] };
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B'],
      owned: [pal('Y', 'male', ['A']), pal('Y', 'female', ['B'])],
      combos,
      unbreedable: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.steps).toBe(1);
    expect(r.plan.root.kind).toBe('breed');
  });
});

describe('solvePassivePlan — constraints', () => {
  it('will not pair a single Pal with itself', () => {
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B'],
      owned: [pal('X', 'male', ['A']), pal('X', 'male', ['B'])], // both male
      combos: selfBreeding(['X']),
      unbreedable: [],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts the same parents once genders differ', () => {
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B'],
      owned: [pal('X', 'male', ['A']), pal('X', 'female', ['B'])],
      combos: selfBreeding(['X']),
      unbreedable: [],
    });
    expect(r.ok).toBe(true);
  });

  it('refuses an unbreedable target', () => {
    const r = solvePassivePlan({
      target: 'X',
      want: ['A'],
      owned: pairOf('X', ['A']),
      combos: selfBreeding(['X']),
      unbreedable: ['X'],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/cannot be bred/i);
  });

  it('never routes through an unbreedable parent', () => {
    // The only route to X is via Y, which cannot breed.
    const combos: Combos = { X: [['Y', 'Y']], Y: [['Y', 'Y']] };
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B'],
      owned: [pal('Y', 'male', ['A']), pal('Y', 'female', ['B'])],
      combos,
      unbreedable: ['Y'],
    });
    expect(r.ok).toBe(false);
  });

  it('prefers the cleaner parent when two could serve', () => {
    // Both carry A; one drags three extra passives along.
    const combos = selfBreeding(['X']);
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B'],
      owned: [
        pal('X', 'male', ['A', 'JUNK1', 'JUNK2', 'JUNK3']),
        pal('X', 'male', ['A']),
        pal('X', 'female', ['B']),
      ],
      combos,
      unbreedable: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const step = flattenPlan(r.plan.root)[0];
    const chosen = step.parents.find((p) => p.kind === 'seed' && p.need.includes('A'));
    expect(chosen?.kind).toBe('seed');
    if (chosen?.kind === 'seed') expect(chosen.pal.passives).toEqual(['A']);
  });
});

describe('validatePlan', () => {
  it('accepts a plan the solver produced', () => {
    const owned = [pal('X', 'male', ['A']), pal('X', 'female', ['B'])];
    const combos = selfBreeding(['X']);
    const r = solvePassivePlan({ target: 'X', want: ['A', 'B'], owned, combos, unbreedable: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byId = new Map(owned.map((p) => [p.instanceId, p]));
    expect(validatePlan(r.plan.root, combos, byId)).toEqual([]);
  });

  it('catches a pairing that does not produce the stated child', () => {
    const combos: Combos = { X: [['X', 'X']], Y: [['Y', 'Y']] };
    const a = pal('Y', 'male', ['A']);
    const b = pal('Y', 'female', ['B']);
    const byId = new Map([a, b].map((p) => [p.instanceId, p]));
    const bogus = {
      kind: 'breed' as const,
      species: 'X',
      need: ['A', 'B'],
      poolSize: 2,
      parents: [
        { kind: 'seed' as const, species: 'Y', need: ['A'], pal: a, candidates: [a] },
        { kind: 'seed' as const, species: 'Y', need: ['B'], pal: b, candidates: [b] },
      ] as [never, never],
    };
    expect(validatePlan(bogus, combos, byId).join(' ')).toMatch(/does not produce/);
  });

  it('catches a child needing a passive neither parent has', () => {
    const combos = selfBreeding(['X']);
    const a = pal('X', 'male', ['A']);
    const b = pal('X', 'female', ['B']);
    const byId = new Map([a, b].map((p) => [p.instanceId, p]));
    const bogus = {
      kind: 'breed' as const,
      species: 'X',
      need: ['A', 'B', 'C'],
      poolSize: 2,
      parents: [
        { kind: 'seed' as const, species: 'X', need: ['A'], pal: a, candidates: [a] },
        { kind: 'seed' as const, species: 'X', need: ['B'], pal: b, candidates: [b] },
      ] as [never, never],
    };
    expect(validatePlan(bogus, combos, byId).join(' ')).toMatch(/absent from both parents/);
  });
});

describe('countSteps / flattenPlan', () => {
  it('orders steps so every parent is bred before its child', () => {
    const combos = selfBreeding(['X']);
    const r = solvePassivePlan({
      target: 'X',
      want: ['A', 'B', 'C', 'D'],
      owned: [
        pal('X', 'male', ['A']),
        pal('X', 'female', ['B']),
        pal('X', 'male', ['C']),
        pal('X', 'female', ['D']),
      ],
      combos,
      unbreedable: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const steps = flattenPlan(r.plan.root);
    expect(steps).toHaveLength(countSteps(r.plan.root));
    // Each step's need grows: the final one is the full set.
    expect(steps[steps.length - 1].need).toHaveLength(4);
  });
});
