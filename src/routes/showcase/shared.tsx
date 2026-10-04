import { useEffect, useState } from 'react';

import palsJson from '../../data/pals.json';
import metaJson from '../../data/meta.json';
import passivesJson from '../../data/passives.json';
import { rankOf, rankSort, type Rank } from '../../lib/passiveCategories.ts';
import type { Combos } from '../../lib/breeding.ts';
import { loadStills } from '../../components/PalCards.tsx';
import type { PalDex, PassiveInfo } from '../../types.ts';

/** Data and small pieces shared by the Field register sections. */

export const DEX = palsJson as unknown as Record<string, PalDex>;
export const PASSIVES = passivesJson as unknown as Record<string, PassiveInfo>;
export const META = metaJson as unknown as { unbreedable: string[] };
export const UNBREEDABLE = new Set(META.unbreedable);
export const SPECIES_TOTAL = Object.keys(DEX).length;

export const nameOf = (id: string): string => DEX[id]?.name ?? id;
export const rankFor = (id: string): Rank | null => rankOf(id, PASSIVES[id]);
export const byRank = (ids: string[]): string[] =>
  [...ids].sort((a, b) => rankSort(rankFor(b)) - rankSort(rankFor(a)));

export const fmt = new Intl.NumberFormat('en');

/** Where a pal is kept, as the planner and pal sheet name it. */
export const LOCATION: Record<string, string> = {
  palbox: 'Pal Box',
  dimension: 'Dimensional storage',
  party: 'Party',
  base: 'Base camp',
  global: 'Global storage',
  unknown: 'Unknown',
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const roman = (n: number): string => ROMAN[n - 1] ?? String(n);

const RANK_GLYPH: Record<string, string> = { '5': '✦', '4': '◆', '3': '●●●', '2': '●●', '1': '●' };

export function traitClass(id: string): string {
  const r = rankFor(id);
  return r === null ? 'r-unk' : r < 0 ? 'r-neg' : `r-${r}`;
}

export function traitGlyph(id: string): string {
  const r = rankFor(id);
  return r === null ? '?' : r < 0 ? '✕' : RANK_GLYPH[String(r)];
}

/** A passive with no verified name reads as a field note, not a raw save key. */
export function TraitName({ id }: { id: string }) {
  return PASSIVES[id]?.name ? <>{PASSIVES[id].name}</> : <em>unidentified trait</em>;
}

/**
 * Chibi stills are keyed by the save's codename (SheepBall); the dex only
 * knows its sprite file (sheep-ball.webp). Squashed to letters and digits the
 * two agree for all 289 species.
 */
const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
let stills: Promise<Map<string, string>> | null = null;
/** compact(codename) -> codename, filled with the stills so a species can find its 3D model. */
const codenames = new Map<string, string>();
/** The stills index (shared with the pal portraits), re-keyed by compacted codename. */
function loadSpeciesStills(): Promise<Map<string, string>> {
  stills ??= loadStills().then((index) => {
    const m = new Map<string, string>();
    for (const [key, { file, v }] of Object.entries(index)) {
      const c = compact(key);
      if (!m.has(c)) m.set(c, `${import.meta.env.BASE_URL}pal-portraits/${file}.webp?v=${v}`);
      if (!codenames.has(c)) codenames.set(c, key);
    }
    return m;
  });
  return stills;
}

/**
 * The save's codename for a dex species (SheepBall for Lamball), which is how
 * the 3D model manifest is keyed. Null until the stills index has loaded, or when
 * this build has no art.
 */
export function useCodename(id: string): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const base = DEX[id]?.img?.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
    void loadSpeciesStills().then(() => live && setName(base ? (codenames.get(compact(base)) ?? null) : null));
    return () => {
      live = false;
    };
  }, [id]);
  return name;
}

/** Species art for a dex id: chibi still, then the dex sprite, then initials. */
export function SpeciesArt({ id }: { id: string }) {
  const dex = DEX[id];
  const [still, setStill] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const base = dex?.img?.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
    void loadSpeciesStills().then((m) => live && setStill(base ? (m.get(compact(base)) ?? null) : null));
    return () => {
      live = false;
    };
  }, [dex]);

  if (still && failed !== still) return <img src={still} alt="" loading="lazy" onError={() => setFailed(still)} />;
  if (dex?.img && failed !== dex.img)
    return <img src={`/${dex.img}`} alt="" loading="lazy" onError={() => setFailed(dex.img)} />;
  return <span className="dl-art-fallback">{nameOf(id).slice(0, 2)}</span>;
}

/** combos.json is ~700 KB, so each section that needs it loads it lazily (and once). */
let combosPromise: Promise<Combos> | null = null;
export function useCombos(): Combos | null {
  const [combos, setCombos] = useState<Combos | null>(null);
  useEffect(() => {
    let live = true;
    combosPromise ??= import('../../data/combos.json')
      .then((m) => m.default as unknown as Combos)
      .catch(() => {
        // A failed load must not be remembered as "no combos": that would pin every
        // later visit to an empty matrix. Forget it so the next mount retries.
        combosPromise = null;
        return {} as Combos;
      });
    void combosPromise?.then((c) => live && setCombos(c));
    return () => {
      live = false;
    };
  }, []);
  return combos;
}
