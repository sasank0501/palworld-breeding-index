/**
 * The whole extraction, game to art pack (Phase 6, step 7): icons first, then every
 * pal's model as it is built, then the pack is marked complete. (The card stills come
 * afterwards, from src/art/stillsRunner.ts, because they need the models.)
 *
 * The pack is live from the first icon, with `complete: false`, so the app shows
 * silhouettes for what is on its way and real art for what has arrived. A run that
 * is stopped or fails keeps what it wrote; the next run picks up the same pack and
 * skips every pal whose model is already in it. That is also why a re-extraction
 * replaces an older pack as soon as its icons are in, rather than at the end: a
 * stop must not cost the 12 minutes already spent. The older pack's files are
 * deleted when the new one is complete.
 */

import { describePack, newPackId, PACK_FORMAT, type PackInfo } from '../art/pack.ts';
import type { ArtStorage } from '../art/storage.ts';
import type { Extractor } from './client.ts';
import type { BuiltModel, ModelEntry } from './model/build.ts';
import { extractAll } from './run.ts';
import type { PalExport } from './types.ts';

export type Phase = 'icons' | 'models' | 'finishing';

export interface PipelineProgress {
  phase: Phase;
  /** Pals finished (built or skipped) / all pals; icons count in `icons`. */
  done: number;
  total: number;
  current: string | null;
  /** Of `done`, how many a previous run had already finished. */
  resumed: number;
  icons: number;
  failed: Array<{ name: string; error: string }>;
  /** Bytes written to the pack so far. */
  bytes: number;
}

export interface PipelineOptions {
  /** Pals only; all when absent (the bench uses this for a quick run). */
  only?: readonly string[];
  /** The model builder: step 6's buildModel with the browser's WebP encoder. */
  build: (pal: PalExport) => Promise<BuiltModel>;
  /** Folds aliases into the manifest (step 6's foldAliases). */
  foldAliases: (manifest: Record<string, ModelEntry>, aliases: Record<string, string>) => number;
  manifestText: (manifest: Record<string, ModelEntry>) => string;
  onProgress?: (p: PipelineProgress) => void;
  signal?: AbortSignal;
  /** Called whenever the stored pack changed, so the page re-reads it (artChanged). */
  onChange?: () => void;
}

export interface PipelineResult {
  info: PackInfo;
  failed: PipelineProgress['failed'];
  notes: string[];
  ms: number;
}

const MANIFEST = 'pal-models/index.json';
/** The manifest is rewritten this often during a run, so a stopped run is still usable. */
const SAVE_EVERY = 10;

const blobOf = (text: string) => new Blob([text], { type: 'application/json' });

export async function extractToPack(
  x: Pick<Extractor, 'listPals' | 'exportPal' | 'exportIcons'>,
  storage: ArtStorage,
  opts: PipelineOptions,
): Promise<PipelineResult> {
  const t0 = performance.now();
  const notes: string[] = [];

  // Resume the unfinished extractor pack if there is one; otherwise start a fresh one.
  const before = await storage.current();
  const resuming = !!before && !before.complete && before.source === 'extractor';
  const id = resuming ? before.id : newPackId();
  let info: PackInfo = resuming
    ? before
    : { format: PACK_FORMAT, id, createdAt: new Date().toISOString(), source: 'extractor', complete: false, files: 0, bytes: 0, models: 0, stills: 0, icons: 0 };

  const manifest: Record<string, ModelEntry> = {};
  const have = new Set<string>(); // models actually stored (aliases have none)
  if (resuming) {
    const stored = await storage.read(id, MANIFEST);
    if (stored) Object.assign(manifest, JSON.parse(await stored.text()) as Record<string, ModelEntry>);
    for (const [name, e] of Object.entries(manifest)) if (!e.file) have.add(name);
  }

  const progress: PipelineProgress = { phase: 'icons', done: 0, total: 0, current: null, resumed: 0, icons: info.icons, failed: [], bytes: info.bytes };
  const report = () => opts.onProgress?.({ ...progress, failed: [...progress.failed] });
  let written = info.files;
  const publish = async () => {
    info = { ...info, models: have.size, icons: progress.icons, bytes: progress.bytes, files: written };
    await storage.setCurrent(info);
    opts.onChange?.();
  };
  const put = async (path: string, blob: Blob) => {
    opts.signal?.throwIfAborted();
    await storage.write(id, path, blob);
    progress.bytes += blob.size;
    written++;
  };
  const saveManifest = async () => {
    await put(MANIFEST, blobOf(opts.manifestText(manifest)));
  };

  try {
    // 1. Icons: the quick silhouettes, so the player sees something within seconds.
    if (!resuming || info.icons === 0) {
      report();
      const icons = await x.exportIcons();
      for (const i of icons.icons) {
        await put(i.path, i.blob);
        progress.icons++;
      }
      if (icons.failed.length) notes.push(`${icons.failed.length} icons failed: ${icons.failed.map((f) => f.codename).join(', ')}`);
      await publish();
      report();
    }

    // 2. Models, one pal at a time.
    progress.phase = 'models';
    const { aliases } = await x.listPals();
    let sinceSave = 0;
    const run = await extractAll(x, {
      only: opts.only,
      signal: opts.signal,
      isDone: (name) => have.has(name),
      onProgress: (p) => {
        progress.done = p.done;
        progress.total = p.total;
        progress.current = p.current;
        progress.resumed = p.skipped;
        progress.failed = p.failed;
        report();
      },
      onPal: async (pal) => {
        const built = await opts.build(pal);
        await put(`pal-models/${pal.name}.chibi.glb`, new Blob([built.glb as BlobPart], { type: 'model/gltf-binary' }));
        manifest[pal.name] = built.entry;
        have.add(pal.name);
        notes.push(...built.notes);
        if (++sinceSave >= SAVE_EVERY) {
          sinceSave = 0;
          await saveManifest();
          await publish();
        }
      },
    });

    // 3. Finish: aliases, the manifest, and the pack becomes complete.
    progress.phase = 'finishing';
    report();
    opts.foldAliases(manifest, aliases);
    await saveManifest();
    const summary = describePack([
      { path: MANIFEST, size: 0 },
      ...[...have].map((n) => ({ path: `pal-models/${n}.chibi.glb`, size: 0 })),
    ]);
    if (summary.problem) throw new Error(summary.problem);
    info = { ...info, complete: true };
    await publish();
    // The new pack is live and whole: sweep the old one and anything left behind.
    for (const old of await storage.ids()) if (old !== id) await storage.remove(old).catch(() => undefined);
    return { info, failed: run.failed, notes, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    // Keep what was written (it resumes), but make sure the manifest on disk matches it.
    if (have.size) {
      await storage.write(id, MANIFEST, blobOf(opts.manifestText(manifest))).catch(() => undefined);
      await publish().catch(() => undefined);
    }
    throw e;
  }
}
