import { describe, expect, it } from 'vitest';

import combosJson from '../data/combos.json';
import metaJson from '../data/meta.json';
import palsJson from '../data/pals.json';
import type { Combos } from './breeding.ts';
import { childOf, pairIndex, type GenderRule } from './pair.ts';

describe('childOf', () => {
  const combos: Combos = { C: [['A', 'B']], A: [['A', 'A']], X: [['M', 'N']], Y: [['M', 'N']] };
  const gender: GenderRule[] = [
    ['M', 'N', 'X', 'female', 'male'],
    ['M', 'N', 'Y', 'male', 'female'],
  ];
  const index = pairIndex(combos);

  it('finds the child whichever way round the parents are given', () => {
    expect(childOf(index, 'A', 'B')).toEqual({ kind: 'child', child: 'C' });
    expect(childOf(index, 'B', 'A')).toEqual({ kind: 'child', child: 'C' });
  });

  it('breeds a species with itself', () => {
    expect(childOf(index, 'A', 'A')).toEqual({ kind: 'child', child: 'A' });
  });

  it('says so when the data has no entry for a pair', () => {
    expect(childOf(index, 'B', 'B')).toEqual({ kind: 'none' });
  });

  it('gives both children, with who must be female, where sex decides', () => {
    expect(childOf(index, 'N', 'M', gender)).toEqual({
      kind: 'bySex',
      outcomes: [
        { child: 'X', female: 'M', male: 'N' },
        { child: 'Y', female: 'N', male: 'M' },
      ],
    });
  });

  it('falls back to one child when two are listed and no rule says which', () => {
    expect(childOf(index, 'M', 'N')).toEqual({ kind: 'child', child: 'X' });
  });
});

describe('the real matrix', () => {
  const index = pairIndex(combosJson as unknown as Combos);
  const gender = (metaJson as unknown as { gender: GenderRule[] }).gender;
  const ids = Object.keys(palsJson);

  it('answers every pair of species in the matrix with exactly one child, bar the sex-decided pair', () => {
    const inMatrix = ids.filter((id) => childOf(index, id, id).kind !== 'none');
    let bySex = 0;
    for (let i = 0; i < inMatrix.length; i++) {
      for (let j = i; j < inMatrix.length; j++) {
        const r = childOf(index, inMatrix[i], inMatrix[j], gender);
        expect(r.kind, `${inMatrix[i]} + ${inMatrix[j]}`).not.toBe('none');
        if (r.kind === 'bySex') bySex++;
      }
    }
    expect(inMatrix.length).toBe(ids.length - 1);
    expect(bySex).toBe(1);
  });

  it('knows Lamball with Cattiva, and Katress with Wixen', () => {
    const id = (name: string) => Object.values(palsJson).find((p) => p.name === name)!.id;
    const name = (pid: string) => (palsJson as unknown as Record<string, { name: string }>)[pid].name;
    const r = childOf(index, id('Lamball'), id('Cattiva'), gender);
    expect(r.kind).toBe('child');
    const k = childOf(index, id('Wixen'), id('Katress'), gender);
    expect(k.kind === 'bySex' && k.outcomes.map((o) => `${name(o.female)} f + ${name(o.male)} m = ${name(o.child)}`)).toEqual([
      'Katress f + Wixen m = Katress Ignis',
      'Wixen f + Katress m = Wixen Noct',
    ]);
  });
});
