/**
 * Local check of the Xbox path against a real save. Needs a Steam save on this
 * machine (%LOCALAPPDATA%\Pal\Saved\SaveGames); without one every test here is
 * skipped. It packs the newest world into an Xbox wgs folder, CNK headers and
 * all, reads it back through the Xbox path and expects the same roster as the
 * Steam import. Not a real Game Pass save: it proves the plumbing, not that the
 * container layout matches what the Xbox app writes today.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import pals from '../data/pals.json';
import { findWorlds, type FoundWorld, type PickedFile } from './findWorlds.ts';
import { importWorld } from './importWorld.ts';
import { buildSpeciesIndex, type PalDexEntry } from './species.ts';
import { xboxToSteamLayout } from './xbox.ts';
import { buildWgs, joinBytes, wrapCnk, type FixtureContainer } from './xbox.fixture.ts';

const ROOT = path.join(process.env.LOCALAPPDATA ?? '', 'Pal', 'Saved', 'SaveGames');

function pick(dir: string, rel = ''): Array<PickedFile<string>> {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    const at = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? pick(full, at) : [{ path: at, file: full, modified: fs.statSync(full).mtimeMs }];
  });
}

const steam = findWorlds(pick(ROOT, 'SaveGames')).worlds[0] as FoundWorld<string> | undefined;
const species = buildSpeciesIndex(pals as unknown as Record<string, PalDexEntry>);
const load = (file: string) => new Uint8Array(fs.readFileSync(file));

const roster = <T>(w: FoundWorld<T>, read: (f: T) => Uint8Array) =>
  importWorld(
    {
      id: w.id,
      level: async () => read(w.level),
      players: w.players.map((p) => ({ name: p.name, read: async () => read(p.file) })),
      global: w.global ? async () => read(w.global as T) : undefined,
    },
    species,
  );

describe.skipIf(!steam)('a real save through the Xbox path', () => {
  it('gives the roster the Steam import gives', async () => {
    const w = steam!;
    const level = wrapCnk(load(w.level));
    // The big file goes in as two pieces, to exercise the join.
    const half = Math.floor(level.length / 2);
    const containers: FixtureContainer[] = [
      { name: `${w.id}-Level-01`, data: level.subarray(0, half) },
      { name: `${w.id}-Level-02`, data: level.subarray(half) },
      ...w.players.map((p) => ({ name: `${w.id}-Players-${p.name.replace(/\.sav$/i, '')}`, data: wrapCnk(load(p.file)) })),
    ];
    if (w.levelMeta) containers.push({ name: `${w.id}-LevelMeta`, data: wrapCnk(load(w.levelMeta)) });
    if (w.global) containers.push({ name: 'GlobalPalStorage', data: wrapCnk(load(w.global)) });

    const wgs = buildWgs('wgs/000900000487F3B6_0000000000000000000000006B210A9C', containers);
    const found = findWorlds(await xboxToSteamLayout(wgs, async (f) => f, joinBytes));
    expect(found.worlds.map((x) => x.id)).toEqual([w.id]);
    const x = found.worlds[0];
    expect(x.players.map((p) => p.name)).toEqual(w.players.map((p) => p.name));
    expect(!!x.global).toBe(!!w.global);

    const viaSteam = await roster(w, load);
    const viaXbox = await roster(x, (b) => b);
    expect(viaXbox.roster.pals.length).toBeGreaterThan(0);
    expect(viaXbox.roster.pals).toEqual(viaSteam.roster.pals);
  }, 120_000);
});
