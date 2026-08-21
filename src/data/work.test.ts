import { describe, expect, it } from 'vitest';

import palsJson from './pals.json';
import { MAX_WORK_LEVEL, WORK_SUITABILITIES, isKnownWorkCode, workName } from './work.ts';

const pals = palsJson as unknown as Record<string, { name: string; work: Array<{ job: string; level: number }> }>;

describe('work suitabilities', () => {
  it('covers every job code used in the dex', () => {
    // The acceptance criterion from docs/data-gaps.md: nothing renders as an
    // abbreviation. A dex refresh introducing a new code should fail here.
    const unknown = new Set<string>();
    for (const pal of Object.values(pals)) {
      for (const w of pal.work) if (!isKnownWorkCode(w.job)) unknown.add(w.job);
    }
    expect([...unknown]).toEqual([]);
  });

  it('has exactly the twelve suitabilities, uniquely coded and ordered', () => {
    expect(WORK_SUITABILITIES).toHaveLength(12);
    expect(new Set(WORK_SUITABILITIES.map((w) => w.code)).size).toBe(12);
    expect(WORK_SUITABILITIES.map((w) => w.order)).toEqual([...Array(12).keys()]);
  });

  it('resolves codes to readable names and passes through unknown ones', () => {
    expect(workName('Kdl')).toBe('Kindling');
    expect(workName('Elc')).toBe('Generating Electricity');
    expect(workName('Nope')).toBe('Nope');
  });

  it('MAX_WORK_LEVEL matches the highest level in the dex', () => {
    let max = 0;
    for (const pal of Object.values(pals)) for (const w of pal.work) max = Math.max(max, w.level);
    expect(MAX_WORK_LEVEL).toBe(max);
  });
});
