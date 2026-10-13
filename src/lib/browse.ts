import { createContext, useContext } from 'react';

import type { Roster } from '../types.ts';

/**
 * Browse mode: the app without a save. A visitor who has no Palworld save to hand (on a phone, or
 * just looking) opens the Paldex with nothing owned: all 289 species, each a flat silhouette from
 * public/silhouettes (scripts/build-silhouettes.mjs), and every species page with its parent pairs,
 * so breeding can be planned by hand. My Pals, Breeding and the Planner need pals, so they are not
 * offered, and the art system (the player's own copy of the game) is not asked for.
 */
export const BrowseContext = createContext(false);
export const useBrowse = (): boolean => useContext(BrowseContext);

/** A roster with nothing in it: the stand-in the browse page runs on. */
export const BROWSE_ROSTER: Roster = {
  world: 'browse',
  exportedAt: '',
  counts: {},
  pals: [],
  unknown: { characterIds: [], passives: [] },
};

/**
 * Where a species' silhouette is, from its sprite path in pals.json ("pals/sheep-ball.webp"), or
 * null for a species with no sprite. The same name the stills and models are matched on.
 */
export function silhouetteUrl(icon: string | null | undefined, base: string = import.meta.env.BASE_URL): string | null {
  if (!icon) return null;
  const name = icon.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
  return name ? `${base}silhouettes/${name}.webp` : null;
}
