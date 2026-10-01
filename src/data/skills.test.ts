import { describe, expect, it } from 'vitest';

import skillsJson from './skills.json';
import type { ActiveSkill } from '../types.ts';

const SKILLS = skillsJson as unknown as Record<string, ActiveSkill>;

/** The nine element ids pals.json uses; a skill outside them has no colour. */
const ELEMENTS = new Set(['neutral', 'fire', 'water', 'grass', 'electric', 'ice', 'ground', 'dark', 'dragon']);

describe('skills.json', () => {
  const entries = Object.entries(SKILLS);

  it('is a full table, not a truncated download', () => {
    expect(entries.length).toBeGreaterThan(300);
  });

  it('gives every skill a name, a known element and numeric stats', () => {
    for (const [id, s] of entries) {
      expect(s.name, id).toBeTruthy();
      expect(ELEMENTS.has(s.element), `${id} element ${s.element}`).toBe(true);
      expect(Number.isFinite(s.power) && s.power >= 0, `${id} power`).toBe(true);
      expect(Number.isFinite(s.cooldown) && s.cooldown >= 0, `${id} cooldown`).toBe(true);
    }
  });

  // Spot values confirmed against paldb.cc at v1.0.5. The wiki's older numbers
  // (Acid Rain 80 / 18s) are Early Access and must not creep back in.
  it('carries 1.0 numbers', () => {
    expect(SKILLS.AirCanon).toMatchObject({ name: 'Air Cannon', element: 'neutral', power: 40, cooldown: 2 });
    expect(SKILLS.AcidRain).toMatchObject({ element: 'water', power: 120, cooldown: 8 });
  });
});
