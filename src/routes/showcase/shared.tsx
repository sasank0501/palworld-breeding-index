import { useEffect, useState } from 'react';

import palsJson from '../../data/pals.json';
import metaJson from '../../data/meta.json';
import passivesJson from '../../data/passives.json';
import { rankOf, rankSort, type Rank } from '../../lib/passiveCategories.ts';
import type { Combos } from '../../lib/breeding.ts';
import { onArtChange, onStillsChange, useArtVersion, useStillsVersion } from '../../art/resolve.ts';
import { ArtImage, loadStills, useStillPath } from '../../components/PalCards.tsx';
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

/**
 * The rank glyph (◆, ●●●, ✕) is a picture: screen readers would say "black
 * diamond" or nothing. It is hidden from them and, where no heading already says
 * the rank, replaced by words ("rank IV", "flaw").
 */
export function TraitGlyph({ id, label = true }: { id: string; label?: boolean }) {
  const r = rankFor(id);
  return (
    <>
      <i aria-hidden="true">{traitGlyph(id)}</i>
      {label && <span className="sr-only">{r === null ? 'unranked' : r < 0 ? 'flaw' : `rank ${roman(r)}`}: </span>}
    </>
  );
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
/** The stills index (shared with the pal portraits), as compact(codename) -> codename. */
function loadCodenames(): Promise<Map<string, string>> {
  stills ??= loadStills().then((index) => {
    const m = new Map<string, string>();
    for (const key of Object.keys(index)) if (!m.has(compact(key))) m.set(compact(key), key);
    return m;
  });
  return stills;
}
onArtChange(() => (stills = null));
onStillsChange(() => (stills = null));

/**
 * The save's codename for a dex species (SheepBall for Lamball), which is how
 * the 3D model manifest is keyed. Null until the stills index has loaded, or when
 * this build has no art.
 */
export function useCodename(id: string): string | null | undefined {
  const version = useArtVersion();
  const stillsV = useStillsVersion();
  // undefined while the index loads, so pictures know to wait rather than give up.
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setName(undefined);
    const base = DEX[id]?.img?.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
    void loadCodenames().then((m) => live && setName(base ? (m.get(compact(base)) ?? null) : null));
    return () => {
      live = false;
    };
  }, [id, version, stillsV]);
  return name;
}

/** Species art for a dex id: chibi still, then the dex icon, then the egg (ArtImage). */
export function SpeciesArt({ id }: { id: string }) {
  const dex = DEX[id];
  const still = useStillPath(useCodename(id));
  return <ArtImage still={still} icon={dex?.img} element={dex?.types?.[0]} />;
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
