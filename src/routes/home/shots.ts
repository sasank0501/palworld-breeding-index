/**
 * The tour's screenshots: the app's own pages on a sample save, with every pal
 * drawn as a silhouette. They are made by `npm run capture-tour` from a local copy
 * of the game art and live in src/design/tour/. They are the one piece of game-derived
 * art the public repo and site carry, by the owner's decision (2026-10-12): shapes
 * only, never the pals' colours, stills or models. Nothing here fails without them:
 * a tree that lacks them gets a plain window.
 */
import type { Skin } from '../showcase/skins.ts';

export type TourPage = 'home' | 'mypals' | 'breeding' | 'planner';

/** What a screenshot shows, in CSS pixels: the app at 1360 x 1700, captured at 1.5x. */
export const SHOT = { w: 1360, h: 1700 } as const;

const files = import.meta.glob('../../design/tour/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Each skin has its own set, so the tour always shows the theme the page is in. */
export function shotUrl(page: TourPage, skin: Skin): string | null {
  return files[`../../design/tour/${page}-${skin}.webp`] ?? null;
}
