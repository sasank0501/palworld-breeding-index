/**
 * The changes a player can make, and how two copies combine. Pure functions over
 * WorldData: each returns a new document and never mutates its input, so React
 * state, the IndexedDB copy and a backup can't drift apart through shared objects.
 */

import { COLLECTIONS, type Collection, type Plan, type Prefs, type WorldData } from './schema.ts';

const now = () => new Date().toISOString();
const tomb = (c: Collection, id: string) => `${c}:${id}`;

function put<C extends Collection>(d: WorldData, c: C, id: string, item: WorldData[C][string]): WorldData {
  const deleted = { ...d.deleted };
  delete deleted[tomb(c, id)];
  return { ...d, [c]: { ...d[c], [id]: item }, deleted };
}

function remove(d: WorldData, c: Collection, id: string, at: string): WorldData {
  if (!(id in d[c])) return d;
  const next = { ...d[c] };
  delete next[id];
  return { ...d, [c]: next, deleted: { ...d.deleted, [tomb(c, id)]: at } };
}

export const isFavourite = (d: WorldData, instanceId: string) => instanceId in d.favourites;

export function toggleFavourite(d: WorldData, instanceId: string, at = now()): WorldData {
  return isFavourite(d, instanceId) ? remove(d, 'favourites', instanceId, at) : put(d, 'favourites', instanceId, { at });
}

/** Empty or whitespace-only text deletes the note. */
export function setNote(d: WorldData, instanceId: string, text: string, at = now()): WorldData {
  return text.trim() ? put(d, 'notes', instanceId, { text, at }) : remove(d, 'notes', instanceId, at);
}

export function savePlan(d: WorldData, id: string, plan: Omit<Plan, 'at'>, at = now()): WorldData {
  return put(d, 'plans', id, { ...plan, at });
}

export function deletePlan(d: WorldData, id: string, at = now()): WorldData {
  return remove(d, 'plans', id, at);
}

/** A new plan id: random, so plans made in two tabs or on two machines never collide. */
export const newPlanId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Combine two copies of one world, item by item: for each id, the copy changed
 * most recently wins, and a tombstone newer than an item removes it. Order of
 * arguments doesn't matter, and merging a copy with itself changes nothing.
 */
export function mergeWorlds(a: WorldData, b: WorldData): WorldData {
  if (a.world !== b.world) throw new Error(`cannot merge world ${a.world} with ${b.world}`);
  const deleted: Record<string, string> = { ...a.deleted };
  for (const [k, at] of Object.entries(b.deleted)) if (!deleted[k] || at > deleted[k]) deleted[k] = at;

  const out: WorldData = { ...a, deleted, favourites: {}, notes: {}, plans: {} };
  for (const c of COLLECTIONS) {
    const merged: Record<string, { at: string }> = {};
    for (const src of [a[c], b[c]] as Array<Record<string, { at: string }>>) {
      for (const [id, item] of Object.entries(src)) if (!merged[id] || item.at > merged[id].at) merged[id] = item;
    }
    for (const [id, item] of Object.entries(merged)) {
      const gone = deleted[tomb(c, id)];
      if (gone && gone >= item.at) continue;
      if (gone) delete deleted[tomb(c, id)]; // re-added after the deletion
      (out[c] as Record<string, { at: string }>)[id] = item;
    }
  }
  return out;
}

export const mergePrefs = (a: Prefs, b: Prefs): Prefs => (b.at > a.at ? b : a);

/** Pals the player marked that are no longer in the save (sold, condensed, released). */
export function missingPals(d: WorldData, instanceIds: Iterable<string>): Array<{ instanceId: string; favourite: boolean; note?: string }> {
  const present = new Set(instanceIds);
  const ids = new Set([...Object.keys(d.favourites), ...Object.keys(d.notes)]);
  return [...ids]
    .filter((id) => !present.has(id))
    .sort()
    .map((id) => ({ instanceId: id, favourite: id in d.favourites, note: d.notes[id]?.text }));
}

/** Forget the marks on pals that left the save: the player's explicit clean-up. */
export function forgetMissing(d: WorldData, instanceIds: Iterable<string>, at = now()): WorldData {
  let next = d;
  for (const m of missingPals(d, instanceIds)) {
    if (m.favourite) next = remove(next, 'favourites', m.instanceId, at);
    if (m.note !== undefined) next = remove(next, 'notes', m.instanceId, at);
  }
  return next;
}

/** "3 favourites, 1 note, 2 plans", for previews and announcements. */
export function summarise(d: Pick<WorldData, Collection>): string {
  const n = (k: Collection, one: string, many: string) => {
    const c = Object.keys(d[k]).length;
    return `${c.toLocaleString()} ${c === 1 ? one : many}`;
  };
  return [n('favourites', 'favourite', 'favourites'), n('notes', 'note', 'notes'), n('plans', 'plan', 'plans')].join(', ');
}
