import { useEffect, useState } from 'react';

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
  stillsPromise ??= fetch(`${import.meta.env.BASE_URL}pal-portraits/index.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<StillIndex>) : {}))
    .catch(() => ({}));
  return stillsPromise;
}

function useStill(characterId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadStills().then((index) => {
      const hit = index[stripBoss(characterId).base];
      if (live) setUrl(hit ? `${import.meta.env.BASE_URL}pal-portraits/${hit.file}.webp?v=${hit.v}` : null);
    });
    return () => {
      live = false;
    };
  }, [characterId]);
  return url;
}

/** A pal's art: its chibi still, then the 100px dex sprite, then its initials. */
export function Portrait({ pal }: { pal: RosterPal }) {
  const dex = dexOf(pal);
  const still = useStill(pal.characterId);
  const [failed, setFailed] = useState<string | null>(null);

  if (still && failed !== still) {
    return <img className="still" src={still} alt="" loading="lazy" onError={() => setFailed(still)} />;
  }
  if (!dex?.img || failed === dex.img) {
    return <span className="dl-art-fallback">{speciesName(pal).slice(0, 2)}</span>;
  }
  return <img src={`/${dex.img}`} alt="" loading="lazy" onError={() => setFailed(dex.img)} />;
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
