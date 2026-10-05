/**
 * Phase 5: the card pictures ("stills"), made in the player's browser from the
 * 3D models in their art pack. The same recipe as scripts/render-portraits.mjs
 * and its harness, moved into the page:
 *
 *   1. A hidden <model-viewer> (the app's own 3D viewer) loads the chibi model,
 *      holds the first frame of Idle (or the bind pose, per chibi-overrides.json),
 *      frames it from just off front, and exports a PNG with its own toBlob().
 *   2. A canvas trims the transparent margin, crops anything wider than 1.5:1 to
 *      its middle, fits the pal to 88% of a 512 px square sitting slightly low,
 *      and encodes WebP. (sharp did this in Node.)
 *   3. The still is written into the pack under pal-portraits/, and the index is
 *      updated every few pictures so cards fill in, hatching, as they arrive.
 *
 * The viewer must be on screen (model-viewer stops drawing when it is not), so it
 * sits in the window at opacity 0, under everything, ignoring the pointer.
 */

import overridesJson from '../../scripts/chibi-overrides.json';
import pals from '../data/pals.json';
import { buildSpeciesIndex, type PalDexEntry } from '../save/species.ts';
import type { PackInfo } from './pack.ts';
import type { ArtStorage } from './storage.ts';

export const STILL = { size: 512, fill: 0.88, maxAspect: 1.5, lowness: 0.62, quality: 0.86, view: 768 };
const OVERRIDES = overridesJson as Record<string, { pose?: string }>;
const species = buildSpeciesIndex(pals as unknown as Record<string, PalDexEntry>);

interface ModelEntry {
  v: number;
  chibi: boolean;
  file?: string;
}

/** The distinct chibi model files that are dex species, as in render-portraits. */
export function stillsToMake(manifest: Record<string, ModelEntry>): Array<{ file: string; names: string[] }> {
  const files = new Map<string, string[]>();
  for (const [name, e] of Object.entries(manifest)) {
    if (!e.chibi) continue;
    const file = e.file ?? name;
    if (!files.has(file)) {
      if (!species.lookup(name)) continue;
      files.set(file, []);
    }
    files.get(file)!.push(name);
  }
  // Aliases that are not species themselves still point at a rendered file.
  for (const [name, e] of Object.entries(manifest)) {
    const file = e.file ?? name;
    const names = files.get(file);
    if (e.chibi && names && !names.includes(name)) names.push(name);
  }
  return [...files].map(([file, names]) => ({ file, names }));
}

// ---------------------------------------------------------------- the image step

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The smallest box holding every pixel more than barely transparent (sharp's trim
 * at threshold 1), or null when nothing in the shot reaches `solid` (the
 * render-portraits test for an empty still: no pixel above alpha 10).
 */
export function opaqueBounds(alpha: (x: number, y: number) => number, width: number, height: number, threshold = 1, solid = 10): Box | null {
  let peak = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = alpha(x, y);
      if (a > peak) peak = a;
      if (a > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 || peak <= solid ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Where the trimmed pal goes on the square: very wide pals cropped to their
 * middle first (a T-posed wingspan would shrink to a sliver), then fitted to
 * `fill` of the square and set a little below centre, like a portrait.
 */
export function placeStill(box: Box, o = STILL): { src: Box; dst: Box } {
  let src = box;
  if (box.w / box.h > o.maxAspect) {
    const w = Math.round(box.h * o.maxAspect);
    src = { x: box.x + Math.round((box.w - w) / 2), y: box.y, w, h: box.h };
  }
  const inner = Math.round(o.size * o.fill);
  const scale = Math.min(inner / src.w, inner / src.h);
  const w = Math.round(src.w * scale);
  const h = Math.round(src.h * scale);
  return { src, dst: { x: Math.round((o.size - w) / 2), y: Math.round((o.size - h) * o.lowness), w, h } };
}

async function compose(png: Blob): Promise<Blob | null> {
  const bmp = await createImageBitmap(png);
  const scan = document.createElement('canvas');
  scan.width = bmp.width;
  scan.height = bmp.height;
  const sctx = scan.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(bmp, 0, 0);
  const data = sctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const box = opaqueBounds((x, y) => data[(y * bmp.width + x) * 4 + 3], bmp.width, bmp.height);
  if (!box) return null;
  const { src, dst } = placeStill(box);
  const out = document.createElement('canvas');
  out.width = out.height = STILL.size;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
  bmp.close();
  // WebP where the browser can encode it; a PNG otherwise (image decoders read the content, not the name).
  return new Promise((r) => out.toBlob((b) => r(b), 'image/webp', STILL.quality));
}

// ---------------------------------------------------------------- the 3D step

type Viewer = HTMLElement & {
  src: string;
  availableAnimations: string[];
  animationName: string;
  currentTime: number;
  cameraOrbit: string;
  play(): void;
  pause(): void;
  updateFraming(): Promise<void>;
  jumpCameraToGoal(): void;
  toBlob(o: { mimeType: string }): Promise<Blob>;
};

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

async function makeViewer(): Promise<Viewer> {
  const { ModelViewerElement } = await import('@google/model-viewer');
  // The lite models are meshopt-compressed (see enableMeshopt in PalModel.tsx).
  const mvClass = ModelViewerElement as unknown as { meshoptDecoderLocation: string };
  if (!mvClass.meshoptDecoderLocation) mvClass.meshoptDecoderLocation = 'data:text/javascript,';
  const mv = document.createElement('model-viewer') as unknown as Viewer;
  mv.setAttribute('interaction-prompt', 'none');
  mv.setAttribute('shadow-intensity', '0');
  mv.setAttribute('exposure', '0.85');
  mv.setAttribute('tone-mapping', 'aces');
  mv.setAttribute('aria-hidden', 'true');
  Object.assign(mv.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${STILL.view}px`,
    height: `${STILL.view}px`,
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '-1',
    background: 'transparent',
  });
  mv.style.setProperty('--poster-color', 'transparent');
  document.body.append(mv);
  await customElements.whenDefined('model-viewer');
  return mv;
}

async function shoot(mv: Viewer, url: string, pose: string): Promise<Blob> {
  if (mv.src !== url) {
    const loaded = new Promise<void>((resolve, reject) => {
      mv.addEventListener('load', () => resolve(), { once: true });
      mv.addEventListener('error', () => reject(new Error('the model did not load')), { once: true });
    });
    mv.src = url;
    await loaded;
  }
  if (pose === 'bind') {
    // No animation: the bind pose, which always faces the camera (see the harness).
    mv.pause();
    const key = Object.getOwnPropertySymbols(mv).find((k) => k.description === 'scene');
    const scene = key && (mv as unknown as Record<symbol, { mixer?: { stopAllAction(): void }; queueRender?(): void }>)[key];
    scene?.mixer?.stopAllAction();
    scene?.queueRender?.();
  } else {
    if (mv.availableAnimations.includes('Idle')) mv.animationName = 'Idle';
    mv.play();
    mv.currentTime = 0;
    mv.pause();
  }
  await frame();
  await mv.updateFraming();
  mv.cameraOrbit = '20deg 82deg auto';
  mv.jumpCameraToGoal();
  await frame();
  await frame();
  return mv.toBlob({ mimeType: 'image/png' });
}

// ---------------------------------------------------------------- the run

export interface StillsProgress {
  done: number;
  total: number;
  failed: number;
  msPerStill: number;
  /** Which models failed, and why, so a failure is never silent. */
  failures: string[];
}

/**
 * Make every missing still in the current pack. Stills already in it are kept,
 * so a stopped run resumes where it left off. `onBatch` fires after the index is
 * written (every few stills), so the app can show the new pictures.
 */
export async function makeStills(
  storage: ArtStorage,
  info: PackInfo,
  modelUrl: (file: string) => Promise<string | null>,
  onProgress: (p: StillsProgress) => void,
  onBatch: () => void,
  signal?: AbortSignal,
): Promise<StillsProgress> {
  const read = async <T,>(path: string): Promise<T | null> => {
    const b = await storage.read(info.id, path);
    return b ? (JSON.parse(await b.text()) as T) : null;
  };
  const manifest = (await read<Record<string, ModelEntry>>('pal-models/index.json')) ?? {};
  const index = (await read<Record<string, { file: string; v: number }>>('pal-portraits/index.json')) ?? {};
  const have = new Set(Object.values(index).map((e) => e.file));
  const todo = stillsToMake(manifest).filter((t) => !have.has(t.file));
  const progress: StillsProgress = { done: 0, total: todo.length, failed: 0, msPerStill: 0, failures: [] };
  if (!todo.length) return progress;

  const mv = await makeViewer();
  const t0 = performance.now();
  let sinceWrite = 0;
  const writeIndex = async () => {
    await storage.write(info.id, 'pal-portraits/index.json', new Blob([JSON.stringify(index)], { type: 'application/json' }));
    sinceWrite = 0;
    onBatch();
  };
  try {
    for (const { file, names } of todo) {
      signal?.throwIfAborted();
      try {
        const url = await modelUrl(`pal-models/${file}.chibi.glb`);
        if (!url) throw new Error('model missing');
        const pose = OVERRIDES[file]?.pose ?? 'idle';
        let still = await compose(await shoot(mv, url, pose));
        // A pose can carry the pal out of shot (FairyDragon flies): fall back to the
        // bind pose. A fresh load is needed (stopping the loop on the loaded model did
        // not always restore it), and a blob: URL can't take a query, so a #fragment
        // makes the address new while naming the same file.
        if (!still && pose !== 'bind') still = await compose(await shoot(mv, `${url}#bind`, 'bind'));
        if (!still) throw new Error('nothing in shot');
        await storage.write(info.id, `pal-portraits/${file}.webp`, still);
        const v = Date.now();
        for (const name of names) index[name] = { file, v };
        sinceWrite++;
      } catch (e) {
        progress.failed++;
        progress.failures.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
      progress.done++;
      progress.msPerStill = Math.round((performance.now() - t0) / progress.done);
      onProgress({ ...progress, failures: [...progress.failures] });
      if (sinceWrite >= 12) await writeIndex();
    }
  } finally {
    if (sinceWrite) await writeIndex();
    mv.remove();
  }
  return progress;
}
