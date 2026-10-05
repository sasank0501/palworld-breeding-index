/**
 * Backups of the player's own data, as a small JSON file.
 *
 *   Every browser: download a backup, restore one (merge or replace).
 *   Chrome and Edge: also keep a chosen file up to date after every save, through
 *   a file handle stored in IndexedDB. On a later visit the browser asks once to
 *   allow writing again ("reconnect"). A file in a OneDrive or Dropbox folder
 *   then syncs between computers with no account or server.
 */

import { createStore, del, get, set } from 'idb-keyval';

import { mergePrefs, mergeWorlds, summarise } from './edit.ts';
import { APP, SCHEMA, parseBackup, type Backup, type WorldData } from './schema.ts';
import { announce, readAllWorlds, readPrefs, readWorld, replacePrefs, replaceWorld } from './store.ts';

export async function buildBackup(): Promise<Backup> {
  return { app: APP, kind: 'backup', schema: SCHEMA, exportedAt: new Date().toISOString(), prefs: await readPrefs(), worlds: await readAllWorlds() };
}

export const backupFileName = (at = new Date()) => `palworld-index-backup-${at.toISOString().slice(0, 10)}.json`;

/** Save a backup through the browser's normal download. */
export async function downloadBackup(): Promise<void> {
  const blob = new Blob([JSON.stringify(await buildBackup(), null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: backupFileName() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface RestorePreview {
  backup: Backup;
  /** One line per world, e.g. "pal1.0 world: 12 favourites, 3 notes, 2 plans". */
  lines: string[];
  exportedAt: string;
}

/** Read and check a chosen file. Throws a plain-language error for anything that isn't a usable backup. */
export async function previewRestore(file: Blob): Promise<RestorePreview> {
  if (file.size > 20 * 1024 * 1024) throw new Error('This file is too large to be a backup.');
  const backup = parseBackup(await file.text());
  return { backup, exportedAt: backup.exportedAt, lines: backup.worlds.map((w) => `World ${w.world.slice(0, 8)}…: ${summarise(w)}`) };
}

/** Apply a checked backup. Merge keeps the newer of each item; replace takes the backup's worlds as they are. */
export async function applyRestore(backup: Backup, mode: 'merge' | 'replace'): Promise<void> {
  for (const w of backup.worlds) {
    const next: WorldData = mode === 'merge' ? mergeWorlds(await readWorld(w.world), w) : w;
    await replaceWorld(next);
    announce(w.world);
  }
  if (backup.prefs) await replacePrefs(mode === 'merge' ? mergePrefs(await readPrefs(), backup.prefs) : backup.prefs);
}

/* ---------------- Chrome / Edge: a backup file kept up to date ---------------- */

type Handle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
};

let handles: ReturnType<typeof createStore> | null = null;
const handleStore = () => (handles ??= createStore('palworld-index-backupfile', 'handles'));

export const canSyncFile = () => typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';

/** Ask where to keep the backup file (needs a click). False if the player cancels. */
export async function chooseBackupFile(): Promise<boolean> {
  const pick = (globalThis as unknown as { showSaveFilePicker: (o: object) => Promise<Handle> }).showSaveFilePicker;
  try {
    const handle = await pick({ suggestedName: 'palworld-index-backup.json', types: [{ description: 'Backup', accept: { 'application/json': ['.json'] } }] });
    await set('file', handle, handleStore());
    await writeBackupFile();
    return true;
  } catch {
    return false;
  }
}

export type FileSyncState = 'off' | 'on' | 'needs-permission';

export async function fileSyncState(): Promise<FileSyncState> {
  try {
    const h = await get<Handle>('file', handleStore());
    if (!h) return 'off';
    return (await h.queryPermission?.({ mode: 'readwrite' })) === 'granted' ? 'on' : 'needs-permission';
  } catch {
    return 'off';
  }
}

/** Ask to write the file again on a new visit. Must run from a click. */
export async function reconnectBackupFile(): Promise<FileSyncState> {
  const h = await get<Handle>('file', handleStore()).catch(() => undefined);
  if (!h) return 'off';
  const ok = (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  if (ok) await writeBackupFile();
  return ok ? 'on' : 'needs-permission';
}

export async function stopBackupFile(): Promise<void> {
  await del('file', handleStore()).catch(() => undefined);
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** Rewrite the backup file, if one is set up and allowed. Coalesced: at most every 2 s. */
export function scheduleBackupFile(): void {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    void writeBackupFile();
  }, 2000);
}

async function writeBackupFile(): Promise<void> {
  try {
    const h = await get<Handle>('file', handleStore());
    if (!h || (await h.queryPermission?.({ mode: 'readwrite' })) !== 'granted') return;
    const w = await h.createWritable();
    await w.write(new Blob([JSON.stringify(await buildBackup(), null, 1)], { type: 'application/json' }));
    await w.close();
  } catch {
    /* the next save tries again; the IndexedDB copy is unaffected */
  }
}
