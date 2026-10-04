import { describe, expect, it } from 'vitest';

import { solveReach, summariseOwned, type Combos } from './breeding.ts';

const own = (palId: string, male = true, female = true) => ({ palId, count: 1, male, female });

describe('solveReach', () => {
  it('marks owned species as depth 0', () => {
    const r = solveReach({ owned: [own('A')], combos: {}, allIds: ['A'], unbreedable: [] });
    expect(r.depth.get('A')).toBe(0);
  });

  it('breeds a child one step from two owned parents', () => {
    const combos: Combos = { C: [['A', 'B']] };
    const r = solveReach({ owned: [own('A'), own('B')], combos, allIds: ['A', 'B', 'C'], unbreedable: [] });
    expect(r.depth.get('C')).toBe(1);
    expect(r.recipe.get('C')).toEqual(['A', 'B']);
  });

  it('chains through an intermediate species', () => {
    const combos: Combos = { C: [['A', 'B']], D: [['C', 'A']] };
    const r = solveReach({ owned: [own('A'), own('B')], combos, allIds: ['A', 'B', 'C', 'D'], unbreedable: [] });
    expect(r.depth.get('C')).toBe(1);
    expect(r.depth.get('D')).toBe(2);
  });

  it('does not let a species bred this round act as a parent in the same round', () => {
    const combos: Combos = { C: [['A', 'B']], D: [['C', 'A']] };
    const r = solveReach({ owned: [own('A'), own('B')], combos, allIds: ['A', 'B', 'C', 'D'], unbreedable: [] });
    // If rounds leaked, D would also come out at depth 1.
    expect(r.depth.get('D')).toBe(2);
  });

  it('requires both genders for a same-species pairing', () => {
    const combos: Combos = { C: [['A', 'A']] };
    const maleOnly = solveReach({ owned: [own('A', true, false)], combos, allIds: ['A', 'C'], unbreedable: [] });
    expect(maleOnly.depth.has('C')).toBe(false);
    expect(maleOnly.missingMate).toEqual(['A']);

    const both = solveReach({ owned: [own('A')], combos, allIds: ['A', 'C'], unbreedable: [] });
    expect(both.depth.get('C')).toBe(1);
  });

  it('requires opposite genders across two species', () => {
    const combos: Combos = { C: [['A', 'B']] };
    const sameGender = solveReach({
      owned: [own('A', true, false), own('B', true, false)],
      combos,
      allIds: ['A', 'B', 'C'],
      unbreedable: [],
    });
    expect(sameGender.depth.has('C')).toBe(false);

    const opposite = solveReach({
      owned: [own('A', true, false), own('B', false, true)],
      combos,
      allIds: ['A', 'B', 'C'],
      unbreedable: [],
    });
    expect(opposite.depth.get('C')).toBe(1);
  });

  it('treats bred species as either gender', () => {
    // C is produced by breeding, then paired with itself to make D.
    const combos: Combos = { C: [['A', 'B']], D: [['C', 'C']] };
    const r = solveReach({
      owned: [own('A', true, false), own('B', false, true)],
      combos,
      allIds: ['A', 'B', 'C', 'D'],
      unbreedable: [],
    });
    expect(r.depth.get('D')).toBe(2);
  });

  it('never produces an unbreedable species', () => {
    const combos: Combos = { C: [['A', 'B']] };
    const r = solveReach({ owned: [own('A'), own('B')], combos, allIds: ['A', 'B', 'C'], unbreedable: ['C'] });
    expect(r.depth.has('C')).toBe(false);
    expect(r.unreachable).toEqual([]); // excluded, not reported as a gap
  });

  it('reports species no chain can reach', () => {
    const combos: Combos = { C: [['X', 'Y']] };
    const r = solveReach({ owned: [own('A')], combos, allIds: ['A', 'C'], unbreedable: [] });
    expect(r.unreachable).toEqual(['C']);
  });
});

describe('summariseOwned', () => {
  it('collapses instances into per-species gender flags', () => {
    const out = summariseOwned([
      { palId: '1.0', gender: 'male' },
      { palId: '1.0', gender: 'male' },
      { palId: '2.0', gender: 'female' },
      { palId: null, gender: 'male' },
    ]);
    expect(out).toEqual([
      { palId: '1.0', count: 2, male: true, female: false },
      { palId: '2.0', count: 1, male: false, female: true },
    ]);
  });
});
