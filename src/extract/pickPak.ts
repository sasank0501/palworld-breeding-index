/**
 * Ask the player for the game's pak, and check it before .NET starts
 * (docs/WEBSITE-PLAN.md, Phase 6, step 4).
 *
 * One file, not a folder: a classic <input type="file">. A folder pick makes
 * browsers ask to confirm an "upload" (nothing is uploaded, but it reads badly
 * before opening a 39 GB file), and Chrome and Edge block the newer folder picker
 * for Program Files, where Steam installs by default. A file input has neither
 * problem. It also leaves mods out by design: anything in ~mods is never opened.
 */

/** null when the player cancels. */
export function pickPak(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pak';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export const PAK_NAME = 'Pal-Windows.pak';

/** Steam's default install. Pasted into the file dialog's name box, it opens the file directly. */
export const PAK_PATH_HINT = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Palworld\\Pal\\Content\\Paks\\Pal-Windows.pak';

/** The Unreal pak footer's magic number, 0x5A6F12E1, as it sits on disk (little-endian). */
const MAGIC = [0xe1, 0x12, 0x6f, 0x5a];
/** Palworld's pak is version 11 (measured 2026-10-04); others may still work, so they only get a note. */
export const KNOWN_VERSION = 11;
/** Far below the real file (39 GB), far above any mod pak. */
const MIN_BYTES = 5e9;
const TAIL = 512;

export type PakCheck =
  | { ok: true; size: number; version: number; note: string | null }
  | { ok: false; problem: string };

/**
 * Is this Palworld's game file? Reads only its last 512 bytes, where Unreal puts a
 * fixed footer: a magic number, then the pak version. Fast, so a wrong pick is
 * caught before the 43 MB extractor even downloads.
 */
export async function checkPak(file: Blob & { name: string }): Promise<PakCheck> {
  const name = file.name;
  if (!/\.pak$/i.test(name)) return { ok: false, problem: `“${name}” isn’t a .pak file. Choose ${PAK_NAME}.` };
  if (file.size < MIN_BYTES) {
    return {
      ok: false,
      problem:
        name.toLowerCase() === PAK_NAME.toLowerCase()
          ? `This ${PAK_NAME} is only ${(file.size / 1e9).toFixed(1)} GB; the game’s is about 39 GB. If Steam is still downloading Palworld, wait for it to finish.`
          : `“${name}” is too small to be the game’s file (a mod, perhaps). Choose ${PAK_NAME} in the same Paks folder.`,
    };
  }
  let tail: Uint8Array;
  try {
    tail = new Uint8Array(await file.slice(file.size - TAIL).arrayBuffer());
  } catch {
    return { ok: false, problem: 'The file couldn’t be read. If Steam is updating Palworld, wait for it to finish, then choose the file again.' };
  }
  let at = -1;
  for (let i = tail.length - 8; i >= 0; i--) {
    if (tail[i] === MAGIC[0] && tail[i + 1] === MAGIC[1] && tail[i + 2] === MAGIC[2] && tail[i + 3] === MAGIC[3]) {
      at = i;
      break;
    }
  }
  if (at < 0) return { ok: false, problem: `“${name}” isn’t an Unreal game file. Choose ${PAK_NAME}.` };
  const version = new DataView(tail.buffer, tail.byteOffset + at + 4, 4).getUint32(0, true);
  return {
    ok: true,
    size: file.size,
    version,
    note:
      version === KNOWN_VERSION
        ? name.toLowerCase() === PAK_NAME.toLowerCase()
          ? null
          : `This is “${name}”, not ${PAK_NAME}, but it looks like the game’s file, so it will be tried.`
        : `This file is pak version ${version}; PalDoc was tested with ${KNOWN_VERSION}. It will be tried, but a game update may have changed things.`,
  };
}
