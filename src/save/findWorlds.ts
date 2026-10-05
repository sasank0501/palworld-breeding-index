/**
 * Which worlds are in a folder the player picked. The browser hands over a flat
 * list of files with paths relative to the picked folder; this groups them the
 * way Palworld lays them out:
 *
 *   SaveGames/<steamid>/GlobalPalStorage.sav
 *   SaveGames/<steamid>/<worldid>/Level.sav, LevelMeta.sav
 *   SaveGames/<steamid>/<worldid>/Players/<uid>.sav, <uid>_dps.sav
 *   SaveGames/<steamid>/<worldid>/backup/...   older copies, never read
 *
 * The player may pick SaveGames, the steam id folder or one world folder; all
 * three work. Picking the world folder itself leaves GlobalPalStorage.sav out,
 * which `missingGlobal` reports.
 */

export interface PickedFile<T> {
  /** Relative to the picked folder, '/' or '\' separated, starting with that folder's name. */
  path: string;
  file: T;
  /** Last modified, ms since 1970. */
  modified: number;
}

export interface FoundWorld<T> {
  id: string;
  /** The world folder's path inside the pick, '/' separated. */
  dir: string;
  level: T;
  levelMeta?: T;
  players: Array<{ name: string; file: T }>;
  global?: T;
  /** When Level.sav was last written: the last time the world was played. */
  lastPlayed: number;
}

export interface FoundWorlds<T> {
  worlds: Array<FoundWorld<T>>;
  /** True when a world was found but GlobalPalStorage.sav could not be (the world folder itself was picked). */
  missingGlobal: boolean;
  /** Why nothing was found, when nothing was. */
  hint?: 'empty' | 'xbox' | 'no-level';
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function findWorlds<T>(files: Array<PickedFile<T>>): FoundWorlds<T> {
  if (files.length === 0) return { worlds: [], missingGlobal: false, hint: 'empty' };

  const byPath = new Map<string, PickedFile<T>>();
  for (const f of files) byPath.set(norm(f.path).toLowerCase(), { ...f, path: norm(f.path) });

  const worlds: Array<FoundWorld<T>> = [];
  let missingGlobal = false;
  for (const f of byPath.values()) {
    if (nameOf(f.path).toLowerCase() !== 'level.sav') continue;
    const dir = parentOf(f.path);
    if (dir.split('/').some((seg) => seg.toLowerCase() === 'backup')) continue;

    const at = (rel: string) => byPath.get(`${dir}/${rel}`.toLowerCase());
    const prefix = `${dir}/players/`.toLowerCase();
    const players = [...byPath.entries()]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/') && key.endsWith('.sav'))
      .map(([, p]) => ({ name: nameOf(p.path), file: p.file }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const up = parentOf(dir);
    const global = up ? byPath.get(`${up}/GlobalPalStorage.sav`.toLowerCase()) : undefined;
    if (!global && !up) missingGlobal = true;

    worlds.push({
      id: nameOf(dir) || dir,
      dir,
      level: f.file,
      levelMeta: at('LevelMeta.sav')?.file,
      players,
      global: global?.file,
      lastPlayed: f.modified,
    });
  }
  worlds.sort((a, b) => b.lastPlayed - a.lastPlayed);

  if (worlds.length) return { worlds, missingGlobal };
  // Xbox / Game Pass keeps saves in a "wgs" container of extension-less files.
  const paths = [...byPath.keys()];
  if (paths.some((p) => p.split('/').includes('wgs'))) return { worlds, missingGlobal, hint: 'xbox' };
  return { worlds, missingGlobal, hint: 'no-level' };
}
