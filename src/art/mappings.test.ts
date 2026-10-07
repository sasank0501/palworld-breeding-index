import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import { describe, expect, it, vi } from 'vitest';

import { acceptPlayerFile, candidates, COMMITS_URL, findMappings, mappingsStore, readHeader, sha256, TESTED, type Verify } from './mappings.ts';

/** A minimal valid usmap: magic, version, [no versioning], compression none, sizes, payload. */
function usmap(payload: string, version = 4): Uint8Array {
  const body = new TextEncoder().encode(payload);
  const head = version >= 1 ? 16 : 12;
  const out = new Uint8Array(head + body.length);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0x30c4, true);
  v.setUint8(2, version);
  const at = version >= 1 ? 7 : 3; // the i32 "has versioning" flag stays 0
  v.setUint8(at, 0);
  v.setUint32(at + 1, body.length, true);
  v.setUint32(at + 5, body.length, true);
  out.set(body, head);
  return out;
}

const sha = (n: number) => n.toString(16).padStart(40, '0');
const commit = (n: number, message: string) => ({ sha: sha(n), commit: { message, committer: { date: '2026-09-20T16:38:25Z' } } });

/** A fake fetch: each URL answers with bytes, JSON, a status, or a network error. */
function fakeFetch(routes: Record<string, Uint8Array | object | number | 'down'>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (r === undefined || r === 'down') throw new TypeError('Failed to fetch');
    if (typeof r === 'number') return new Response('nope', { status: r });
    if (r instanceof Uint8Array) return new Response(r as BodyInit, { headers: { 'content-length': String(r.length) } });
    return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

let n = 0;
const freshStore = () => mappingsStore(createStore(`mappings-test-${n++}`, 'files'));
/** Works for any file whose payload says "good". */
const verify: Verify = async (bytes) => (new TextDecoder().decode(bytes).includes('good') ? null : 'Lamball’s materials came back empty.');

const rawUrl = (s: string) => `https://raw.githubusercontent.com/PalworldModding/UsefulFiles/${s}/Mappings.usmap`;
const cdnUrl = (s: string) => `https://cdn.jsdelivr.net/gh/PalworldModding/UsefulFiles@${s}/Mappings.usmap`;

describe('readHeader', () => {
  it('reads both header layouts in use', () => {
    expect(readHeader(usmap('x', 4))).toEqual({ version: 4, compression: 'none' });
    expect(readHeader(usmap('x', 0))).toEqual({ version: 0, compression: 'none' });
  });

  it('refuses an error page, a cut-off file and an unknown compression', () => {
    expect(readHeader(new TextEncoder().encode('<!doctype html><title>404</title>'))).toHaveProperty('problem', 'This is not a .usmap mappings file.');
    expect(readHeader(usmap('a longer payload').slice(0, 20))).toHaveProperty('problem', expect.stringMatching(/incomplete/));
    const odd = usmap('x');
    odd[7] = 9;
    expect(readHeader(odd)).toHaveProperty('problem', expect.stringMatching(/unknown compression/));
  });
});

describe('candidates', () => {
  it('tries each listed commit newest first, GitHub then jsDelivr, then the tested files', () => {
    const list = candidates([commit(2, 'Update Mapping to 1.0.5\n\nbody'), commit(1, 'Update Mapping to 1.0.3')]);
    expect(list.map((c) => c.label)).toEqual([
      'UsefulFiles · Update Mapping to 1.0.5 (2026-09-20)',
      'UsefulFiles · Update Mapping to 1.0.3 (2026-09-20)',
      ...TESTED.map((t) => t.label),
    ]);
    expect(list[0].urls).toEqual([rawUrl(sha(2)), cdnUrl(sha(2))]);
  });

  it('uses the branch when the list is missing or malformed', () => {
    for (const listing of [null, { message: 'API rate limit exceeded' }, []]) {
      const list = candidates(listing);
      expect(list[0].urls).toEqual([rawUrl('master'), cdnUrl('master')]);
      expect(list).toHaveLength(1 + TESTED.length);
    }
  });

  it('skips commits that are not real ids, and a tested commit the list already has', () => {
    const tested = TESTED[0].urls[0].split('/')[5];
    const list = candidates([{ sha: '../../evil' }, { sha: tested, commit: { message: 'Update Mapping to 1.0.5' } }]);
    expect(list.map((c) => c.urls[0])).toEqual([TESTED[0].urls[0], TESTED[1].urls[0]]);
  });
});

describe('findMappings', () => {
  it('uses the kept file without going online when it still works', async () => {
    const store = freshStore();
    const bytes = usmap('good old');
    await store.set({ bytes, sha256: await sha256(bytes), label: 'UsefulFiles · 1.0.3', savedAt: '2026-10-01' });
    const net = fakeFetch({});
    const r = await findMappings({ store, verify, fetch: net.fetch });
    expect(r.ok && r.mappings.label).toBe('UsefulFiles · 1.0.3');
    expect(net.calls).toEqual([]);
  });

  it('moves past a file that fails the check, and keeps the one that works', async () => {
    const store = freshStore();
    const net = fakeFetch({
      [COMMITS_URL]: [commit(3, 'Update Mapping to 1.1'), commit(2, 'Update Mapping to 1.0.5')],
      [rawUrl(sha(3))]: usmap('broken for this game'),
      [rawUrl(sha(2))]: usmap('good 1.0.5'),
    });
    const r = await findMappings({ store, verify, fetch: net.fetch });
    expect(r.ok).toBe(true);
    expect(r.attempts).toEqual([
      { label: 'UsefulFiles · Update Mapping to 1.1 (2026-09-20)', problem: 'Lamball’s materials came back empty.' },
      { label: 'UsefulFiles · Update Mapping to 1.0.5 (2026-09-20)', problem: null },
    ]);
    // A file that failed the check isn't fetched again from jsDelivr: same bytes, same answer.
    expect(net.calls).not.toContain(cdnUrl(sha(3)));
    expect((await store.get())?.label).toBe('UsefulFiles · Update Mapping to 1.0.5 (2026-09-20)');
  });

  it('falls back to jsDelivr when GitHub is down, and to the branch when the API is', async () => {
    const net = fakeFetch({ [COMMITS_URL]: 403, [rawUrl('master')]: 'down', [cdnUrl('master')]: usmap('good latest') });
    const r = await findMappings({ store: freshStore(), verify, fetch: net.fetch });
    expect(r.ok && r.mappings.label).toBe('UsefulFiles · latest');
    expect(net.calls).toEqual([COMMITS_URL, rawUrl('master'), cdnUrl('master')]);
  });

  it('checks identical bytes only once, and skips the kept file when it was the failing one', async () => {
    const store = freshStore();
    const stale = usmap('stale');
    await store.set({ bytes: stale, sha256: await sha256(stale), label: 'kept', savedAt: '' });
    const check = vi.fn(verify);
    const net = fakeFetch({
      [COMMITS_URL]: [commit(3, 'a'), commit(2, 'b'), commit(1, 'c')],
      [rawUrl(sha(3))]: stale,
      [rawUrl(sha(2))]: usmap('broken'),
      [rawUrl(sha(1))]: usmap('broken'),
    });
    const r = await findMappings({ store, verify: check, fetch: net.fetch });
    expect(r.ok).toBe(false);
    // kept + the first "broken": the second "broken" and the stale download are skipped.
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('treats a tested file with different bytes as a failed download', async () => {
    const routes: Record<string, Uint8Array | object | number | 'down'> = { [COMMITS_URL]: [] };
    for (const t of TESTED) for (const u of t.urls) routes[u] = usmap('good but not the tested bytes');
    const r = await findMappings({ store: freshStore(), verify, fetch: fakeFetch(routes).fetch });
    expect(r.ok).toBe(false);
    expect(r.attempts.find((a) => a.label === TESTED[0].label)?.problem).toMatch(/not the one we tested/);
  });

  it('reports every attempt when nothing works, so the page can ask for a file', async () => {
    const r = await findMappings({ store: freshStore(), verify, fetch: fakeFetch({}).fetch });
    expect(r.ok).toBe(false);
    expect(r.attempts.map((a) => a.label)).toEqual(['UsefulFiles · latest', ...TESTED.map((t) => t.label)]);
    expect(r.attempts[0].problem).toMatch(/raw\.githubusercontent\.com: Failed to fetch; cdn\.jsdelivr\.net: Failed to fetch/);
  });

  it('stops when asked', async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(findMappings({ store: freshStore(), verify, fetch: fakeFetch({}).fetch, signal: stop.signal })).rejects.toThrow();
  });
});

describe('acceptPlayerFile', () => {
  it('checks the player’s file like any other, and keeps it when it works', async () => {
    const store = freshStore();
    const bad = await acceptPlayerFile(new File([new TextEncoder().encode('hello')], 'notes.txt'), { store, verify });
    expect(bad).toEqual({ ok: false, problem: 'This is not a .usmap mappings file.' });
    const good = await acceptPlayerFile(new File([usmap('good mine') as BlobPart], 'Mappings.usmap'), { store, verify });
    expect(good.ok && good.mappings.label).toBe('Your file: Mappings.usmap');
    expect((await store.get())?.label).toBe('Your file: Mappings.usmap');
  });
});
