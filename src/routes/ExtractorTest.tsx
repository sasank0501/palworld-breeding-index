/**
 * A dev-only bench for the in-browser extractor (Phase 6), at #extract on the dev
 * server. It runs the real pieces in order on a pak you pick: start .NET, mount,
 * then find mappings with the real decode check. The player-facing screens come
 * with steps 4 and 5; this is how each step is tried by hand before then.
 */
import { useRef, useState } from 'react';

import { findMappings, mappingsStore, type MappingsStatus } from '../art/mappings.ts';
import { startExtractor, type Extractor } from '../extract/client.ts';

const describeStatus = (s: MappingsStatus) =>
  s.step === 'list' ? 'Listing mappings versions…' : s.step === 'download' ? `Downloading ${s.label} from ${new URL(s.url).host}…` : `Checking ${s.label}…`;

export default function ExtractorTest() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const extractor = useRef<Extractor | null>(null);
  const say = (line: string) => setLog((l) => [...l, `${(performance.now() / 1000).toFixed(1)}s  ${line}`]);

  async function run(pak: File) {
    setBusy(true);
    setLog([]);
    try {
      extractor.current?.stop();
      const x = (extractor.current = startExtractor());
      say(`Picked ${pak.name}, ${(pak.size / 1e9).toFixed(2)} GB`);
      const boot = await x.boot();
      say(`.NET started in ${boot.bootMs} ms (${boot.runtime}, CUE4Parse ${boot.cue4parse})`);
      const mount = await x.mount(pak);
      say(`Mounted in ${mount.mountMs} ms: ${mount.files.toLocaleString()} files, ${mount.palMeshes} pal meshes, ${mount.reads} reads, ${(mount.bytesRead / 1e6).toFixed(1)} MB read`);
      const found = await findMappings({ store: mappingsStore(), verify: x.verify, onStatus: (s) => say(describeStatus(s)) });
      for (const a of found.attempts) say(`  ${a.problem ? '✕' : '✓'} ${a.label}${a.problem ? `: ${a.problem}` : ''}`);
      say(found.ok ? `Mappings ready: ${found.mappings.label} (${(found.mappings.bytes.length / 1e6).toFixed(2)} MB)` : 'No mappings worked: the page would now ask for a file.');
    } catch (e) {
      say(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fullpage" style={{ display: 'grid', gap: 16, maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>Extractor bench</h1>
      <p>
        Pick <code>Pal-Windows.pak</code> (Steam: <code>steamapps/common/Palworld/Pal/Content/Paks</code>). Only its index is read.
      </p>
      <label>
        Game file{' '}
        <input type="file" accept=".pak" disabled={busy} data-testid="pak" onChange={(e) => e.target.files?.[0] && void run(e.target.files[0])} />
      </label>
      <ol aria-live="polite" data-testid="log" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', listStyle: 'none', padding: 0 }}>
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      {!busy && log.length > 0 && <p data-testid="done">Done.</p>}
    </main>
  );
}
