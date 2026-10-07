/**
 * The type mappings (.usmap) the extractor needs to read the game's files
 * (docs/WEBSITE-PLAN.md, Phase 6; README, "Outside dependencies").
 *
 * Unreal stores Palworld's data without field names; a mappings file supplies
 * them. Only a dumper injected into the running game can make one, so the site
 * fetches a community file at runtime. Measured on 7 Oct 2026: for the art
 * (meshes, materials, animations) any Palworld mappings file works, from 0.1.3 to
 * 1.0.5, because those are Unreal Engine types that patches don't change. An
 * engine upgrade could change that, so every file is still checked by decoding
 * art before it is used: `verify` is that check, supplied by the extractor.
 *
 * Order: the file kept from last time → each recent UsefulFiles commit (raw
 * GitHub, then jsDelivr for the same commit) → files we tested ourselves → ask
 * the player for a file. A file that fails the check skips its other mirrors,
 * which serve the same bytes.
 */

import { createStore, get, set, type UseStore } from 'idb-keyval';

// ---------------------------------------------------------------- sources

const REPO = 'PalworldModding/UsefulFiles';
const FILE = 'Mappings.usmap';
const raw = (repo: string, ref: string, path: string) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
const cdn = (repo: string, ref: string, path: string) => `https://cdn.jsdelivr.net/gh/${repo}@${ref}/${path}`;

/** The GitHub API call that lists the file's versions, newest first. 60 calls an hour per address. */
export const COMMITS_URL = `https://api.github.com/repos/${REPO}/commits?path=${FILE}&per_page=6`;

/** One version of a mappings file, and the addresses that serve it. */
export interface Candidate {
  /** Shown to the player and kept with the stored file, e.g. "UsefulFiles · Update Mapping to 1.0.5". */
  label: string;
  urls: string[];
  /** When the bytes are known in advance, a mismatch is treated as a failed download. */
  sha256?: string;
}

/**
 * Files we decoded ourselves against the whole pal roster on 7 Oct 2026 (game
 * 1.0.5): the newest UsefulFiles file, and the archive's newest Palworld file,
 * which is a separate source. Pinned to commits, so these bytes can't change.
 */
export const TESTED: Candidate[] = [
  {
    label: 'UsefulFiles · 1.0.5 (tested 7 Oct 2026)',
    urls: [
      raw(REPO, 'acdf1a6a6076f84fae3275e7c1cdd08188994da8', FILE),
      cdn(REPO, 'acdf1a6a6076f84fae3275e7c1cdd08188994da8', FILE),
    ],
    sha256: 'e919d45fa8eebc38e6f864ba9594706ce84a531f6970a2b2dd8dfa453d0705d9',
  },
  {
    label: 'Unreal-Mappings-Archive · 0.6.6 (tested 7 Oct 2026)',
    urls: [
      raw('TheNaeem/Unreal-Mappings-Archive', '2bc981a875a54bac765d85f097af02e639616cc9', 'Palworld/0.6.6/Mappings.usmap'),
      cdn('TheNaeem/Unreal-Mappings-Archive', '2bc981a875a54bac765d85f097af02e639616cc9', 'Palworld/0.6.6/Mappings.usmap'),
    ],
    sha256: '93bed9877a60c80ec6fd6a240e0122918e795d67ce78725ce0b1e5ffe6739c1f',
  },
];

interface CommitListing {
  sha?: unknown;
  commit?: { message?: unknown; committer?: { date?: unknown } };
}

/**
 * The order to try, from the GitHub API's commit list (or null when the API
 * couldn't be reached): each recent commit, newest first, then the tested files.
 * Without the list, the branch's latest file stands in for it.
 */
export function candidates(listing: unknown): Candidate[] {
  const out: Candidate[] = [];
  const commits = Array.isArray(listing) ? (listing as CommitListing[]) : null;
  if (commits?.length) {
    for (const c of commits) {
      if (typeof c.sha !== 'string' || !/^[0-9a-f]{40}$/.test(c.sha)) continue;
      const message = typeof c.commit?.message === 'string' ? c.commit.message.split('\n')[0].slice(0, 80) : c.sha.slice(0, 7);
      const date = typeof c.commit?.committer?.date === 'string' ? c.commit.committer.date.slice(0, 10) : '';
      out.push({ label: `UsefulFiles · ${message}${date ? ` (${date})` : ''}`, urls: [raw(REPO, c.sha, FILE), cdn(REPO, c.sha, FILE)] });
    }
  } else {
    out.push({ label: 'UsefulFiles · latest', urls: [raw(REPO, 'master', FILE), cdn(REPO, 'master', FILE)] });
  }
  // A tested file the list already covers is the same commit: keep only the first.
  for (const t of TESTED) if (!out.some((c) => c.urls[0] === t.urls[0])) out.push(t);
  return out;
}

// ---------------------------------------------------------------- the file itself

/** Larger than any real mappings file by far (1.0.5's is 2.8 MB); stops a wrong download early. */
export const MAX_BYTES = 64 * 1024 * 1024;

const COMPRESSION = ['none', 'Oodle', 'Brotli', 'Zstandard'] as const;

/**
 * Is this a mappings file at all? Catches the usual wrong downloads (an HTML
 * error page, a truncated file) before the slower decode check. Layout:
 * u16 magic 0x30C4, u8 version, [version ≥ 1: i32 "has versioning" + its data],
 * u8 compression, u32 compressed size, u32 decompressed size, then the data.
 */
export function readHeader(bytes: Uint8Array): { version: number; compression: string } | { problem: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 2 || view.getUint16(0, true) !== 0x30c4) return { problem: 'This is not a .usmap mappings file.' };
  if (bytes.length < 12) return { problem: 'The file is too short to be a mappings file.' };
  const version = view.getUint8(2);
  let at = 3;
  let checkSize = true;
  if (version >= 1) {
    if (bytes.length < 16) return { problem: 'The file is too short to be a mappings file.' };
    // Versioning data has a variable length; when present, the size check below is skipped.
    if (view.getInt32(at, true) !== 0) checkSize = false;
    at += 4;
  }
  if (!checkSize) return { version, compression: 'unknown' };
  const method = view.getUint8(at);
  if (method >= COMPRESSION.length) return { problem: `This mappings file uses an unknown compression (${method}).` };
  const compressedSize = view.getUint32(at + 1, true);
  if (at + 9 + compressedSize !== bytes.length) return { problem: 'This mappings file is incomplete: it is shorter or longer than its header says.' };
  return { version, compression: COMPRESSION[method] };
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- the stored copy

export interface StoredMappings {
  bytes: Uint8Array;
  sha256: string;
  /** Where it came from: a candidate's label, or "Your file: <name>". */
  label: string;
  savedAt: string;
}

/** Kept apart from the art packs: loading a new pack sweeps every other pack folder. */
export function mappingsStore(store: UseStore = createStore('palworld-mappings', 'files')) {
  return {
    get: async () => (await get<StoredMappings>('current', store)) ?? null,
    set: (m: StoredMappings) => set('current', m, store),
  };
}
export type MappingsStore = ReturnType<typeof mappingsStore>;

// ---------------------------------------------------------------- finding a file that works

/**
 * Decode some art with these mappings: null when it works, else a plain reason.
 * The extractor supplies it (Phase 6, step 3), since decoding needs the game files.
 */
export type Verify = (bytes: Uint8Array) => Promise<string | null>;

export type MappingsStatus =
  | { step: 'list' }
  | { step: 'download'; label: string; url: string }
  | { step: 'check'; label: string };

export interface Attempt {
  label: string;
  /** null when this one worked. */
  problem: string | null;
}

export type MappingsResult =
  | { ok: true; mappings: StoredMappings; attempts: Attempt[] }
  /** Nothing worked: ask the player for a file (acceptPlayerFile), and show the attempts. */
  | { ok: false; attempts: Attempt[] };

export interface FindOptions {
  store: MappingsStore;
  verify: Verify;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  onStatus?: (s: MappingsStatus) => void;
  /** Per request. A stuck download moves on to the next address instead of hanging. */
  timeoutMs?: number;
}

const describe = (e: unknown) =>
  e instanceof DOMException && e.name === 'TimeoutError' ? 'it took too long to answer' : e instanceof Error ? e.message : String(e);

async function download(url: string, fetchFn: typeof fetch, signal: AbortSignal | undefined, timeoutMs: number): Promise<Uint8Array> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetchFn(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-cache' });
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) throw new Error('the file is far too large to be a mappings file');
  return new Uint8Array(await res.arrayBuffer());
}

/** Check a file and, if it works, keep it as the current one. */
async function accept(bytes: Uint8Array, label: string, opts: FindOptions): Promise<{ mappings: StoredMappings } | { problem: string }> {
  const header = readHeader(bytes);
  if ('problem' in header) return { problem: header.problem };
  opts.onStatus?.({ step: 'check', label });
  const problem = await opts.verify(bytes);
  if (problem) return { problem };
  const mappings: StoredMappings = { bytes, sha256: await sha256(bytes), label, savedAt: new Date().toISOString() };
  await opts.store.set(mappings);
  return { mappings };
}

/**
 * Find mappings that decode this game: the stored copy first, then the sources
 * in order. Stopping (the signal) rejects with an AbortError; every other
 * failure is recorded in `attempts` and the search moves on.
 */
export async function findMappings(opts: FindOptions): Promise<MappingsResult> {
  const fetchFn = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const attempts: Attempt[] = [];
  const stopped = () => opts.signal?.throwIfAborted();

  const kept = await opts.store.get();
  if (kept) {
    opts.onStatus?.({ step: 'check', label: kept.label });
    const problem = await opts.verify(kept.bytes);
    attempts.push({ label: `${kept.label} (kept from last time)`, problem });
    if (!problem) return { ok: true, mappings: kept, attempts };
  }
  stopped();

  opts.onStatus?.({ step: 'list' });
  let listing: unknown = null;
  try {
    const res = await fetchFn(COMMITS_URL, { signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
    if (res.ok) listing = await res.json();
  } catch (e) {
    stopped();
    void e; // No list (offline, rate limit): the branch's latest file stands in.
  }

  const tried = new Set<string>(kept ? [kept.sha256] : []);
  for (const c of candidates(listing)) {
    stopped();
    let bytes: Uint8Array | null = null;
    const failures: string[] = [];
    for (const url of c.urls) {
      opts.onStatus?.({ step: 'download', label: c.label, url });
      try {
        const got = await download(url, fetchFn, opts.signal, timeoutMs);
        if (c.sha256 && (await sha256(got)) !== c.sha256) throw new Error('the file is not the one we tested');
        bytes = got;
        break;
      } catch (e) {
        stopped();
        failures.push(`${new URL(url).host}: ${describe(e)}`);
      }
    }
    if (!bytes) {
      attempts.push({ label: c.label, problem: `Couldn't download it (${failures.join('; ')}).` });
      continue;
    }
    const hash = await sha256(bytes);
    if (tried.has(hash)) continue; // Same bytes as one already checked: same answer.
    tried.add(hash);
    const result = await accept(bytes, c.label, opts);
    attempts.push({ label: c.label, problem: 'problem' in result ? result.problem : null });
    if ('mappings' in result) return { ok: true, mappings: result.mappings, attempts };
  }
  return { ok: false, attempts };
}

/** The player's own file, the last resort: same header check and decode check. */
export async function acceptPlayerFile(file: Blob & { name?: string }, opts: Pick<FindOptions, 'store' | 'verify' | 'onStatus'>): Promise<{ ok: true; mappings: StoredMappings } | { ok: false; problem: string }> {
  if (file.size > MAX_BYTES) return { ok: false, problem: 'That file is far too large to be a mappings file.' };
  const result = await accept(new Uint8Array(await file.arrayBuffer()), `Your file: ${file.name ?? 'Mappings.usmap'}`, opts);
  return 'mappings' in result ? { ok: true, mappings: result.mappings } : { ok: false, problem: result.problem };
}
