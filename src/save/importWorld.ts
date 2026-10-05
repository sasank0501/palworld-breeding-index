/**
 * One world's save files in, one roster out. Shared by the command-line importer
 * (scripts/import-save.ts, files on disk) and the browser (import.worker.ts, files
 * the player picked), so both produce the same roster from the same save.
 *
 * Callers say how to get each file's bytes; nothing here touches a file system.
 */

import { Reader } from './binary.ts';
import { decodeSave } from './container.ts';
import { readHeader, readProperties, type Props } from './gvas.ts';
import {
  assembleRoster,
  readLevelPals,
  readPlayerSave,
  readStoragePals,
  type ContainerRoles,
  type Roster,
  type RosterPal,
} from './roster.ts';
import type { SpeciesIndex } from './species.ts';

type Bytes = () => Promise<Uint8Array>;

export interface WorldSource {
  /** The world folder's name: a 32-character hex id. */
  id: string;
  level: Bytes;
  /** Everything in <world>/Players: <uid>.sav player saves and <uid>_dps.sav storage. */
  players: Array<{ name: string; read: Bytes }>;
  /** GlobalPalStorage.sav, one folder up from the world, when present. */
  global?: Bytes;
}

/** What the importer is doing, for a progress line ("Reading Level.sav"). */
export type Progress = (step: string) => void;

export interface ImportReport {
  roster: Roster;
  /** One line per file read, for logs and the import screen. */
  lines: string[];
}

const gvas = async (read: Bytes): Promise<Uint8Array> => (await decodeSave(await read())).data;

export async function importWorld(src: WorldSource, species: SpeciesIndex, progress: Progress = () => {}): Promise<ImportReport> {
  const lines: string[] = [];

  // Container roles come from the player saves; without them every pal would
  // land in "unknown" and the Pal Box / party split would be lost.
  const roles: ContainerRoles = { palBox: new Set(), party: new Set() };
  const playerSaves = src.players.filter((p) => p.name.endsWith('.sav') && !p.name.endsWith('_dps.sav'));
  for (const p of playerSaves) {
    progress(`Reading player ${p.name}`);
    const info = readPlayerSave(await gvas(p.read));
    if (info.palBoxContainerId) roles.palBox.add(info.palBoxContainerId);
    if (info.partyContainerId) roles.party.add(info.partyContainerId);
  }
  lines.push(`players : ${playerSaves.length}  (palbox ${roles.palBox.size}, party ${roles.party.size})`);

  const groups: RosterPal[][] = [];

  progress('Reading Level.sav');
  const level = readLevelPals(await gvas(src.level), species, roles);
  groups.push(level.pals);
  lines.push(`Level   : ${level.pals.length} pals`);

  for (const p of src.players.filter((f) => f.name.endsWith('_dps.sav'))) {
    progress(`Reading storage ${p.name}`);
    const s = readStoragePals(await gvas(p.read), species, roles, 'dps');
    groups.push(s.pals);
    lines.push(`dps     : ${s.pals.length} pals of ${s.slots} slots  (${p.name})`);
  }

  if (src.global) {
    progress('Reading GlobalPalStorage.sav');
    const s = readStoragePals(await gvas(src.global), species, roles, 'global');
    groups.push(s.pals);
    lines.push(`global  : ${s.pals.length} pals of ${s.slots} slots`);
  }

  return { roster: assembleRoster(src.id, groups), lines };
}

/** What a world picker can show without reading the whole world. */
export interface WorldMeta {
  name: string | null;
  host: string | null;
  level: number | null;
  day: number | null;
}

/** LevelMeta.sav: a few hundred bytes with the world's name and its host. */
export async function readWorldMeta(read: Bytes): Promise<WorldMeta> {
  const r = new Reader((await decodeSave(await read())).data);
  readHeader(r);
  const save = (readProperties(r).SaveData ?? {}) as Props;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return { name: str(save.WorldName), host: str(save.HostPlayerName), level: num(save.HostPlayerLevel), day: num(save.InGameDay) };
}
