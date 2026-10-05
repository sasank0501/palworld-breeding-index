import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { artJson, onArtChange, useArtState, useArtUrl, useArtVersion } from '../art/resolve.ts';
import { ArtPlaceholder } from './ArtPlaceholder.tsx';
import palsJson from '../data/pals.json';
import passivesJson from '../data/passives.json';
import { stripBoss } from '../save/species.ts';
import type { PalDex, PassiveInfo, RosterPal } from '../types.ts';

/**
 * Small helpers the Showcase builds on: how a pal is named and scored, its
 * portrait, and the work-suitability icon. The screens themselves live in
 * src/routes/showcase/.
 */

const DEX = palsJson as unknown as Record<string, PalDex>;
const PASSIVES = passivesJson as unknown as Record<string, PassiveInfo>;

const dexOf = (p: RosterPal): PalDex | undefined => (p.palId ? DEX[p.palId] : undefined);
export const speciesName = (p: RosterPal): string => dexOf(p)?.name ?? p.characterId;
/** A nickname is the player's own name for the pal, so it wins over the species. */
export const displayName = (p: RosterPal): string => p.nickname ?? speciesName(p);
export const ivTotal = (p: RosterPal): number => p.ivs.hp + p.ivs.attack + p.ivs.defense;

export const passiveLabel = (id: string): string => PASSIVES[id]?.name ?? id;

/**
 * Rendered chibi stills (scripts/render-portraits.mjs), keyed like the model
 * manifest by base codename. Fetched once per page load and shared; a missing
 * index (no stills rendered) just means every card keeps its sprite.
 */
export type StillIndex = Record<string, { file: string; v: number }>;
let stillsPromise: Promise<StillIndex> | null = null;
export function loadStills(): Promise<StillIndex> {
  stillsPromise ??= artJson<StillIndex>('pal-portraits/index.json').then((i) => i ?? {});
  return stillsPromise;
}
// A pack loaded or removed: the index is read again.
onArtChange(() => (stillsPromise = null));

/**
 * The still for a codename, as a path in the art: undefined while the index (or
 * the codename itself, when passed undefined) is still loading, null for none.
 */
export function useStillPath(codename: string | null | undefined): { path: string; v: number } | null | undefined {
  const version = useArtVersion();
  const [hit, setHit] = useState<{ path: string; v: number } | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setHit(undefined);
    if (codename === undefined) return;
    void loadStills().then((index) => {
      const e = codename ? index[codename] : undefined;
      if (live) setHit(e ? { path: `pal-portraits/${e.file}.webp`, v: e.v } : null);
    });
    return () => {
      live = false;
    };
  }, [codename, version]);
  return hit;
}

/** Art that takes longer than this shows the egg first, then hatches; faster art just appears. */
export const HATCH_AFTER_MS = 150;
/** Longest a tile's hatch can take, its place in the ripple included (showcase.css, "Hatch"). */
const TILE_HATCH_MS = 1200;

/**
 * A pal or species picture, best first: the chibi still, then the flat 2D icon,
 * then the element-tinted egg. While an extraction is still filling the pack
 * (Phase 6), an icon without its still shows as a silhouette: art on its way, not
 * the finished look. The 3D model, where there is one, replaces all of this.
 *
 * If the egg was on screen when the picture arrives, it hatches (style D, "quick"):
 * the egg squashes and the picture grows in its place, each Paldex tile a beat
 * after the one before. Under 150 ms (art from disk on a return visit) there is
 * no egg and no show.
 */
export function ArtImage({ still, icon, element }: { still: { path: string; v: number } | null | undefined; icon?: string | null; element?: string }) {
  const art = useArtState();
  const stillUrl = useArtUrl(still?.path ?? null, still?.v);
  const iconUrl = useArtUrl(icon ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const [hatching, setHatching] = useState<string | null>(null);
  const since = useRef(performance.now());
  const shown = useRef<string | null | undefined>(undefined);

  const pending = still === undefined || stillUrl === undefined || (!stillUrl && iconUrl === undefined);
  const url = pending ? undefined : stillUrl && failed !== stillUrl ? stillUrl : iconUrl && failed !== iconUrl ? iconUrl : null;

  // A different species in the same spot (the pal sheet's next/previous) starts
  // over. Keyed on the icon, not the still: the still's path changes when art
  // arrives, and that is exactly the moment to hatch, not to reset.
  useLayoutEffect(() => {
    since.current = performance.now();
    shown.current = undefined;
    setHatching(null);
  }, [icon]);

  // Decided before paint, so the picture never flashes up ahead of its hatch.
  useLayoutEffect(() => {
    if (url === undefined || url === shown.current) return;
    const before = shown.current;
    shown.current = url;
    const eggWasUp = before === null || (before === undefined && performance.now() - since.current > HATCH_AFTER_MS);
    if (!url || !eggWasUp) return;
    setHatching(url);
    const t = window.setTimeout(() => setHatching(null), TILE_HATCH_MS);
    return () => window.clearTimeout(t);
  }, [url]);

  if (url === undefined) return <ArtPlaceholder element={element} pending />;
  if (url === null) return <ArtPlaceholder element={element} />;
  const arriving = url === iconUrl && art?.kind === 'local' && !art.info.complete;
  const img = (
    <img
      className={url === stillUrl ? 'still' : arriving ? 'art-silhouette' : undefined}
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(url)}
    />
  );
  if (hatching !== url) return img;
  return (
    <span className="art-hatch">
      <ArtPlaceholder element={element} />
      {img}
    </span>
  );
}

/** A pal's art: its chibi still, then its dex icon, then the egg. */
export function Portrait({ pal }: { pal: RosterPal }) {
  const dex = dexOf(pal);
  const still = useStillPath(stripBoss(pal.characterId).base);
  return <ArtImage still={still} icon={dex?.img} element={dex?.types?.[0]} />;
}

/**
 * A work-suitability icon. The icons are game art fetched locally by
 * `npm run build-portraits` and are not in the repo, so a build without them
 * hides the broken image and keeps the slot, leaving the text label to carry
 * the row.
 */
export function WorkIcon({ job, className }: { job: string; className?: string }) {
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}work-icons/${job}.webp`}
      alt=""
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}

/** How a pal is named once it may have left the save: "Fluff (Lamball)", or "Lamball". */
export function palLabel(pal: RosterPal): string {
  const name = displayName(pal);
  const species = speciesName(pal);
  return name === species ? species : `${name} (${species})`;
}
