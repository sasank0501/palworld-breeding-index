import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import pals from '../data/pals.json';
import { BROWSE_ROSTER, silhouetteUrl } from './browse.ts';

const DIR = path.resolve(import.meta.dirname, '..', '..', 'public', 'silhouettes');
const nameOf = (img: string): string => img.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');

describe('silhouetteUrl', () => {
  it('names a silhouette after the species sprite, whatever folder the sprite is in', () => {
    expect(silhouetteUrl('pals/sheep-ball.webp', '/')).toBe('/silhouettes/sheep-ball.webp');
    expect(silhouetteUrl('sheep-ball.png', '/app/')).toBe('/app/silhouettes/sheep-ball.webp');
  });

  it('has none for a species with no sprite', () => {
    expect(silhouetteUrl(null)).toBeNull();
    expect(silhouetteUrl(undefined)).toBeNull();
    expect(silhouetteUrl('')).toBeNull();
  });
});

describe('the browse roster', () => {
  it('owns nothing, so every status in the app reads "not owned"', () => {
    expect(BROWSE_ROSTER.pals).toEqual([]);
    expect(BROWSE_ROSTER.unknown.characterIds).toEqual([]);
  });
});

// The silhouettes are committed game-derived art, allowed on the public site only as flat outlines
// (the owner's exception, 2026-10-12). These guard that: complete, small, and nothing but black.
describe('public/silhouettes', () => {
  const species = Object.values(pals as Record<string, { name: string; img: string | null }>);
  const wanted = [...new Set(species.filter((p) => p.img).map((p) => nameOf(p.img as string)))];

  it('has one for every species that has a sprite', () => {
    const have = new Set(fs.readdirSync(DIR).map((f) => f.replace(/\.webp$/, '')));
    expect(wanted.filter((n) => !have.has(n))).toEqual([]);
    expect(wanted.length).toBeGreaterThan(280);
  });

  it('has no stray files', () => {
    const wantedSet = new Set(wanted);
    const extra = fs.readdirSync(DIR).filter((f) => !f.endsWith('.webp') || !wantedSet.has(f.slice(0, -5)));
    expect(extra).toEqual([]);
  });

  it('is small: a page of 289 should cost a few megabytes at most', () => {
    const total = fs.readdirSync(DIR).reduce((n, f) => n + fs.statSync(path.join(DIR, f)).size, 0);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });

  it('is only outlines: every pixel that shows is pure black, with the shape in the alpha channel', async () => {
    const bad: string[] = [];
    for (const name of wanted) {
      const { data, info } = await sharp(path.join(DIR, `${name}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let ink = 0;
      let colour = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        if (data[i + 3] < 8) continue; // transparent
        ink++;
        if (data[i] > 6 || data[i + 1] > 6 || data[i + 2] > 6) colour++;
      }
      if (ink === 0 || colour > 0) bad.push(`${name}: ${ink} visible pixels, ${colour} not black`);
    }
    expect(bad).toEqual([]);
  }, 60_000);
});
