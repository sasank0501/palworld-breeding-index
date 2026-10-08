/**
 * Where each of the game's pal icons goes in the art pack: pals/<name>.webp, the
 * file the app already asks for (pals.json `img`, e.g. pals/sheep-ball.webp for
 * the game's T_SheepBall_icon_normal). Matched ignoring case and punctuation,
 * as the save import matches codenames (src/save/species.ts): the game writes
 * SheepBall here and Sheepball there.
 */

const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** codename -> pack path, for every icon that belongs to a pal the app lists. */
export function iconPaths(codenames: readonly string[], pals: Record<string, { img?: string }>): Map<string, string> {
  const byCompact = new Map<string, string>();
  for (const pal of Object.values(pals)) {
    if (!pal.img) continue;
    const base = pal.img.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
    if (!byCompact.has(compact(base))) byCompact.set(compact(base), `pals/${base}.webp`);
  }
  const out = new Map<string, string>();
  for (const name of codenames) {
    const path = byCompact.get(compact(name));
    if (path) out.set(name, path);
  }
  return out;
}

/**
 * Pack paths the app asks for that the game has no icon for, each with the found
 * icon to stand in: the longest found name it starts with. Gumoss (Special),
 * pals/plant-slime-flower.webp, has no icon of its own and shows plain Gumoss's
 * (pals/plant-slime.webp), as its 3D model borrows Gumoss's mesh.
 */
export function iconFallbacks(found: Iterable<string>, pals: Record<string, { img?: string }>): Map<string, string> {
  const have = new Set(found);
  const stem = (p: string) => p.replace(/^pals\//, '').replace(/\.webp$/, '');
  const out = new Map<string, string>();
  for (const pal of Object.values(pals)) {
    if (!pal.img) continue;
    const want = `pals/${pal.img.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '')}.webp`;
    if (have.has(want)) continue;
    const base = [...have].filter((h) => stem(want).startsWith(`${stem(h)}-`)).sort((a, b) => b.length - a.length)[0];
    if (base) out.set(want, base);
  }
  return out;
}
