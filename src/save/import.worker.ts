/// <reference lib="webworker" />
/**
 * The save import, off the page's thread: a 2,000-pal Level.sav takes seconds to
 * parse, and the page must stay responsive (and announce progress) meanwhile.
 *
 *   page -> { type: 'scan', files }    the picked folder's .sav files (File handles)
 *   worker -> { type: 'worlds', ... }  the worlds found, with names from LevelMeta.sav
 *   page -> { type: 'import', id }     import one of them
 *   worker -> { type: 'progress' } ... { type: 'done', roster } or { type: 'error' }
 */

import pals from '../data/pals.json';
import { findWorlds, type FoundWorld, type PickedFile } from './findWorlds.ts';
import { importWorld, readWorldMeta, type WorldMeta } from './importWorld.ts';
import { buildSpeciesIndex, type PalDexEntry } from './species.ts';
import type { Roster } from '../types.ts';

export interface WorldSummary {
  id: string;
  lastPlayed: number;
  meta: WorldMeta | null;
  players: number;
  hasGlobal: boolean;
}

export type ToWorker = { type: 'scan'; files: Array<PickedFile<File>> } | { type: 'import'; id: string };
export type FromWorker =
  | { type: 'worlds'; worlds: WorldSummary[]; missingGlobal: boolean; hint?: string }
  | { type: 'progress'; step: string }
  | { type: 'done'; roster: Roster; meta: WorldMeta | null; lines: string[]; ms: number }
  | { type: 'error'; message: string };

const post = (m: FromWorker) => postMessage(m);
const species = buildSpeciesIndex(pals as unknown as Record<string, PalDexEntry>);
let found = new Map<string, FoundWorld<File>>();
const metas = new Map<string, WorldMeta | null>();

/** Turn a read failure into something a player can act on. */
function explain(e: unknown): string {
  const name = (e as DOMException)?.name;
  if (name === 'NotReadableError' || name === 'NotFoundError')
    return 'A save file changed or disappeared while it was being read. Close Palworld, then try again.';
  const msg = e instanceof Error ? e.message : String(e);
  if (/CNK|Xbox/i.test(msg)) return 'This looks like an Xbox or Game Pass save, which this importer cannot read yet. Steam saves work.';
  return `The save could not be read: ${msg}`;
}

onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === 'scan') {
      const result = findWorlds(msg.files);
      found = new Map(result.worlds.map((w) => [w.id, w]));
      const worlds: WorldSummary[] = [];
      for (const w of result.worlds) {
        let meta: WorldMeta | null = null;
        if (w.levelMeta) {
          const file = w.levelMeta;
          meta = await readWorldMeta(async () => new Uint8Array(await file.arrayBuffer())).catch(() => null);
        }
        metas.set(w.id, meta);
        worlds.push({ id: w.id, lastPlayed: w.lastPlayed, meta, players: w.players.length, hasGlobal: !!w.global });
      }
      post({ type: 'worlds', worlds, missingGlobal: result.missingGlobal, hint: result.hint });
      return;
    }

    if (msg.type === 'import') {
      const w = found.get(msg.id);
      if (!w) throw new Error(`world ${msg.id} is not in the picked folder`);
      const t0 = performance.now();

      // Snapshot first: copy every file into memory before parsing any of them, so
      // a game that saves mid-import fails cleanly here instead of half-way through.
      post({ type: 'progress', step: 'Copying the save files' });
      const bytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
      const level = await bytes(w.level);
      const players = await Promise.all(w.players.map(async (p) => ({ name: p.name, data: await bytes(p.file) })));
      const global = w.global ? await bytes(w.global) : undefined;

      const { roster, lines } = await importWorld(
        {
          id: w.id,
          level: async () => level,
          players: players.map((p) => ({ name: p.name, read: async () => p.data })),
          global: global ? async () => global : undefined,
        },
        species,
        (step) => post({ type: 'progress', step }),
      );
      post({ type: 'done', roster, meta: metas.get(w.id) ?? null, lines, ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    post({ type: 'error', message: explain(err) });
  }
};
