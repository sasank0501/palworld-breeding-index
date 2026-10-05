/**
 * An art pack: the game art the public site never hosts, kept in the visitor's
 * own browser (docs/WEBSITE-PLAN.md, Phase 4). It mirrors the folders the app
 * already asks for, so a path means the same thing on a server and in a pack:
 *
 *   pal-models/index.json      model manifest (src/design/PalModel.tsx)
 *   pal-models/<Name>.chibi.glb
 *   pal-portraits/index.json   still index (src/components/PalCards.tsx)
 *   pal-portraits/<Name>.webp
 *   pals/<slug>.webp           the flat 2D icons, the first art to arrive
 *
 * Today a pack comes from a folder the player picks (`npm run make-art-pack`
 * builds one); Phase 6's extractor will write the same layout straight from the
 * game files. This module is pure: no storage, no DOM, so it is unit-tested.
 */

export const PACK_FORMAT = 1;

/** The folders a pack may contain. Anything else in a picked folder is ignored. */
export const ART_DIRS = ['pal-models', 'pal-portraits', 'pals'] as const;

const ALLOWED = /^(pal-models\/[\w.-]+\.(glb|json)|pal-portraits\/[\w.-]+\.(webp|json)|pals\/[\w.-]+\.webp)$/;

export interface PackInfo {
  format: number;
  /** Unique per load; the storage folder's name, so a half-written pack never mixes with the live one. */
  id: string;
  createdAt: string;
  source: 'folder' | 'extractor';
  /**
   * False while an extraction is still filling it in. The app then shows icons as
   * silhouettes ("on its way") instead of as finished art.
   */
  complete: boolean;
  files: number;
  bytes: number;
  models: number;
  stills: number;
  icons: number;
}

export interface PackFile<F = File> {
  /** Path inside the pack, e.g. "pal-models/Anubis.chibi.glb". */
  path: string;
  file: F;
  size: number;
}

/**
 * The pack's files from a picked folder, whatever the player picked: the pack
 * folder itself or its parent. Each picked path is "<picked folder>/<...>", so
 * the pack path starts at the first art folder in it.
 */
export function selectPackFiles<F>(picked: Array<{ path: string; file: F; size: number }>): Array<PackFile<F>> {
  const out: Array<PackFile<F>> = [];
  const seen = new Set<string>();
  for (const p of picked) {
    const parts = p.path.replace(/\\/g, '/').split('/');
    const at = parts.findIndex((s) => (ART_DIRS as readonly string[]).includes(s));
    if (at < 0) continue;
    const path = parts.slice(at).join('/');
    if (!ALLOWED.test(path) || seen.has(path)) continue;
    seen.add(path);
    out.push({ path, file: p.file, size: p.size });
  }
  return out;
}

/** What a set of pack files holds, and why it can't be used, if it can't. */
export function describePack(files: Array<{ path: string; size: number }>): {
  models: number;
  stills: number;
  icons: number;
  bytes: number;
  problem: string | null;
} {
  const count = (re: RegExp) => files.filter((f) => re.test(f.path)).length;
  const models = count(/^pal-models\/.+\.glb$/);
  const stills = count(/^pal-portraits\/.+\.webp$/);
  const icons = count(/^pals\/.+\.webp$/);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const has = (p: string) => files.some((f) => f.path === p);
  let problem: string | null = null;
  if (!files.length) problem = 'No game art in that folder. Pick the art folder itself (it holds pal-models).';
  else if (models && !has('pal-models/index.json')) problem = 'The models are there but their list (pal-models/index.json) is missing.';
  else if (stills && !has('pal-portraits/index.json')) problem = 'The pictures are there but their list (pal-portraits/index.json) is missing.';
  else if (!models) problem = 'That folder has no 3D models (pal-models), and the 3D is what the art is for.';
  return { models, stills, icons, bytes, problem };
}

/** A short random id: a folder name for one load of a pack. */
export function newPackId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
