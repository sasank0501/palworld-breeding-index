import { describe, expect, it } from 'vitest';

import pals from '../data/pals.json';
import { iconFallbacks, iconPaths } from './icons.ts';
import { toRgba } from './pixels.ts';

describe('toRgba', () => {
  it('passes RGBA through and swaps BGRA', () => {
    expect([...toRgba(new Uint8Array([1, 2, 3, 4]), 1, 1, 'PF_R8G8B8A8')]).toEqual([1, 2, 3, 4]);
    expect([...toRgba(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 2, 1, 'PF_B8G8R8A8')]).toEqual([3, 2, 1, 4, 7, 6, 5, 8]);
  });

  it('spreads a grey channel to an opaque grey', () => {
    expect([...toRgba(new Uint8Array([9, 200]), 2, 1, 'PF_G8')]).toEqual([9, 9, 9, 255, 200, 200, 200, 255]);
  });

  it('refuses a format it doesn’t know, and a short buffer', () => {
    expect(() => toRgba(new Uint8Array(4), 1, 1, 'PF_DXT5')).toThrow(/PF_DXT5 isn’t handled/);
    expect(() => toRgba(new Uint8Array(3), 1, 1, 'PF_R8G8B8A8')).toThrow(/only 3 bytes/);
  });
});

describe('iconPaths', () => {
  it('names each icon the way the app asks for it, ignoring case', () => {
    const got = iconPaths(['SheepBall', 'Sheepball', 'AmaterasuWolf_Dark', 'KingBahamut', 'NotAPal_Test'], pals as Record<string, { img?: string }>);
    expect(got.get('SheepBall')).toBe('pals/sheep-ball.webp');
    expect(got.get('Sheepball')).toBe('pals/sheep-ball.webp');
    expect(got.get('AmaterasuWolf_Dark')).toBe('pals/amaterasu-wolf-dark.webp');
    expect(got.get('KingBahamut')).toBe('pals/king-bahamut.webp');
    expect(got.has('NotAPal_Test')).toBe(false);
  });
});

describe('iconFallbacks', () => {
  it('gives a form with no icon of its own its base form’s', () => {
    const got = iconFallbacks(['pals/plant-slime.webp', 'pals/sheep-ball.webp'], {
      a: { img: 'pals/plant-slime-flower.webp' },
      b: { img: 'pals/plant-slime.webp' },
      c: { img: 'pals/sheep-ball.webp' },
      d: { img: 'pals/unknown-thing.webp' },
    });
    expect([...got]).toEqual([['pals/plant-slime-flower.webp', 'pals/plant-slime.webp']]);
  });
});
