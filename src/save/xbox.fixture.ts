/**
 * Test support: packs ordinary save bytes into an Xbox "wgs" folder, the way the
 * Microsoft Store build lays one out. Real Game Pass saves are tied to an
 * account, so the tests build their own.
 */

import type { PickedFile } from './findWorlds.ts';

export interface FixtureContainer {
  name: string;
  data: Uint8Array;
  /** Which `container.<n>` holds the file list. Default 1. */
  seq?: number;
  /** ms since 1970. Default 0. */
  modified?: number;
  /** Leave the blob out of the folder, as a half-synced save would. */
  missingBlob?: boolean;
  /** Write the same id twice in the file list (some machines) instead of zeros then the id. */
  sameIds?: boolean;
}

const u32 = (n: number) => new Uint8Array(new Uint32Array([n]).buffer);
const u64 = (n: bigint) => new Uint8Array(new BigUint64Array([n]).buffer);
const utf16 = (s: string, units = s.length) => {
  const out = new Uint8Array(units * 2);
  for (let i = 0; i < s.length; i++) new DataView(out.buffer).setUint16(i * 2, s.charCodeAt(i), true);
  return out;
};
const str = (s: string) => [u32(s.length), utf16(s)];
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const filetime = (ms: number) => u64(BigInt(ms + 11_644_473_600_000) * 10_000n);

/** 16 bytes that differ per call, and the folder name Windows gives them. */
let nextId = 1;
function guid(): { raw: Uint8Array; name: string } {
  const raw = new Uint8Array(16);
  for (let i = 0; i < 16; i++) raw[i] = (nextId * 37 + i * 11) & 0xff;
  nextId++;
  const order = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15];
  return { raw, name: order.map((i) => raw[i].toString(16).padStart(2, '0')).join('').toUpperCase() };
}

/** An Xbox save is the Steam file with one more 12-byte header in front. */
export function wrapCnk(sav: Uint8Array): Uint8Array {
  const head = new Uint8Array(12);
  head.set(sav.subarray(0, 8));
  head.set([0x43, 0x4e, 0x4b, sav[11]], 8); // "CNK"
  return concat([head, sav]);
}

/** The files of one wgs user folder, with paths under `root`. */
export function buildWgs(root: string, containers: FixtureContainer[]): Array<PickedFile<Uint8Array>> {
  const at = (rel: string) => (root ? `${root}/${rel}` : rel);
  const files: Array<PickedFile<Uint8Array>> = [];
  const index: Uint8Array[] = [
    u32(0xe),
    u32(containers.length),
    ...str(''),
    ...str('PocketpairInc.Palworld_ad4psfrxyesvt!AppPalShipping'),
    filetime(0),
    u32(0),
    ...str(''),
    u64(0n),
  ];
  for (const c of containers) {
    const dir = guid();
    const blob = guid();
    const seq = c.seq ?? 1;
    const modified = c.modified ?? 0;
    index.push(...str(c.name), ...str(c.name), ...str(''), new Uint8Array([seq]), u32(1), dir.raw, filetime(modified), u64(0n), u64(BigInt(c.data.length)));
    files.push({
      path: at(`${dir.name}/container.${seq}`),
      file: concat([u32(4), u32(1), utf16('Data', 64), c.sameIds ? blob.raw : new Uint8Array(16), blob.raw]),
      modified,
    });
    if (!c.missingBlob) files.push({ path: at(`${dir.name}/${blob.name}`), file: c.data, modified });
  }
  files.push({ path: at('containers.index'), file: concat(index), modified: 0 });
  return files;
}

export const joinBytes = concat;
