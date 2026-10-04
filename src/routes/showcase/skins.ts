import { useState } from 'react';

/**
 * The Showcase's skins, one per Palworld place the community knows. Each is a full
 * re-skin (palette, type, shape, background), not just a colour swap; the tokens
 * live in src/design/showcase.css under `.sc-page[data-skin=...]`.
 */
export type Skin = 'pal' | 'obsidian' | 'sakura' | 'feybreak';

export interface SkinInfo {
  id: Skin;
  name: string;
  /** Where it comes from, shown as the tooltip. */
  blurb: string;
  /** Three colours for the switcher swatch: ground, panel, accent. */
  swatch: [string, string, string];
}

export const SKINS: SkinInfo[] = [
  {
    id: 'pal',
    name: 'Palpagos',
    blurb: 'The islands on a clear day: bright sky blue, chunky sticker outlines, toy-like.',
    swatch: ['#bfe3ff', '#ffffff', '#2f7bff'],
  },
  {
    id: 'obsidian',
    name: 'Mount Obsidian',
    blurb: 'Volcanic glass and lava: near-black, ember orange, angular.',
    swatch: ['#0c0b0f', '#1a171d', '#ff6a3d'],
  },
  {
    id: 'sakura',
    name: 'Sakurajima',
    blurb: 'Cherry blossom island: blush pink, plum ink, falling petals.',
    swatch: ['#ffe3ea', '#fffafb', '#d6407a'],
  },
  {
    id: 'feybreak',
    name: 'Feybreak',
    blurb: 'Frozen forest: deep teal night, aurora light, frosted glass.',
    swatch: ['#05161d', '#0e2c36', '#4ff0d2'],
  },
];

const KEY = 'palworld-sc-skin';

/** A per-browser preference; storage can be unavailable, so every access is guarded. */
export function useSkin(): [Skin, (s: Skin) => void] {
  const [skin, setSkin] = useState<Skin>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return SKINS.some((s) => s.id === v) ? (v as Skin) : 'pal';
    } catch {
      return 'pal';
    }
  });
  const choose = (s: Skin): void => {
    setSkin(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* not worth failing over */
    }
  };
  return [skin, choose];
}
