/** Shapes shared by the importer output and the app. */

export interface PalDex {
  id: string;
  slug: string;
  name: string;
  power: number;
  num: string;
  variant: number;
  types: string[];
  img: string | null;
  remoteImg: string | null;
  work: Array<{ job: string; level: number }>;
}

export interface PassiveInfo {
  name: string | null;
  /** "diamond" | 3 | 2 | 1 | -1 | -2 | -3, or null when unverified. */
  tier: string | number | null;
  effects: string[];
  lock: unknown;
  unverified?: boolean;
}

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
  rank: number;
  souls: { hp: number; attack: number; defense: number; craftSpeed: number };
  ivs: { hp: number; attack: number; defense: number };
  passives: string[];
  location: { kind: LocationKind; containerId: string | null; slot: number | null };
  source: 'level' | 'dps' | 'global';
}

export interface Roster {
  world: string;
  exportedAt: string;
  counts: Record<string, number>;
  pals: RosterPal[];
  unknown: { characterIds: Array<{ id: string; count: number }>; passives: string[] };
}
