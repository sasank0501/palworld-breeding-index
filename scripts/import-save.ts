/**
 * Reads a local Palworld save and emits public/roster.json for the app.
 *
 *   npm run import-save                 # newest world in the default save folder
 *   npm run import-save -- --list       # show worlds without importing
 *   npm run import-save -- --world <id>
 *   npm run import-save -- --save-dir "D:\\path\\to\\<steamid>\\<worldid>"
 *
 * Saves are copied to a temp folder before being read so a mid-write file from a
 * running game cannot be parsed halfway. Nothing is ever written back to the save.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { decodeSave } from '../src/save/container.ts';
import { buildSpeciesIndex, type PalDexEntry } from '../src/save/species.ts';
import {
  assembleRoster,
  readLevelPals,
  readPlayerSave,
  readStoragePals,
  type ContainerRoles,
  type RosterPal,
} from '../src/save/roster.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'roster.json');

const { values } = parseArgs({
  options: {
    world: { type: 'string' },
    'save-dir': { type: 'string' },
    out: { type: 'string' },
    list: { type: 'boolean', default: false },
  },
});

function defaultSaveRoot(): string {
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Pal', 'Saved', 'SaveGames');
}

interface WorldDir {
  id: string;
  dir: string;
  steamId: string;
  mtime: Date;
}

function findWorlds(root: string): WorldDir[] {
  if (!fs.existsSync(root)) return [];
  const out: WorldDir[] = [];
  for (const steam of fs.readdirSync(root)) {
    const steamDir = path.join(root, steam);
    if (!fs.statSync(steamDir).isDirectory()) continue;
    for (const world of fs.readdirSync(steamDir)) {
      const dir = path.join(steamDir, world);
      const level = path.join(dir, 'Level.sav');
      if (fs.existsSync(level)) {
        out.push({ id: world, dir, steamId: steam, mtime: fs.statSync(level).mtime });
      }
    }
  }
  return out.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

/** Snapshot the files we need so a running game cannot change them mid-parse. */
function snapshot(worldDir: string): { dir: string; cleanup: () => void } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'palworld-import-'));
  const copy = (from: string, to: string) => {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  };

  copy(path.join(worldDir, 'Level.sav'), path.join(tmp, 'Level.sav'));
  const players = path.join(worldDir, 'Players');
  if (fs.existsSync(players)) {
    for (const f of fs.readdirSync(players)) {
      if (f.endsWith('.sav')) copy(path.join(players, f), path.join(tmp, 'Players', f));
    }
  }
  // GlobalPalStorage sits one level up, beside the world folders.
  copy(path.join(worldDir, '..', 'GlobalPalStorage.sav'), path.join(tmp, 'GlobalPalStorage.sav'));

  return { dir: tmp, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

const readGvas = async (file: string): Promise<Uint8Array> =>
  (await decodeSave(new Uint8Array(fs.readFileSync(file)))).data;

async function main(): Promise<void> {
  const root = defaultSaveRoot();
  const worlds = findWorlds(root);

  if (values.list) {
    if (!worlds.length) {
      console.log(`No worlds found under ${root}`);
      return;
    }
    console.log(`Worlds under ${root}:`);
    for (const w of worlds) console.log(`  ${w.id}   last played ${w.mtime.toISOString()}   (steam ${w.steamId})`);
    return;
  }

  let worldDir: string;
  let worldId: string;
  if (values['save-dir']) {
    worldDir = path.resolve(values['save-dir']);
    worldId = path.basename(worldDir);
  } else {
    const picked = values.world ? worlds.find((w) => w.id === values.world) : worlds[0];
    if (!picked) {
      console.error(
        values.world
          ? `World ${values.world} not found. Run with --list to see available worlds.`
          : `No Palworld saves found under ${root}. Pass --save-dir to point at one.`,
      );
      process.exitCode = 1;
      return;
    }
    worldDir = picked.dir;
    worldId = picked.id;
  }

  if (!fs.existsSync(path.join(worldDir, 'Level.sav'))) {
    console.error(`No Level.sav in ${worldDir}`);
    process.exitCode = 1;
    return;
  }

  console.log(`world   : ${worldId}`);
  console.log(`source  : ${worldDir}`);

  const snap = snapshot(worldDir);
  try {
    const pals = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src', 'data', 'pals.json'), 'utf8'),
    ) as Record<string, PalDexEntry>;
    const species = buildSpeciesIndex(pals);

    // Container roles come from the player saves; without them every pal would
    // land in "unknown" and the Pal Box / party split would be lost.
    const roles: ContainerRoles = { palBox: new Set(), party: new Set() };
    const playersDir = path.join(snap.dir, 'Players');
    const playerFiles = fs.existsSync(playersDir)
      ? fs.readdirSync(playersDir).filter((f) => f.endsWith('.sav') && !f.endsWith('_dps.sav'))
      : [];
    for (const f of playerFiles) {
      const info = readPlayerSave(await readGvas(path.join(playersDir, f)));
      if (info.palBoxContainerId) roles.palBox.add(info.palBoxContainerId);
      if (info.partyContainerId) roles.party.add(info.partyContainerId);
    }
    console.log(`players : ${playerFiles.length}  (palbox ${roles.palBox.size}, party ${roles.party.size})`);

    const groups: RosterPal[][] = [];

    const level = readLevelPals(await readGvas(path.join(snap.dir, 'Level.sav')), species, roles);
    groups.push(level.pals);
    console.log(`Level   : ${level.pals.length} pals`);

    const dpsFiles = fs.existsSync(playersDir)
      ? fs.readdirSync(playersDir).filter((f) => f.endsWith('_dps.sav'))
      : [];
    for (const f of dpsFiles) {
      const s = readStoragePals(await readGvas(path.join(playersDir, f)), species, roles, 'dps');
      groups.push(s.pals);
      console.log(`dps     : ${s.pals.length} pals of ${s.slots} slots  (${f})`);
    }

    const globalFile = path.join(snap.dir, 'GlobalPalStorage.sav');
    if (fs.existsSync(globalFile)) {
      const s = readStoragePals(await readGvas(globalFile), species, roles, 'global');
      groups.push(s.pals);
      console.log(`global  : ${s.pals.length} pals of ${s.slots} slots`);
    }

    const roster = assembleRoster(worldId, groups);

    const outPath = values.out ? path.resolve(values.out) : OUT;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(roster));

    console.log(`\nwrote ${path.relative(ROOT, outPath)}  (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
    console.log(
      `total ${roster.counts.total} pals — ` +
        Object.entries(roster.counts)
          .filter(([k]) => k !== 'total')
          .map(([k, v]) => `${k} ${v}`)
          .join(', '),
    );
    console.log(`distinct passives: ${roster.unknown.passives.length}`);

    if (roster.unknown.characterIds.length) {
      // Captured humans and post-dex content live here. Worth showing, not worth
      // failing on — the pals still appear in the app under their raw id.
      console.log(`\nunmapped CharacterIDs (${roster.unknown.characterIds.length}) — shown by raw id in the app:`);
      for (const { id, count } of roster.unknown.characterIds) console.log(`  ${String(count).padStart(4)}  ${id}`);
    }
  } finally {
    snap.cleanup();
  }
}

await main();
