/**
 * Saving a copy of the art to a file, and remembering whether the player has been offered it.
 * The file's layout is src/art/archive.ts; loading one back is `loadArtFile` in src/art/loader.ts.
 *
 * A browser won't write a file by itself, so this can't happen silently when the models finish:
 * the app offers it then (src/routes/showcase/Art.tsx) and one click saves it.
 */

import { ARCHIVE_EXT, archiveParts } from './archive.ts';
import { artState } from './resolve.ts';

export type CopyResult = { ok: true; name: string; bytes: number; files: number } | { ok: false; problem: string };

/**
 * Build the file from the pack in this browser and hand it to the browser's own download. With
 * the pack in the origin private file system, each stored file is a reference, not a copy in
 * memory, so a 210 MB pack doesn't need 210 MB of memory to save.
 */
export async function saveArtCopy(): Promise<CopyResult> {
  const art = await artState();
  if (art.kind !== 'local') return { ok: false, problem: 'There is no art in this browser to save yet.' };
  const { storage, info } = art;
  try {
    let paths = (await storage.list(info.id)).sort();
    // Card pictures are written before the list that names them (it is rewritten every dozen), so a
    // copy taken while they are being made could hold pictures and no list, which a load refuses.
    // Without the list, leave the pictures out: they are remade from the models after a load.
    if (!paths.includes('pal-portraits/index.json')) paths = paths.filter((p) => !p.startsWith('pal-portraits/'));
    const files: Array<{ path: string; blob: Blob }> = [];
    for (const path of paths) {
      const blob = await storage.read(info.id, path);
      if (blob) files.push({ path, blob });
    }
    if (!files.some((f) => f.path.endsWith('.glb'))) return { ok: false, problem: 'The art in this browser has no 3D models yet, so there is nothing worth saving.' };
    const blob = new Blob(archiveParts(files), { type: 'application/octet-stream' });
    const name = `PalDoc art (${info.models} pals)${ARCHIVE_EXT}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    // The download reads from the URL after the click returns; a minute is ample for it to start.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    markOffered(info.id);
    return { ok: true, name, bytes: blob.size, files: files.length };
  } catch (e) {
    return { ok: false, problem: `The copy couldn’t be made (${e instanceof Error ? e.message : String(e)}).` };
  }
}

// ---- the offer: once per pack, until it is saved or turned down ----

const KEY = 'paldoc-art-copy';

/** True when this pack's copy has been saved or declined on this device. */
export function wasOffered(packId: string): boolean {
  try {
    return localStorage.getItem(KEY) === packId;
  } catch {
    return true; // storage blocked: don't ask on every page view
  }
}

export function markOffered(packId: string): void {
  try {
    localStorage.setItem(KEY, packId);
  } catch {
    // Nothing to remember it in; the offer shows again next visit.
  }
}
