/**
 * The one place the app turns an art path ("pal-models/Anubis.chibi.glb") into
 * something an <img> or <model-viewer> can load. Where the art comes from:
 *
 *   local   a pack in this browser (the public site): a blob: URL to the stored
 *           file. Works on a hard reload and in private windows, where a Service
 *           Worker would be skipped (docs/WEBSITE-PLAN.md, Phase 4).
 *   server  the dev server or the portfolio build, which host the art: the plain URL.
 *   none    no art yet. Callers show the placeholder, and the app asks for the art.
 *
 * A pack in this browser wins over the server, so the public flow can be tried on
 * the dev server too. Every change (a pack loaded or removed, here or in another
 * tab) bumps a version that components re-read on.
 */

import { useEffect, useState } from 'react';

import type { PackInfo } from './pack.ts';
import { openStorage, type ArtStorage } from './storage.ts';

export type ArtState =
  | { kind: 'local'; storage: ArtStorage; info: PackInfo }
  | { kind: 'server' }
  | { kind: 'none'; storage: ArtStorage | null };

const BASE = import.meta.env.BASE_URL;
let state: Promise<ArtState> | null = null;
const urls = new Map<string, Promise<string | null>>();

/**
 * The dev server answers a missing file with index.html, so "has art" means the
 * model list parses as JSON, not merely a 200.
 */
async function serverHasArt(): Promise<boolean> {
  // The public build never hosts art (vite.config.ts): don't ask, and don't log a 404.
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'resume') return false;
  try {
    const res = await fetch(`${BASE}pal-models/index.json`, { cache: 'no-store' });
    if (!res.ok) return false;
    await res.json();
    return true;
  } catch {
    return false;
  }
}

async function detect(): Promise<ArtState> {
  const storage = await openStorage();
  const info = await storage?.current().catch(() => null);
  if (storage && info) return { kind: 'local', storage, info };
  return (await serverHasArt()) ? { kind: 'server' } : { kind: 'none', storage };
}

export function artState(): Promise<ArtState> {
  state ??= detect();
  return state;
}

/**
 * A loadable URL for a pack path, or null when there is no such art. `v` is the
 * server's cache-busting stamp; a blob URL is new for every pack anyway (and a
 * query string would break it).
 */
export function artUrl(path: string, v?: number): Promise<string | null> {
  let hit = urls.get(path);
  if (!hit) {
    hit = artState().then(async (s) => {
      if (s.kind === 'server') return `${BASE}${path}`;
      if (s.kind === 'none') return null;
      const blob = await s.storage.read(s.info.id, path).catch(() => null);
      return blob ? URL.createObjectURL(blob) : null;
    });
    urls.set(path, hit);
  }
  return hit.then((u) => (u && v !== undefined && !u.startsWith('blob:') ? `${u}?v=${v}` : u));
}

/** A JSON file from the art (the model list, the still index), or null. Always fresh. */
export async function artJson<T>(path: string): Promise<T | null> {
  const s = await artState();
  try {
    if (s.kind === 'server') {
      const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
      return res.ok ? ((await res.json()) as T) : null;
    }
    if (s.kind === 'none') return null;
    const blob = await s.storage.read(s.info.id, path);
    return blob ? (JSON.parse(await blob.text()) as T) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- changes

let version = 0;
const listeners = new Set<(v: number) => void>();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('palworld-art') : null;

function reset(): void {
  for (const p of urls.values()) void p.then((u) => u?.startsWith('blob:') && URL.revokeObjectURL(u));
  urls.clear();
  state = null;
  version++;
  for (const f of listeners) f(version);
}

channel?.addEventListener('message', reset);

/** Call after the stored pack changes: this tab re-reads it, and so do the others. */
export function artChanged(): void {
  reset();
  channel?.postMessage('changed');
}

/** Subscribe outside React (module-level caches). Returns the unsubscribe. */
export function onArtChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Re-render when the art changes; use the number as an effect dependency. */
export function useArtVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => {
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

/** The current art state, for the settings panel and the "add the art" notice. */
export function useArtState(): ArtState | null {
  const v = useArtVersion();
  const [s, setS] = useState<ArtState | null>(null);
  useEffect(() => {
    let live = true;
    void artState().then((x) => live && setS(x));
    return () => {
      live = false;
    };
  }, [v]);
  return s;
}

/**
 * A loadable URL for one art path: undefined while it resolves, null when there
 * is no such art. Re-resolves when the art changes.
 */
export function useArtUrl(path: string | null | undefined, v?: number): string | null | undefined {
  const version = useArtVersion();
  // The answer is remembered with the question it answers: when the path (or the
  // art) changes, the old URL must not be handed out for even one render, or a
  // picture flashes the wrong file and its hatch decides on stale data.
  const key = `${version}|${path ?? ''}|${v ?? ''}`;
  const [got, setGot] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (!path) setGot({ key, url: null });
    else void artUrl(path, v).then((url) => live && setGot({ key, url }));
    return () => {
      live = false;
    };
  }, [key, path, v]);
  if (!path) return null;
  return got?.key === key ? got.url : undefined;
}
