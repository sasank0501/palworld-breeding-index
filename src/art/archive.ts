/**
 * A saved copy of the art: the whole pack in one file the player keeps, so a new browser, a
 * cleared cache or a second computer doesn't mean reading the game again. Made from the pack in
 * this browser (src/art/copy.ts) and loaded back through the same writer a picked folder uses.
 *
 * One file and not a folder, because only one browser family can write a folder to disk and
 * every browser can save a file. The layout is as plain as it can be:
 *
 *   "PALDOC-ART\n"               11 bytes, so a wrong file is turned away at once
 *   index length                 4 bytes, little-endian
 *   index                        JSON, UTF-8: { format, createdAt, files: [{ path, size }] }
 *   the files' bytes             end to end, in the index's order
 *
 * Nothing is compressed: the models and pictures already are. Reading one never loads it into
 * memory: each file is a slice of the picked file, read when it is written to storage.
 *
 * This module is pure (Blobs in, Blobs out), so it is unit-tested.
 */

import { describePack, selectPackFiles, type PackFile } from './pack.ts';

export const ARCHIVE_EXT = '.paldocart';
export const ARCHIVE_FORMAT = 1;
const MAGIC = 'PALDOC-ART\n';
/** An index far larger than any real pack's (about 1,000 files, 60 KB) is a damaged or hostile file. */
const MAX_INDEX = 4 * 1024 * 1024;

interface Index {
  format: number;
  createdAt: string;
  files: Array<{ path: string; size: number }>;
}

/** The parts of an archive, ready for `new Blob(parts)`. The files' own Blobs are used as they are, not copied. */
export function archiveParts(files: Array<{ path: string; blob: Blob }>, createdAt = new Date().toISOString()): BlobPart[] {
  const index: Index = { format: ARCHIVE_FORMAT, createdAt, files: files.map((f) => ({ path: f.path, size: f.blob.size })) };
  const json = new TextEncoder().encode(JSON.stringify(index));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, json.byteLength, true);
  return [new TextEncoder().encode(MAGIC), length, json, ...files.map((f) => f.blob)];
}

export type ArchiveRead =
  | { ok: true; createdAt: string; files: Array<PackFile<Blob>>; models: number; stills: number; icons: number; bytes: number }
  | { ok: false; problem: string };

const bad = (problem: string): ArchiveRead => ({ ok: false, problem });

/**
 * Open a saved copy: check it is one, and hand back each file as a slice of it. Every reason a
 * file can't be used comes back as a plain sentence for the player.
 */
export async function readArchive(file: Blob): Promise<ArchiveRead> {
  const headLength = MAGIC.length + 4;
  if (file.size < headLength) return bad('That file is too small to be a saved copy of the art.');
  const head = new Uint8Array(await file.slice(0, headLength).arrayBuffer());
  if (new TextDecoder().decode(head.subarray(0, MAGIC.length)) !== MAGIC) {
    return bad(`That isn’t a saved copy of the art. Choose the ${ARCHIVE_EXT} file PalDoc saved.`);
  }
  const indexLength = new DataView(head.buffer).getUint32(MAGIC.length, true);
  if (indexLength === 0 || indexLength > MAX_INDEX || headLength + indexLength > file.size) return bad('That saved copy is damaged (its list of files can’t be read).');

  let index: Index;
  try {
    index = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.slice(headLength, headLength + indexLength).arrayBuffer())) as Index;
  } catch {
    return bad('That saved copy is damaged (its list of files can’t be read).');
  }
  if (!index || typeof index !== 'object' || !Array.isArray(index.files)) return bad('That saved copy is damaged (its list of files can’t be read).');
  if (index.format !== ARCHIVE_FORMAT) return bad('That saved copy was made by a newer PalDoc than this one. Reload the page and try again.');

  // Each file is the next run of bytes. A size that isn't a whole, non-negative number, or a
  // total that doesn't match the file, means it was cut short or tampered with.
  let at = headLength + indexLength;
  const listed: Array<{ path: string; file: Blob; size: number }> = [];
  for (const f of index.files) {
    if (!f || typeof f.path !== 'string' || !Number.isSafeInteger(f.size) || f.size < 0) return bad('That saved copy is damaged (its list of files can’t be read).');
    listed.push({ path: f.path, file: file.slice(at, at + f.size), size: f.size });
    at += f.size;
  }
  if (at !== file.size) return bad('That saved copy is incomplete: it may not have finished downloading. Save a new one, or make the art from your game.');

  // The same gate a picked folder goes through: only art paths, nothing that climbs out.
  const files = selectPackFiles(listed);
  if (files.length !== listed.length) return bad('That saved copy holds files that aren’t pal art, so it wasn’t loaded.');
  const summary = describePack(files);
  if (summary.problem) return bad(summary.problem.replace(/in that folder/g, 'in that saved copy').replace(/That folder/g, 'That saved copy'));
  return { ok: true, createdAt: String(index.createdAt ?? ''), files, models: summary.models, stills: summary.stills, icons: summary.icons, bytes: summary.bytes };
}
