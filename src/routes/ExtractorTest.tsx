/**
 * A dev-only bench for the in-browser extractor (Phase 6), at #extract on the dev
 * server. It runs the real pieces in order on a pak you pick: start .NET, mount,
 * then find mappings with the real decode check. The player-facing screens come
 * with steps 4 and 5; this is how each step is tried by hand before then.
 */
import { useRef, useState } from 'react';

import { findMappings, mappingsStore, type MappingsStatus } from '../art/mappings.ts';
import GameFilePicker from '../components/GameFilePicker.tsx';
import { startExtractor, type Extractor } from '../extract/client.ts';
import type { PakCheck } from '../extract/pickPak.ts';
import { extractAll, type RunProgress } from '../extract/run.ts';
import type { PalExport } from '../extract/types.ts';
import '../design/showcase.css';

const hex = async (bytes: Uint8Array | string) => {
  // Material JSON is compared with the desktop's, written with Windows line endings.
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes.replace(/\r\n/g, '\n')) : bytes;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource))].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Base64 in chunks: String.fromCharCode(...bytes) overflows the stack on large files. */
const base64 = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

/** What the bench records per pal, for comparing with the desktop export (scripts/.cache/extract). */
async function record(p: PalExport) {
  return {
    name: p.name,
    mesh: p.mesh,
    ms: p.ms,
    bytes: p.bytes,
    heapMB: p.heapMB,
    reads: p.reads,
    errors: p.errors,
    glb: p.glb ? await hex(p.glb) : null,
    materials: Object.fromEntries(await Promise.all(Object.entries(p.materials).map(async ([k, v]) => [k, await hex(v)] as const))),
    materialText: p.materials,
    textures: p.textures.map((t) => ({ name: t.name, size: `${t.width}x${t.height}`, format: t.format })),
    animations: Object.fromEntries(await Promise.all(p.animations.map(async (a) => [a.role, { from: a.from, sha: await hex(a.psa) }] as const))),
    // Set window.__keepPsa = true to keep the animation bytes too, for comparing key by key.
    psa: (window as unknown as { __keepPsa?: boolean }).__keepPsa ? Object.fromEntries(p.animations.map((a) => [a.from, base64(a.psa)])) : undefined,
  };
}

const describeStatus = (s: MappingsStatus) =>
  s.step === 'list' ? 'Listing mappings versions…' : s.step === 'download' ? `Downloading ${s.label} from ${new URL(s.url).host}…` : `Checking ${s.label}…`;

export default function ExtractorTest() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [only, setOnly] = useState('');
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [exporting, setExporting] = useState(false);
  const stop = useRef<AbortController | null>(null);
  const extractor = useRef<Extractor | null>(null);
  const say = (line: string) => setLog((l) => [...l, `${(performance.now() / 1000).toFixed(1)}s  ${line}`]);

  async function run(pak: File, check: Extract<PakCheck, { ok: true }>) {
    setBusy(true);
    setLog([]);
    try {
      extractor.current?.stop();
      const x = (extractor.current = startExtractor());
      say(`Picked ${pak.name}, ${(pak.size / 1e9).toFixed(2)} GB, pak version ${check.version}${check.note ? ` (${check.note})` : ''}`);
      const boot = await x.boot();
      say(`.NET started in ${boot.bootMs} ms (${boot.runtime}, CUE4Parse ${boot.cue4parse})`);
      const mount = await x.mount(pak);
      say(`Mounted in ${mount.mountMs} ms: ${mount.files.toLocaleString()} files, ${mount.palMeshes} pal meshes, ${mount.reads} reads, ${(mount.bytesRead / 1e6).toFixed(1)} MB read`);
      const found = await findMappings({ store: mappingsStore(), verify: x.verify, onStatus: (s) => say(describeStatus(s)) });
      for (const a of found.attempts) say(`  ${a.problem ? '✕' : '✓'} ${a.label}${a.problem ? `: ${a.problem}` : ''}`);
      say(found.ok ? `Mappings ready: ${found.mappings.label} (${(found.mappings.bytes.length / 1e6).toFixed(2)} MB)` : 'No mappings worked: the page would now ask for a file.');
      setReady(found.ok);
    } catch (e) {
      say(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportPals() {
    const x = extractor.current;
    if (!x) return;
    setExporting(true);
    stop.current = new AbortController();
    const report: unknown[] = [];
    (window as unknown as { __palReport: unknown[] }).__palReport = report;
    const t0 = performance.now();
    try {
      const names = only.split(/[\s,]+/).filter(Boolean);
      const end = await extractAll(x, {
        only: names.length ? names : undefined,
        signal: stop.current.signal,
        onProgress: setProgress,
        onPal: async (p) => void report.push(await record(p)),
      });
      say(`Exported ${end.done - end.failed.length} of ${end.total} pals in ${((performance.now() - t0) / 1000).toFixed(0)} s (${(end.bytes / 1e6).toFixed(0)} MB handed over); ${end.failed.length} failed`);
      for (const f of end.failed) say(`  ✕ ${f.name}: ${f.error}`);
    } catch (e) {
      say(`Export stopped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="sc-shell" data-skin="pal" style={{ minHeight: '100vh', padding: 24 }}>
      <div style={{ display: 'grid', gap: 16, maxWidth: 900, margin: '0 auto' }}>
        <h1>Extractor bench</h1>
        <GameFilePicker disabled={busy} onPak={(pak, check) => void run(pak, check)} />
        <ol aria-live="polite" data-testid="log" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', listStyle: 'none', padding: 0 }}>
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
        {!busy && log.length > 0 && <p data-testid="done">Done.</p>}
        {ready && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              Only these pals (blank for all){' '}
              <input data-testid="only" value={only} onChange={(e) => setOnly(e.target.value)} placeholder="SheepBall, JetDragon" disabled={exporting} />
            </label>
            <button type="button" className="sc-btn" data-testid="export" onClick={() => void exportPals()} disabled={exporting}>
              Export pals
            </button>
            {exporting && (
              <button type="button" className="sc-btn ghost" onClick={() => stop.current?.abort()}>
                Stop after this pal
              </button>
            )}
          </div>
        )}
        {progress && (
          <p aria-live="polite" data-testid="progress">
            {progress.done} of {progress.total}
            {progress.current ? ` · ${progress.current}` : ''} · {(progress.bytes / 1e6).toFixed(0)} MB · {progress.failed.length} failed
          </p>
        )}
        {ready && !exporting && progress && progress.done === progress.total && <p data-testid="export-done">Export done.</p>}
      </div>
    </main>
  );
}
