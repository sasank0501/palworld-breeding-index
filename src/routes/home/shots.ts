/**
 * The tour's screenshots: the app's own pages on a sample save, with every pal
 * drawn as a silhouette. They are made by `npm run capture-tour` from a local copy
 * of the game art and live in src/design/tour/. They are the one piece of game-derived
 * art the public repo and site carry, by the owner's decision (2026-10-12): shapes
 * only, never the pals' colours, stills or models. Nothing here fails without them:
 * a tree that lacks them gets a plain window.
 */
export type TourPage = 'home' | 'mypals' | 'breeding' | 'planner';

/** What a screenshot shows, in CSS pixels: the app at 1360 x 1700, captured at 1.5x. */
export const SHOT = { w: 1360, h: 1700 } as const;

const files = import.meta.glob('../../design/tour/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** `dark` for the two dark skins (Mount Obsidian, Feybreak), light for the other two. */
export function shotUrl(page: TourPage, dark: boolean): string | null {
  return files[`../../design/tour/${page}-${dark ? 'dark' : 'light'}.webp`] ?? null;
}
