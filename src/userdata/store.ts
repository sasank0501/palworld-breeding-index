/**
 * Where the player's own data lives: this browser's IndexedDB, saved on every
 * change. Its own database, separate from the rosters (src/save/store.ts):
 * idb-keyval creates one object store per database, and only the first time.
 *
 *   world:<id>   WorldData, one per world
 *   prefs        Prefs, device-wide (the skin)
 *
 * A WorldStore holds one world in memory, applies edits at once (the UI never
 * waits on storage), and writes ~300 ms after the last edit, or straight away
 * when the page is hidden: the one "leaving" signal browsers fire reliably,
 * phones included. Each write merges with what is stored, so two open tabs
 * can't overwrite each other; a BroadcastChannel tells the other tabs to reload.
 *
 * If IndexedDB is unavailable (some private windows), edits still work and
 * `status` says they are memory-only, so the page can tell the player.
 */

import { createStore, get, set, entries, type UseStore } from 'idb-keyval';

import { mergeWorlds } from './edit.ts';
import { checkPrefs, checkWorld, emptyPrefs, emptyWorld, migrate, type Prefs, type WorldData } from './schema.ts';

let db: UseStore | null = null;
const store = () => (db ??= createStore('palworld-index-userdata', 'docs'));
const worldKey = (w: string) => `world:${w}`;
const CHANNEL = 'palworld-index-userdata';
const SAVE_DELAY = 300;

export type SaveStatus = 'saved' | 'unsaved' | 'memory-only';

/** Read one world as stored, upgraded and checked; empty if there is none or it is unreadable. */
export async function readWorld(world: string): Promise<WorldData> {
  const raw = await get<Record<string, unknown>>(worldKey(world), store());
  if (!raw) return emptyWorld(world);
  try {
    return checkWorld(migrate<WorldData>(raw));
  } catch {
    // Never throw away data we can't read: keep it under another key for recovery.
    await set(`unreadable:${world}:${Date.now()}`, raw, store());
    return emptyWorld(world);
  }
}

/** Merge `data` into what is stored and write the result. Returns what was written. */
export async function writeWorld(data: WorldData): Promise<WorldData> {
  const merged = mergeWorlds(await readWorld(data.world), data);
  await set(worldKey(data.world), merged, store());
  return merged;
}

export async function readAllWorlds(): Promise<WorldData[]> {
  const all = await entries<string, Record<string, unknown>>(store());
  const out: WorldData[] = [];
  for (const [k, v] of all) {
    if (typeof k !== 'string' || !k.startsWith('world:')) continue;
    try {
      out.push(checkWorld(migrate<WorldData>(v)));
    } catch {
      /* skipped: readWorld keeps a copy aside when it meets it */
    }
  }
  return out;
}

export async function readPrefs(): Promise<Prefs> {
  const raw = await get<Record<string, unknown>>('prefs', store()).catch(() => undefined);
  try {
    return raw ? checkPrefs(migrate<Prefs>(raw)) : emptyPrefs();
  } catch {
    return emptyPrefs();
  }
}

export async function writePrefs(change: Partial<Pick<Prefs, 'skin'>>): Promise<void> {
  try {
    await set('prefs', { ...(await readPrefs()), ...change, at: new Date().toISOString() }, store());
  } catch {
    /* preferences are a convenience; localStorage still has the skin */
  }
}

/** Store a world as given, without merging (a "replace" restore). */
export async function replaceWorld(d: WorldData): Promise<void> {
  await set(worldKey(d.world), d, store());
}

export async function replacePrefs(p: Prefs): Promise<void> {
  await set('prefs', p, store());
}

/** Tell other tabs a world changed. */
export function announce(world: string): void {
  try {
    const c = new BroadcastChannel(CHANNEL);
    c.postMessage({ world });
    c.close();
  } catch {
    /* no BroadcastChannel: other tabs see the change on their next load */
  }
}

/** Ask the browser not to clear this site's data under storage pressure. Once per browser. */
async function askToPersist(): Promise<void> {
  try {
    if (await get<boolean>('persistAsked', store())) return;
    await set('persistAsked', true, store());
    await navigator.storage?.persist?.();
  } catch {
    /* not offered here; data is still kept, just evictable */
  }
}

const hasContent = (d: WorldData) => Object.keys(d.favourites).length + Object.keys(d.notes).length + Object.keys(d.plans).length > 0;

export class WorldStore {
  private current: WorldData;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private onHide = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') void this.flush();
  };
  status: SaveStatus = 'saved';
  /** Called after each successful write (the backup file sync hooks in here). */
  onSaved: ((d: WorldData) => void) | null = null;

  private constructor(data: WorldData, private readonly available: boolean) {
    this.current = data;
    if (!available) this.status = 'memory-only';
    try {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e: MessageEvent<{ world: string }>) => {
        if (e.data?.world === this.current.world) void this.reload();
      };
    } catch {
      this.channel = null;
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onHide);
      window.addEventListener('pagehide', this.onHide);
    }
  }

  static async open(world: string): Promise<WorldStore> {
    try {
      return new WorldStore(await readWorld(world), true);
    } catch {
      return new WorldStore(emptyWorld(world), false);
    }
  }

  get data(): WorldData {
    return this.current;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Apply an edit (a function from edit.ts) now; it is written shortly after. */
  update(edit: (d: WorldData) => WorldData): void {
    const before = this.current;
    this.current = edit(this.current);
    if (this.current === before) return;
    if (this.available) {
      this.status = 'unsaved';
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), SAVE_DELAY);
      if (!hasContent(before) && hasContent(this.current)) void askToPersist();
    }
    this.emit();
  }

  /** Write any pending edit now. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.available || this.status !== 'unsaved') return;
    try {
      const written = await writeWorld(this.current);
      // Edits made while the write was in flight stay; anything another tab wrote joins in.
      this.current = mergeWorlds(written, this.current);
      this.status = 'saved';
      announce(this.current.world);
      this.onSaved?.(this.current);
    } catch {
      this.status = 'memory-only';
    }
    this.emit();
  }

  /** Another tab (or a restore) changed this world: take its version, keep unsaved edits. */
  async reload(): Promise<void> {
    try {
      const stored = await readWorld(this.current.world);
      this.current = this.status === 'unsaved' ? mergeWorlds(stored, this.current) : stored;
      this.emit();
    } catch {
      /* keep what we have */
    }
  }

  async close(): Promise<void> {
    await this.flush();
    this.channel?.close();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onHide);
      window.removeEventListener('pagehide', this.onHide);
    }
    this.listeners.clear();
  }
}
