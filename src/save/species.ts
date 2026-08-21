/**
 * Maps a save's internal `CharacterID` onto the dex ids used by pals.json.
 *
 * There is no explicit codename column in pals.json, but there doesn't need to be:
 * the image basenames are the kebab-cased internal names already, so `SheepBall`
 * resolves through `pals/sheep-ball.webp` to "1.0". That keeps a single source of
 * truth instead of a hand-maintained 300-row lookup that would rot every patch.
 *
 * Not every CharacterID is a Pal — captured humans (`BOSS_Hunter_Rifle`) and NPCs
 * share the same map, and they legitimately have no dex entry. Callers get `null`
 * and decide; the importer reports them rather than dropping them silently.
 */

export interface PalDexEntry {
  id: string;
  name: string;
  img: string | null;
}

export interface SpeciesMatch {
  palId: string;
  /** Alpha/boss variant — `BOSS_` prefix in the save. */
  isBoss: boolean;
}

export interface SpeciesIndex {
  lookup(characterId: string): SpeciesMatch | null;
  /** Dex ids reachable from this index, for coverage assertions in tests. */
  readonly size: number;
}

/** `AmaterasuWolf_Dark` -> `amaterasu-wolf-dark`, matching the image basenames. */
export function kebab(name: string): string {
  return name
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** Strips the alpha-variant prefix, reporting whether it was present. */
export function stripBoss(characterId: string): { base: string; isBoss: boolean } {
  const m = /^BOSS_/i.exec(characterId);
  return m ? { base: characterId.slice(m[0].length), isBoss: true } : { base: characterId, isBoss: false };
}

/** Collapses to letters and digits so `Sheepball` and `SheepBall` land together. */
const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildSpeciesIndex(pals: Record<string, PalDexEntry>): SpeciesIndex {
  const byBasename = new Map<string, string>();
  const bySlugName = new Map<string, string>();
  // The save is not consistent about casing — Lamball appears as both `SheepBall`
  // and `Sheepball` — so word boundaries alone are not enough to match on.
  const byCompact = new Map<string, string>();

  for (const pal of Object.values(pals)) {
    if (pal.img) {
      const basename = pal.img.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
      byBasename.set(basename, pal.id);
      if (!byCompact.has(compact(basename))) byCompact.set(compact(basename), pal.id);
    }
    // Fallback for dex entries with no artwork: match on the display name.
    bySlugName.set(kebab(pal.name).replace(/[^a-z0-9]+/g, '-'), pal.id);
    if (!byCompact.has(compact(pal.name))) byCompact.set(compact(pal.name), pal.id);
  }

  return {
    size: byBasename.size,
    lookup(characterId: string): SpeciesMatch | null {
      if (!characterId || characterId === 'None') return null;
      const { base, isBoss } = stripBoss(characterId);
      const key = kebab(base);
      const palId = byBasename.get(key) ?? bySlugName.get(key) ?? byCompact.get(compact(base));
      return palId ? { palId, isBoss } : null;
    },
  };
}
