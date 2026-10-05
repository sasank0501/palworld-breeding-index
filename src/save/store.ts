/**
 * Imported rosters, kept in this browser's IndexedDB so a return visit opens
 * straight to the Paldex. One entry per world, keyed by the world's folder id;
 * "current" remembers which world was open last.
 *
 * IndexedDB can be unavailable (some private windows, blocked site data), so every
 * call fails soft: a failed save means the player re-imports next visit, never
 * that the import itself fails.
 */

import { createStore, del, get, set, entries } from 'idb-keyval';

import type { Roster } from '../types.ts';
import type { WorldMeta } from './importWorld.ts';

export interface SavedWorld {
  roster: Roster;
  meta: WorldMeta | null;
  /** When this roster was imported, ISO 8601. */
  importedAt: string;
}

let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore('palworld-index', 'rosters'));
const key = (world: string) => `roster:${world}`;

async function soft<T>(f: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await f();
  } catch {
    return fallback;
  }
}

/** Store a roster and make it the current world. False if the browser refused. */
export async function saveWorld(world: SavedWorld): Promise<boolean> {
  return soft(async () => {
    await set(key(world.roster.world), world, db());
    await set('current', world.roster.world, db());
    return true;
  }, false);
}

/** The world opened last, if this browser still has it. */
export async function loadCurrentWorld(): Promise<SavedWorld | null> {
  return soft(async () => {
    const id = await get<string>('current', db());
    return id ? ((await get<SavedWorld>(key(id), db())) ?? null) : null;
  }, null);
}

/** Every stored world, newest import first, without their pals (for a switcher). */
export async function listWorlds(): Promise<Array<{ world: string; meta: WorldMeta | null; importedAt: string; pals: number }>> {
  return soft(async () => {
    const all = await entries<string, SavedWorld>(db());
    return all
      .filter(([k]) => k.startsWith('roster:'))
      .map(([, v]) => ({ world: v.roster.world, meta: v.meta, importedAt: v.importedAt, pals: v.roster.pals.length }))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  }, []);
}

/** Forget which world is open, so the next visit starts at the import screen. */
export async function clearCurrentWorld(): Promise<void> {
  await soft(() => del('current', db()), undefined);
}
