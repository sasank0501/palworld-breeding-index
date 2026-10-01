/**
 * Turns decoded save blobs into the flat roster the app consumes.
 *
 * Two storage systems have to be merged, which is not obvious from the file names:
 *   - Level.sav holds pals as `CharacterSaveParameterMap` entries whose RawData is
 *     itself a property tree, tagged with the container they sit in.
 *   - <player>_dps.sav ("dimension pal storage") holds a flat SaveParameterArray
 *     and carries the overflow of the same Pal Box container.
 * They share container ids but never share InstanceIds, so a simple concat is safe.
 *
 * Fields absent from a pal's tree are at their default value — the game does not
 * write `Rank: 1`, an empty passive list, or zeroed souls. Every read here defaults
 * accordingly; treating `undefined` as missing data instead would blank out most
 * of the roster.
 */

import { Reader } from './binary.ts';
import { readHeader, readProperties, type Props } from './gvas.ts';
import type { SpeciesIndex } from './species.ts';

export type LocationKind = 'palbox' | 'dimension' | 'party' | 'base' | 'global' | 'unknown';

export interface RosterPal {
  instanceId: string;
  palId: string | null;
  characterId: string;
  nickname: string | null;
  isBoss: boolean;
  isLucky: boolean;
  isAwakened: boolean;
  gender: 'male' | 'female' | null;
  level: number;
  exp: number;
  /** Condenser rank, 1 = un-condensed through 5 = four stars. */
  rank: number;
  /** Pal Souls invested, 0-10 each. */
  souls: { hp: number; attack: number; defense: number; craftSpeed: number };
  /** Talent values 0-100. The game tracks three, not four. */
  ivs: { hp: number; attack: number; defense: number };
  passives: string[];
  /** Active skill code names, `EPalWazaID::` stripped. `equipped` is the (up to)
   *  three battle slots; `learned` is MasteredWaza, which in practice does *not*
   *  repeat the equipped ones — the full set is the union of the two. */
  skills: { equipped: string[]; learned: string[] };
  location: { kind: LocationKind; containerId: string | null; slot: number | null };
  source: 'level' | 'dps' | 'global';
}

export interface Roster {
  world: string;
  exportedAt: string;
  counts: Record<string, number>;
  pals: RosterPal[];
  unknown: { characterIds: Array<{ id: string; count: number }>; passives: string[]; skills: string[] };
}

export interface ContainerRoles {
  palBox: Set<string>;
  party: Set<string>;
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function gender(v: unknown): 'male' | 'female' | null {
  const s = str(v);
  if (s.endsWith('::Male')) return 'male';
  if (s.endsWith('::Female')) return 'female';
  return null;
}

/** `EPalWazaID::AirCanon` -> `AirCanon`; drops the `None` the game pads slots with. */
function wazaList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((w) => str(w).replace(/^EPalWazaID::/, ''))
    .filter((w) => w !== '' && w !== 'None');
}

/** True for real, owned pals — filters out players and empty storage slots. */
function isRealPal(sp: Props | undefined): sp is Props {
  if (!sp) return false;
  const cid = sp.CharacterID;
  return typeof cid === 'string' && cid !== '' && cid !== 'None' && sp.IsPlayer !== true;
}

function toPal(
  sp: Props,
  instanceId: string,
  source: RosterPal['source'],
  species: SpeciesIndex,
  roles: ContainerRoles,
): RosterPal {
  const characterId = str(sp.CharacterID);
  const match = species.lookup(characterId);

  const slotId = sp.SlotId as Props | undefined;
  const containerId = ((slotId?.ContainerId as Props | undefined)?.ID as string | undefined) ?? null;
  const slot = typeof slotId?.SlotIndex === 'number' ? slotId.SlotIndex : null;

  // Which file a pal came from decides the storage, not its container id:
  // Dimensional Pal Storage entries still carry the Pal Box container guid in
  // their SlotId, so classifying by container alone merges the two storages.
  let kind: LocationKind = 'unknown';
  if (source === 'global') kind = 'global';
  else if (source === 'dps') kind = 'dimension';
  else if (containerId && roles.party.has(containerId)) kind = 'party';
  else if (containerId && roles.palBox.has(containerId)) kind = 'palbox';
  else if (containerId) kind = 'base';

  const nickname = str(sp.NickName).trim();

  return {
    instanceId,
    palId: match?.palId ?? null,
    characterId,
    nickname: nickname === '' ? null : nickname,
    isBoss: match?.isBoss ?? /^BOSS_/i.test(characterId),
    isLucky: sp.IsRarePal === true,
    isAwakened: sp.bIsAwakening === true,
    gender: gender(sp.Gender),
    level: num(sp.Level, 1),
    exp: num(sp.Exp),
    rank: num(sp.Rank, 1),
    souls: {
      hp: num(sp.Rank_HP),
      attack: num(sp.Rank_Attack),
      defense: num(sp.Rank_Defence),
      craftSpeed: num(sp.Rank_CraftSpeed),
    },
    ivs: { hp: num(sp.Talent_HP), attack: num(sp.Talent_Shot), defense: num(sp.Talent_Defense) },
    passives: Array.isArray(sp.PassiveSkillList) ? (sp.PassiveSkillList as string[]).filter(Boolean) : [],
    skills: { equipped: wazaList(sp.EquipWaza), learned: wazaList(sp.MasteredWaza) },
    location: { kind, containerId, slot },
    source,
  };
}

/** Reads the GVAS header off a decoded blob and returns a cursor at the properties. */
function open(bytes: Uint8Array): Reader {
  const r = new Reader(bytes);
  readHeader(r);
  return r;
}

export interface PlayerInfo {
  playerUId: string;
  palBoxContainerId: string | null;
  partyContainerId: string | null;
}

export function readPlayerSave(bytes: Uint8Array): PlayerInfo {
  // Only three fields are wanted, and they all sit near the top of SaveData. The
  // rest of it is RecordData — 46 KB of progression maps, some of them keyed by a
  // native Guid rather than a property list, which the generic map reader cannot
  // decode. Selecting the branches we need skips all of it by declared size.
  const props = readProperties(open(bytes), {
    select: new Set(['SaveData']),
    nested: {
      SaveData: {
        select: new Set(['PlayerUId', 'PalStorageContainerId', 'OtomoCharacterContainerId']),
      },
    },
  });
  const sd = (props.SaveData ?? {}) as Props;
  const idOf = (k: string): string | null => ((sd[k] as Props | undefined)?.ID as string | undefined) ?? null;
  return {
    playerUId: str(sd.PlayerUId),
    palBoxContainerId: idOf('PalStorageContainerId'),
    partyContainerId: idOf('OtomoCharacterContainerId'),
  };
}

/** Level.sav — pals live behind an extra RawData indirection. */
export function readLevelPals(
  bytes: Uint8Array,
  species: SpeciesIndex,
  roles: ContainerRoles,
): { pals: RosterPal[]; skipped: number } {
  const props = readProperties(open(bytes), {
    select: new Set(['worldSaveData']),
    nested: { worldSaveData: { select: new Set(['CharacterSaveParameterMap']) } },
  });
  const map = ((props.worldSaveData as Props | undefined)?.CharacterSaveParameterMap ?? []) as Array<{
    key: Props;
    value: Props;
  }>;

  const pals: RosterPal[] = [];
  let skipped = 0;
  for (const entry of map) {
    const raw = entry.value?.RawData;
    if (!(raw instanceof Uint8Array)) {
      skipped++;
      continue;
    }
    const sp = readProperties(new Reader(raw)).SaveParameter as Props | undefined;
    if (!isRealPal(sp)) {
      skipped++;
      continue;
    }
    pals.push(toPal(sp, str(entry.key?.InstanceId), 'level', species, roles));
  }
  return { pals, skipped };
}

/** _dps.sav and GlobalPalStorage.sav — a flat array, mostly empty slots. */
export function readStoragePals(
  bytes: Uint8Array,
  species: SpeciesIndex,
  roles: ContainerRoles,
  source: 'dps' | 'global',
): { pals: RosterPal[]; slots: number } {
  const props = readProperties(open(bytes), { select: new Set(['SaveParameterArray']) });
  const arr = (props.SaveParameterArray ?? []) as Props[];

  const pals: RosterPal[] = [];
  for (const entry of arr) {
    const sp = entry.SaveParameter as Props | undefined;
    if (!isRealPal(sp)) continue;
    const instanceId = str((entry.InstanceId as Props | undefined)?.InstanceId);
    pals.push(toPal(sp, instanceId, source, species, roles));
  }
  return { pals, slots: arr.length };
}

/** Merges sources, drops duplicate InstanceIds, and tallies what could not be mapped. */
export function assembleRoster(world: string, groups: RosterPal[][]): Roster {
  const seen = new Set<string>();
  const pals: RosterPal[] = [];
  for (const group of groups) {
    for (const p of group) {
      if (p.instanceId && seen.has(p.instanceId)) continue;
      if (p.instanceId) seen.add(p.instanceId);
      pals.push(p);
    }
  }

  const unmapped = new Map<string, number>();
  const passives = new Set<string>();
  const skills = new Set<string>();
  const counts: Record<string, number> = {};
  for (const p of pals) {
    counts[p.location.kind] = (counts[p.location.kind] ?? 0) + 1;
    if (!p.palId) unmapped.set(p.characterId, (unmapped.get(p.characterId) ?? 0) + 1);
    for (const s of p.passives) passives.add(s);
    for (const s of [...p.skills.equipped, ...p.skills.learned]) skills.add(s);
  }

  return {
    world,
    exportedAt: new Date().toISOString(),
    counts: { total: pals.length, ...counts },
    pals,
    unknown: {
      characterIds: [...unmapped].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
      passives: [...passives].sort(),
      // Every distinct skill seen; import-save diffs this against skills.json.
      skills: [...skills].sort(),
    },
  };
}
