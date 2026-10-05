/**
 * Ask the player for their save folder and list what is in it, without reading
 * any file's contents (a File is a handle until something reads it).
 *
 * Always the classic <input webkitdirectory>, never showDirectoryPicker. Chrome
 * and Edge block the File System Access picker for the whole AppData tree ("can't
 * open this folder because it contains system files"), and every Steam save lives
 * in %LOCALAPPDATA%. The classic input has no such block, works in every current
 * browser, and gives the same list for findWorlds(). Browsers ask to confirm it
 * with "upload" wording; nothing is uploaded, which the import screen says.
 */

import type { PickedFile } from './findWorlds.ts';

/** null when the player cancels. */
export function pickSaveFolder(): Promise<Array<PickedFile<File>> | null> {
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

/** Where Steam keeps Palworld saves on Windows, to copy into the picker's address bar. */
export const SAVE_PATH_HINT = '%LOCALAPPDATA%\\Pal\\Saved\\SaveGames';
