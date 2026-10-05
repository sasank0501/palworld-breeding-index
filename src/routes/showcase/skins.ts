import { useEffect, useState } from 'react';

import { readPrefs, writePrefs } from '../../userdata/store.ts';

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

const isSkin = (v: unknown): v is Skin => SKINS.some((s) => s.id === v);

/**
 * A per-browser preference. localStorage answers synchronously, so the first
 * paint is already in the right skin; the user-data store (src/userdata) keeps a
 * copy that goes into backups, and fills in when localStorage was cleared or a
 * backup was restored. Storage can be unavailable, so every access is guarded.
 */
export function useSkin(): [Skin, (s: Skin) => void] {
  const [skin, setSkin] = useState<Skin>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return isSkin(v) ? v : 'pal';
    } catch {
      return 'pal';
    }
  });
  useEffect(() => {
    let live = true;
    void readPrefs().then((p) => {
      let local: string | null = null;
      try {
        local = localStorage.getItem(KEY);
      } catch {
        /* unavailable */
      }
      if (live && !local && isSkin(p.skin)) setSkin(p.skin);
    });
    return () => {
      live = false;
    };
  }, []);
  const choose = (s: Skin): void => {
    setSkin(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* not worth failing over */
    }
    void writePrefs({ skin: s });
  };
  return [skin, choose];
}
