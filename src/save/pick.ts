/**
 * Ask the player for their save folder and list what is in it, without reading
 * any file's contents (a File is a handle until something reads it).
 *
 * Chrome and Edge have showDirectoryPicker; Firefox and Safari get a hidden
 * <input webkitdirectory>, which every current browser supports. Both produce the
 * same list for findWorlds(). We test for the API, never for the browser.
 */

import type { PickedFile } from './findWorlds.ts';

type DirHandle = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };

/** Folders that never hold anything the importer reads; skipping them keeps the walk fast. */
const SKIP = new Set(['backup']);

async function walk(dir: DirHandle, prefix: string, out: Array<PickedFile<File>>): Promise<void> {
  for await (const entry of dir.values()) {
    const path = `${prefix}/${entry.name}`;
    if (entry.kind === 'directory') {
      if (!SKIP.has(entry.name.toLowerCase())) await walk(entry as DirHandle, path, out);
    } else if (entry.name.toLowerCase().endsWith('.sav')) {
      const file = await (entry as FileSystemFileHandle).getFile();
      out.push({ path, file, modified: file.lastModified });
    }
  }
}

function viaInput(): Promise<Array<PickedFile<File>> | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      resolve(files.map((file) => ({ path: file.webkitRelativePath || file.name, file, modified: file.lastModified })));
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** null when the player cancels. */
export async function pickSaveFolder(): Promise<Array<PickedFile<File>> | null> {
  const picker = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> }).showDirectoryPicker;
  if (typeof picker !== 'function') return viaInput();
  let dir: DirHandle;
  try {
    dir = await picker({ id: 'palworld-saves', mode: 'read' });
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null;
    return viaInput(); // e.g. a sandboxed frame that refuses the picker
  }
  const out: Array<PickedFile<File>> = [];
  await walk(dir, dir.name, out);
  return out;
}

/** Where Steam keeps Palworld saves on Windows, to copy into the picker's address bar. */
export const SAVE_PATH_HINT = '%LOCALAPPDATA%\\Pal\\Saved\\SaveGames';
