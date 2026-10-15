import { useEffect, useRef, useState } from 'react';

import { back as historyBack, current, navigate, onNavigate, parseRoute, titleFor } from '../lib/route.ts';
import type { Roster } from '../types.ts';
import type { WorldMeta } from '../save/importWorld.ts';
import type { FromWorker, ToWorker, WorldSummary } from '../save/import.worker.ts';
import { pickSaveFolder } from '../save/pick.ts';
import { useSkin } from './showcase/skins.ts';
import { ImportBackdrop } from './ImportBackdrop.tsx';
import { Landing } from './home/Landing.tsx';
import '../design/showcase.css';
import '../design/import.css';

/**
 * The public site's front door. A visitor with no save in this browser first sees
 * the landing page (home/Landing.tsx): what PalDoc is, a tour of its pages, and
 * "Upload save", which explains where the save folder is and asks for it. From the
 * moment a folder is chosen this screen takes over with the import itself: looking
 * for worlds, choosing one, reading it, or what went wrong. Everything is read in a
 * worker on this machine; nothing is uploaded.
 */
type Stage =
  | { kind: 'intro' }
  | { kind: 'scanning' }
  | { kind: 'worlds'; worlds: WorldSummary[]; missingGlobal: boolean }
  | { kind: 'importing'; world: WorldSummary; step: string }
  | { kind: 'error'; message: string };

const HINTS: Record<string, string> = {
  empty: 'That folder is empty. Choose the SaveGames folder, or the folder with your Steam id inside it.',
  'no-level': 'No Palworld world is in that folder. A world folder holds a file called Level.sav. Choose the SaveGames folder and the worlds are found for you.',
  xbox: 'This is an Xbox or Game Pass save folder, but no world could be read from it. Close Palworld and the Xbox app, then choose the whole wgs folder.',
};

const ago = (ms: number): string => {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'played today';
  if (days === 1) return 'played yesterday';
  if (days < 60) return `played ${days} days ago`;
  return `played ${new Date(ms).toLocaleDateString()}`;
};

const describe = (m: WorldMeta | null): string =>
  m ? [m.host, m.level != null ? `level ${m.level}` : null, m.day != null ? `day ${m.day}` : null].filter(Boolean).join(' · ') : '';

export default function Import({
  onRoster,
  onBrowse,
}: {
  onRoster: (roster: Roster, meta: WorldMeta | null) => void;
  /** Open the Paldex with no save (lib/browse.ts). */
  onBrowse: () => void;
}) {
  const [skin, setSkin] = useSkin();
  const [stage, setStage] = useState<Stage>({ kind: 'intro' });
  const worker = useRef<Worker | null>(null);
  const focusTarget = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  // The import has its own address (/upload). Back from it returns to the landing page and stops
  // whatever the importer was doing.
  const toStart = (): void => {
    worker.current?.terminate();
    worker.current = null;
    setStage({ kind: 'intro' });
  };
  useEffect(
    () =>
      onNavigate((pathname) => {
        if (parseRoute(pathname)?.screen === 'home') toStart();
      }),
    [],
  );
  useEffect(() => {
    document.title = stage.kind === 'intro' ? 'PalDoc' : titleFor(['Open your save']);
  }, [stage.kind]);

  // Each new stage moves keyboard and screen-reader focus to its heading.
  useEffect(() => {
    if (stage.kind !== 'intro') focusTarget.current?.focus();
  }, [stage.kind]);

  const send = (m: ToWorker) => worker.current?.postMessage(m);

  const ensureWorker = (): Worker => {
    if (worker.current) return worker.current;
    const w = new Worker(new URL('../save/import.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'worlds') {
        if (!m.worlds.length) setStage({ kind: 'error', message: HINTS[m.hint ?? 'no-level'] ?? HINTS['no-level'] });
        else if (m.worlds.length === 1 && !m.missingGlobal) startImport(m.worlds[0]);
        else setStage({ kind: 'worlds', worlds: m.worlds, missingGlobal: m.missingGlobal });
      } else if (m.type === 'progress') {
        setStage((s) => (s.kind === 'importing' ? { ...s, step: m.step } : s));
      } else if (m.type === 'done') {
        onRoster(m.roster, m.meta);
      } else if (m.type === 'error') {
        setStage({ kind: 'error', message: m.message });
      }
    };
    w.onerror = () => setStage({ kind: 'error', message: 'The importer stopped unexpectedly. Reload the page and try again.' });
    worker.current = w;
    return w;
  };

  const startImport = (world: WorldSummary) => {
    setStage({ kind: 'importing', world, step: 'Starting' });
    send({ type: 'import', id: world.id });
  };

  const choose = async () => {
    const files = await pickSaveFolder();
    if (!files) return;
    ensureWorker();
    if (location.pathname !== '/upload') navigate('/upload', { fromLanding: true });
    setStage({ kind: 'scanning' });
    send({ type: 'scan', files });
  };

  if (stage.kind === 'intro') return <Landing skin={skin} onSkin={setSkin} onChoose={choose} onBrowse={onBrowse} />;

  return (
    <div className="sc-shell imp-shell" data-skin={skin}>
      <main className="imp" aria-labelledby="imp-title">
        <header className="imp-head">
          <p className="imp-kicker">PalDoc</p>
          <h1 id="imp-title">Open your Palworld save</h1>
        </header>

        {stage.kind === 'scanning' && (
          <section className="imp-status" aria-live="polite">
            <h2 ref={focusTarget} tabIndex={-1}>Looking for worlds…</h2>
          </section>
        )}

        {stage.kind === 'worlds' && (
          <section aria-labelledby="imp-worlds">
            <h2 id="imp-worlds" ref={focusTarget} tabIndex={-1}>
              Choose a world
            </h2>
            {stage.missingGlobal && (
              <p className="imp-note">
                You chose a world folder, so pals in the global Palbox are left out. To include them, choose the folder one level up.
              </p>
            )}
            <ul className="imp-worlds">
              {stage.worlds.map((w) => (
                <li key={w.id}>
                  <button type="button" className="imp-world" onClick={() => startImport(w)}>
                    <span className="imp-world-name">{w.meta?.name ?? 'Unnamed world'}</span>
                    <span className="imp-world-meta">{[describe(w.meta), ago(w.lastPlayed)].filter(Boolean).join(' · ')}</span>
                    <span className="imp-world-id" aria-hidden="true">
                      {w.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {stage.kind === 'importing' && (
          <section className="imp-status">
            <h2 ref={focusTarget} tabIndex={-1}>
              Reading {stage.world.meta?.name ?? 'your world'}
            </h2>
            <p aria-live="polite">{stage.step}…</p>
            <div className="imp-bar" aria-hidden="true">
              <span />
            </div>
          </section>
        )}

        {stage.kind === 'error' && (
          <section className="imp-status imp-error" role="alert">
            <h2 ref={focusTarget} tabIndex={-1}>
              That didn't work
            </h2>
            <p>{stage.message}</p>
          </section>
        )}

        {stage.kind !== 'scanning' && stage.kind !== 'importing' && (
          <div className="imp-actions">
            <button type="button" className="sc-btn" onClick={choose}>
              Choose a different folder
            </button>
            <button
              type="button"
              className="sc-btn ghost"
              onClick={() => {
                if (current().fromLanding) historyBack();
                else {
                  navigate('/', { replace: true });
                  toStart();
                }
              }}
            >
              Back to the start
            </button>
          </div>
        )}
      </main>
      {/* After the card: the rows are fixed behind it anyway, and on a phone the Pause button flows below it. */}
      <ImportBackdrop />
    </div>
  );
}
