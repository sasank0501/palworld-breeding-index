import { describe, expect, it } from 'vitest';

import palsJson from './pals.json';
import passivesJson from './passives.json';

interface Entry {
  name: string;
  tier: string | number | null;
  effects: string[];
  lock: { type?: string; pals?: string[] } | null;
}

const passives = passivesJson as unknown as Record<string, Entry>;
const pals = palsJson as unknown as Record<string, { name: string }>;

/** The wiki/paldb rank scale, with 4 spelled "diamond" the way the dex renders it. */
const TIERS = new Set<string | number>(['diamond', 3, 2, 1, -1, -2, -3]);

describe('passive skills', () => {
  it('gives every id a name and at least one effect', () => {
    const bare = Object.entries(passives)
      .filter(([, v]) => !v.name?.trim() || !v.effects?.length)
      .map(([id]) => id);
    expect(bare).toEqual([]);
  });

  it('tiers every id on one scale', () => {
    // The acceptance criterion from docs/data-gaps.md: no dashed grey chips left.
    // A newly imported id with an unresolved tier should fail here.
    const untiered = Object.entries(passives)
      .filter(([, v]) => !TIERS.has(v.tier as string | number))
      .map(([id, v]) => `${id} (${JSON.stringify(v.tier)})`);
    expect(untiered).toEqual([]);
  });

  it('never reuses a display name across two ids', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [id, v] of Object.entries(passives)) {
      const prev = seen.get(v.name);
      if (prev) dupes.push(`${v.name}: ${prev} + ${id}`);
      else seen.set(v.name, id);
    }
    expect(dupes).toEqual([]);
  });

  it('resolves every species-locked pal name against the dex', () => {
    const names = new Set(Object.values(pals).map((p) => p.name));
    const unknown: string[] = [];
    for (const [id, v] of Object.entries(passives)) {
      for (const n of v.lock?.pals ?? []) if (!names.has(n)) unknown.push(`${id}: ${n}`);
    }
    expect(unknown).toEqual([]);
  });
});
