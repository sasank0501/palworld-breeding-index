/**
 * What the player makes in the app, as opposed to what is read from the save:
 * favourites, notes and saved plans (one document per world), plus device-wide
 * preferences. This is the only data that cannot be rebuilt by importing again,
 * so it is versioned, checked on the way in, and merged item by item.
 *
 * Every item points at something that survives a re-import: a pal's instanceId
 * (the game's own id for that pal), a species' codename, or a plan's own id. Never
 * a list position or a nickname.
 *
 * Every item carries `at`, when it last changed (ISO 8601). Deleting writes a
 * tombstone in `deleted` with its own time, so a merge with an older backup can
 * tell "deleted since" from "never had it" and does not bring the item back.
 */

export const APP = 'palworld-index';
export const SCHEMA = 1;

export interface Favourite { at: string }
export interface Note { text: string; at: string }
export interface Plan { species: string; passives: string[]; name?: string; at: string }

export interface WorldData {
  app: typeof APP;
  kind: 'world';
  schema: number;
  /** The world folder id, as in Roster.world. */
  world: string;
  favourites: Record<string, Favourite>;
  notes: Record<string, Note>;
  plans: Record<string, Plan>;
  /** Tombstones: "favourites:<id>" -> when it was deleted. */
  deleted: Record<string, string>;
}

export interface Prefs {
  app: typeof APP;
  kind: 'prefs';
  schema: number;
  skin?: string;
  at: string;
}

export interface Backup {
  app: typeof APP;
  kind: 'backup';
  schema: number;
  exportedAt: string;
  prefs: Prefs | null;
  worlds: WorldData[];
}

export const COLLECTIONS = ['favourites', 'notes', 'plans'] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const emptyWorld = (world: string): WorldData => ({
  app: APP,
  kind: 'world',
  schema: SCHEMA,
  world,
  favourites: {},
  notes: {},
  plans: {},
  deleted: {},
});

export const emptyPrefs = (at = new Date(0).toISOString()): Prefs => ({ app: APP, kind: 'prefs', schema: SCHEMA, at });

/* ---------------- migrations ---------------- */

/**
 * migrations[n] turns a schema-n document into schema n+1. When the format
 * changes, bump SCHEMA and add the step here; old data and old backup files then
 * keep loading forever. Steps take and return plain JSON, any document kind.
 */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {};

export function migrate<T>(doc: Record<string, unknown>, steps: Record<number, Migration> = MIGRATIONS, target = SCHEMA): T {
  let d = doc;
  let v = typeof d.schema === 'number' ? d.schema : 0;
  if (v > target) throw new Error(`made by a newer version of this site (format ${v}); update the page and try again`);
  while (v < target) {
    const step = steps[v];
    if (!step) throw new Error(`no upgrade from format ${v}`);
    d = { ...step(d), schema: v + 1 };
    v += 1;
  }
  return d as T;
}

/* ---------------- checking untrusted input ---------------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const MAX_NOTE = 10_000;

/** Throws a plain-language error naming the first problem; returns the document typed. */
export function checkWorld(d: unknown, where = 'world'): WorldData {
  if (!isObj(d) || d.app !== APP || d.kind !== 'world') throw new Error(`${where} is not a Palworld Breeding Index world`);
  if (typeof d.world !== 'string' || !d.world) throw new Error(`${where} has no world id`);
  for (const c of [...COLLECTIONS, 'deleted'] as const) if (!isObj(d[c])) throw new Error(`${where} is missing its ${c}`);
  for (const [id, f] of Object.entries(d.favourites as object)) if (!isObj(f) || !isTime(f.at)) throw new Error(`${where}: favourite ${id} is damaged`);
  for (const [id, n] of Object.entries(d.notes as object)) {
    if (!isObj(n) || typeof n.text !== 'string' || !isTime(n.at)) throw new Error(`${where}: note ${id} is damaged`);
    if (n.text.length > MAX_NOTE) throw new Error(`${where}: note ${id} is longer than ${MAX_NOTE.toLocaleString()} characters`);
  }
  for (const [id, p] of Object.entries(d.plans as object)) {
    if (!isObj(p) || typeof p.species !== 'string' || !Array.isArray(p.passives) || !p.passives.every((x) => typeof x === 'string') || !isTime(p.at))
      throw new Error(`${where}: plan ${id} is damaged`);
  }
  for (const [k, at] of Object.entries(d.deleted as object)) if (!isTime(at)) throw new Error(`${where}: deletion record ${k} is damaged`);
  return d as unknown as WorldData;
}

export function checkPrefs(d: unknown): Prefs {
  if (!isObj(d) || d.app !== APP || d.kind !== 'prefs' || !isTime(d.at)) throw new Error('the preferences are damaged');
  if (d.skin !== undefined && typeof d.skin !== 'string') throw new Error('the saved skin is damaged');
  return d as unknown as Prefs;
}

/** Parse a backup file's text: JSON, ours, upgraded to the current format, checked. */
export function parseBackup(text: string, steps: Record<number, Migration> = MIGRATIONS): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a backup: it is not valid JSON.');
  }
  if (!isObj(raw) || raw.app !== APP || raw.kind !== 'backup') throw new Error('This file is not a Palworld Breeding Index backup.');
  const b = migrate<Backup>(raw, steps);
  if (!Array.isArray(b.worlds)) throw new Error('This backup has no worlds in it.');
  return {
    ...b,
    prefs: b.prefs ? checkPrefs(migrate<Prefs>(b.prefs as unknown as Record<string, unknown>, steps)) : null,
    worlds: b.worlds.map((w, i) => checkWorld(migrate<WorldData>(w as unknown as Record<string, unknown>, steps), `world ${i + 1}`)),
  };
}
