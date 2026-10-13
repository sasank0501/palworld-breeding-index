import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { decodeSave, readContainerHeader } from './container.ts';
import { findWorlds } from './findWorlds.ts';
import { hasXboxIndex, parseContainersIndex, steamPathFor, xboxToSteamLayout } from './xbox.ts';
import { buildWgs, joinBytes, wrapCnk } from './xbox.fixture.ts';

const W1 = '402FCE184636F52E0AAE788CF2892671';
const W2 = '7AC316124DFCFF911FA76DB2D14AD4D3';
const P1 = '0000000000000000000000000000000A';
const USER = 'wgs/000900000487F3B6_0000000000000000000000006B210A9C';
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const layout = (files: ReturnType<typeof buildWgs>) => xboxToSteamLayout(files, async (f) => f, joinBytes);

/** A Steam .sav: the 12-byte header, then the payload. */
function steamSav(gvas: Uint8Array, type: 0x30 | 0x31): Uint8Array {
  const payload = type === 0x31 ? new Uint8Array(deflateSync(gvas)) : gvas;
  const head = new Uint8Array(12);
  const view = new DataView(head.buffer);
  view.setUint32(0, gvas.length, true);
  view.setUint32(4, payload.length, true);
  head.set([0x50, 0x6c, 0x5a, type], 8); // "PlZ"
  return joinBytes([head, payload]);
}

describe('Xbox container index', () => {
  it('lists each container with its folder, list number and time', () => {
    const files = buildWgs(USER, [
      { name: `${W1}-Level`, data: bytes('L'), seq: 3, modified: 1_760_000_000_000 },
      { name: `${W1}-LevelMeta`, data: bytes('M') },
    ]);
    const index = files.find((f) => f.path.endsWith('containers.index'))!;
    const containers = parseContainersIndex(index.file);
    expect(containers.map((c) => c.name)).toEqual([`${W1}-Level`, `${W1}-LevelMeta`]);
    expect(containers[0]).toMatchObject({ seq: 3, modified: 1_760_000_000_000 });
    // The folder name is the one the fixture wrote the container under.
    expect(files.some((f) => f.path === `${USER}/${containers[0].dir}/container.3`)).toBe(true);
    expect(containers[0].dir).toMatch(/^[0-9A-F]{32}$/);
  });

  it('refuses an index that stops half-way', () => {
    const index = buildWgs(USER, [{ name: `${W1}-Level`, data: bytes('L') }]).find((f) => f.path.endsWith('containers.index'))!;
    expect(() => parseContainersIndex(index.file.subarray(0, index.file.length - 10))).toThrow(/ends early/);
  });
});

describe('container names', () => {
  it('map to the Steam layout', () => {
    expect(steamPathFor(`${W1}-Level`)).toEqual({ path: `${W1}/Level.sav` });
    expect(steamPathFor(`${W1}-LevelMeta`)).toEqual({ path: `${W1}/LevelMeta.sav` });
    expect(steamPathFor(`${W1}-Players-${P1}`)).toEqual({ path: `${W1}/Players/${P1}.sav` });
    expect(steamPathFor(`${W1}-Players-${P1}_dps`)).toEqual({ path: `${W1}/Players/${P1}_dps.sav` });
    expect(steamPathFor('GlobalPalStorage')).toEqual({ path: 'GlobalPalStorage.sav' });
  });

  it('read a numbered Level as a piece, and drop the slot marker', () => {
    expect(steamPathFor(`${W1}-Level-02`)).toEqual({ path: `${W1}/Level.sav`, part: 2 });
    expect(steamPathFor(`${W1}-Slot1-Players-${P1}`)).toEqual({ path: `${W1}/Players/${P1}.sav` });
  });
});

describe('xboxToSteamLayout', () => {
  it('finds the worlds of a picked wgs folder', async () => {
    const files = buildWgs(USER, [
      { name: `${W1}-Level`, data: bytes('level 1'), modified: 100 },
      { name: `${W1}-LevelMeta`, data: bytes('meta 1') },
      { name: `${W1}-LocalData`, data: bytes('local') },
      { name: `${W1}-Players-${P1}`, data: bytes('player') },
      { name: `${W1}-Players-${P1}_dps`, data: bytes('dps') },
      { name: `${W2}-Level`, data: bytes('level 2'), modified: 200, sameIds: true },
      { name: 'GlobalPalStorage', data: bytes('global') },
    ]);
    expect(hasXboxIndex(files)).toBe(true);
    expect(findWorlds(files).hint).toBe('xbox');

    const found = findWorlds(await layout(files));
    expect(found.missingGlobal).toBe(false);
    expect(found.worlds.map((w) => w.id)).toEqual([W2, W1]);
    const w1 = found.worlds[1];
    expect(text(w1.level)).toBe('level 1');
    expect(text(w1.levelMeta!)).toBe('meta 1');
    expect(w1.players.map((p) => [p.name, text(p.file)])).toEqual([
      [`${P1}.sav`, 'player'],
      [`${P1}_dps.sav`, 'dps'],
    ]);
    expect(text(w1.global!)).toBe('global');
    expect(w1.lastPlayed).toBe(100);
    expect(text(found.worlds[0].level)).toBe('level 2');
  });

  it('works when the account folder itself is picked', async () => {
    const files = buildWgs('', [
      { name: `${W1}-Level`, data: bytes('level') },
      { name: 'GlobalPalStorage', data: bytes('global') },
    ]);
    const found = findWorlds(await layout(files));
    expect(found.worlds.map((w) => w.id)).toEqual([W1]);
    expect(text(found.worlds[0].global!)).toBe('global');
  });

  it('joins a Level stored in numbered pieces, in order', async () => {
    const files = buildWgs(USER, [
      { name: `${W1}-Level-02`, data: bytes('world'), modified: 5 },
      { name: `${W1}-Level-01`, data: bytes('hello '), modified: 9 },
      { name: `${W2}-Level-01`, data: bytes('alone') },
    ]);
    const found = findWorlds(await layout(files));
    const byId = new Map(found.worlds.map((w) => [w.id, w]));
    expect(text(byId.get(W1)!.level)).toBe('hello world');
    expect(byId.get(W1)!.lastPlayed).toBe(9);
    expect(text(byId.get(W2)!.level)).toBe('alone');
  });

  it('keeps the newest of two containers with one name', async () => {
    const files = buildWgs(USER, [
      { name: `${W1}-Level`, data: bytes('old'), seq: 1, modified: 500 },
      { name: `${W1}-Level`, data: bytes('new'), seq: 2, modified: 100 },
    ]);
    expect(text(findWorlds(await layout(files)).worlds[0].level)).toBe('new');
  });

  it('leaves out a container whose blob has not synced', async () => {
    const files = buildWgs(USER, [
      { name: `${W1}-Level`, data: bytes('level'), missingBlob: true },
      { name: `${W2}-Level`, data: bytes('level 2') },
    ]);
    expect(findWorlds(await layout(files)).worlds.map((w) => w.id)).toEqual([W2]);
  });
});

describe('the CNK wrapper', () => {
  const gvas = bytes('GVAS and then a save, long enough to be worth compressing compressing compressing');

  it.each([0x30, 0x31] as const)('is skipped to reach the same payload (type 0x%s)', async (type) => {
    const steam = steamSav(gvas, type);
    const xbox = wrapCnk(steam);
    expect(readContainerHeader(steam)).toMatchObject({ chunked: false, dataOffset: 12, magic: 'PlZ' });
    expect(readContainerHeader(xbox)).toMatchObject({ chunked: true, dataOffset: 24, magic: 'PlZ', rawSize: gvas.length });
    expect((await decodeSave(xbox)).data).toEqual((await decodeSave(steam)).data);
    expect(text((await decodeSave(xbox)).data)).toBe(text(gvas));
  });

  it('is refused when nothing follows it', () => {
    expect(() => readContainerHeader(wrapCnk(steamSav(gvas, 0x30)).subarray(0, 20))).toThrow(/too short/);
  });
});
