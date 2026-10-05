/**
 * Write a pack into storage, then make it the live one. Runs in the art worker
 * (src/art/art.worker.ts); kept apart from it so tests can drive it directly.
 *
 * Order matters for Phase 6, when the extractor fills a pack while the player
 * watches: icons first (the quick silhouettes), then the stills, then the lists,
 * then the 3D models.
 */

import { describePack, newPackId, PACK_FORMAT, type PackFile, type PackInfo } from './pack.ts';
import type { ArtStorage } from './storage.ts';

export interface Progress {
  done: number;
  total: number;
  bytes: number;
  totalBytes: number;
}

const rank = (path: string): number =>
  path.startsWith('pals/') ? 0 : path.startsWith('pal-portraits/') && !path.endsWith('.json') ? 1 : path.endsWith('.json') ? 2 : 3;

export async function storePack(
  storage: ArtStorage,
  files: Array<PackFile<Blob>>,
  source: PackInfo['source'],
  onProgress: (p: Progress) => void = () => undefined,
  signal?: AbortSignal,
): Promise<PackInfo> {
  const summary = describePack(files);
  if (summary.problem) throw new Error(summary.problem);

  const id = newPackId();
  const ordered = [...files].sort((a, b) => rank(a.path) - rank(b.path));
  const progress: Progress = { done: 0, total: ordered.length, bytes: 0, totalBytes: summary.bytes };
  try {
    for (const f of ordered) {
      signal?.throwIfAborted();
      await storage.write(id, f.path, f.file);
      progress.done++;
      progress.bytes += f.size;
      onProgress({ ...progress });
    }
    const info: PackInfo = {
      format: PACK_FORMAT,
      id,
      createdAt: new Date().toISOString(),
      source,
      complete: true,
      files: ordered.length,
      bytes: summary.bytes,
      models: summary.models,
      stills: summary.stills,
      icons: summary.icons,
    };
    await storage.setCurrent(info);
    // The new pack is live: sweep the old one and anything an earlier load left behind.
    for (const old of await storage.ids()) if (old !== id) await storage.remove(old).catch(() => undefined);
    return info;
  } catch (e) {
    await storage.remove(id).catch(() => undefined);
    throw e;
  }
}

/** Forget the pack: nothing is live, and every stored file is deleted. */
export async function removePack(storage: ArtStorage): Promise<void> {
  await storage.setCurrent(null);
  for (const id of await storage.ids()) await storage.remove(id);
}
