/**
 * Which browser features this page can use. The website plan (docs/WEBSITE-PLAN.md)
 * leans on newer APIs — folder pickers, the origin private file system, Service
 * Workers — that some browsers lack, so every caller asks here and takes the
 * fallback when a feature is missing. We test for the feature itself, never for
 * the browser's name: a browser that adds an API later just starts using it.
 *
 * Checked once per page and cached. Everything is optional-chained so this runs
 * (and reports "no") under vitest's Node environment too.
 *
 * Not reported: FileSystemFileHandle.createSyncAccessHandle. It only exists inside
 * dedicated workers, so a check from the page always says no; the extractor
 * worker checks it where it runs.
 */

export interface Features {
  /** Pick a whole folder, and remember it between visits (Chrome, Edge). */
  directoryPicker: boolean;
  /** Choose where to save a file, and keep writing to it (Chrome, Edge). */
  saveFilePicker: boolean;
  /** `<input webkitdirectory>`: pick a folder, read-only, every browser. The fallback. */
  directoryInput: boolean;
  /** Origin private file system: the site's own private folder. */
  opfs: boolean;
  /** Streamed writes into OPFS from the page. */
  opfsWritable: boolean;
  /** Can answer the page's requests from local files. Off in some private windows. */
  serviceWorker: boolean;
  /** navigator.storage.persist() exists. */
  persistApi: boolean;
  /** Storage is already marked persistent (not deleted under disk pressure). */
  persisted: boolean;
  /** Bytes used and allowed for this site, when the browser says. */
  quota: { usage: number; quota: number } | null;
  /** Tabs of the same site can message each other. */
  broadcastChannel: boolean;
  /** Render outside the page, in a worker (stills without freezing the UI). */
  offscreenCanvas: boolean;
  webgl2: boolean;
  webAssembly: boolean;
  /** IndexedDB, where the user's own data lives. */
  indexedDb: boolean;
}

let cached: Promise<Features> | undefined;

export function detectFeatures(): Promise<Features> {
  cached ??= detect();
  return cached;
}

async function detect(): Promise<Features> {
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;

  // Ask the questions that can throw (private windows, blocked storage) one by one.
  const quietly = async <T,>(f: () => Promise<T> | T | undefined, fallback: T): Promise<T> => {
    try {
      return (await f()) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const opfs = await quietly(async () => {
    if (typeof storage?.getDirectory !== 'function') return false;
    await storage.getDirectory(); // Firefox private windows reject here
    return true;
  }, false);

  const estimate = await quietly(() => storage?.estimate?.(), undefined);

  return {
    directoryPicker: typeof g.showDirectoryPicker === 'function',
    saveFilePicker: typeof g.showSaveFilePicker === 'function',
    directoryInput: typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input'),
    opfs,
    opfsWritable: opfs && typeof g.FileSystemFileHandle === 'function' && 'createWritable' in FileSystemFileHandle.prototype,
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator && g.isSecureContext === true,
    persistApi: typeof storage?.persist === 'function',
    persisted: await quietly(() => storage?.persisted?.(), false),
    quota: estimate?.quota != null ? { usage: estimate.usage ?? 0, quota: estimate.quota } : null,
    broadcastChannel: typeof g.BroadcastChannel === 'function',
    offscreenCanvas: typeof g.OffscreenCanvas === 'function',
    webgl2: await quietly(() => typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2'), false),
    webAssembly: typeof g.WebAssembly === 'object',
    indexedDb: typeof g.indexedDB === 'object' && g.indexedDB !== null,
  };
}

/** One row per feature, for console.table and bug reports. */
export function describeFeatures(f: Features): Record<string, string> {
  const mb = (n: number) => `${Math.round(n / 1024 / 1024).toLocaleString()} MB`;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === 'quota') out[k] = f.quota ? `${mb(f.quota.usage)} used of ${mb(f.quota.quota)}` : 'unknown';
    else out[k] = v ? 'yes' : 'no';
  }
  return out;
}
