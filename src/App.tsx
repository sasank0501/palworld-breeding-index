import { lazy, Suspense, useEffect, useState } from 'react';

import Import from './routes/Import.tsx';
import Showcase from './routes/Showcase.tsx';
import { clearCurrentWorld, loadCurrentWorld, saveWorld } from './save/store.ts';
import type { WorldMeta } from './save/importWorld.ts';
import type { Roster } from './types.ts';

/**
 * The chibi review sandbox is a local-only tool and gitignored, so it may not
 * exist. import.meta.glob resolves to {} when the file is absent, which keeps a
 * fresh clone building. It is also dev only (a build made on a machine that has
 * the file must not ship the tool), and opens at #chibi.
 */
const reviewModule = import.meta.env.DEV
  ? Object.values(import.meta.glob<{ default: React.ComponentType }>('./routes/ChibiReview.tsx'))[0]
  : undefined;
const ChibiReview = reviewModule ? lazy(reviewModule) : null;

// Which browser APIs this page can use (src/lib/features.ts), so trying the dev
// server in another browser shows what will need a fallback there.
if (import.meta.env.DEV) {
  void import('./lib/features.ts').then(async ({ detectFeatures, describeFeatures }) => {
    console.table(describeFeatures(await detectFeatures()));
  });
}

type Load =
  | { state: 'loading' }
  | { state: 'import' }
  | { state: 'error'; message: string }
  | { state: 'ready'; roster: Roster; source: 'saved' | 'dev' | 'demo' };

/**
 * public/roster.json is produced by `npm run import-save` and is gitignored, so a
 * fresh clone or a deployed copy has none. The dev server answers a missing file
 * with index.html, so a body that fails to parse counts as missing too.
 */
const getRoster = async (file: string): Promise<Roster | null> => {
  const res = await fetch(`${import.meta.env.BASE_URL}${file}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try {
    return (await res.json()) as Roster;
  } catch {
    return null;
  }
};

export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // Which roster opens: the world imported in this browser last, then a local
    // roster.json (development), then the demo for the portfolio build, else the
    // import screen.
    (async () => {
      const saved = await loadCurrentWorld();
      if (saved) return { state: 'ready', roster: saved.roster, source: 'saved' } as const;
      const dev = await getRoster('roster.json');
      if (dev) return { state: 'ready', roster: dev, source: 'dev' } as const;
      if (import.meta.env.MODE === 'resume') {
        const demo = await getRoster('demo-roster.json');
        if (demo) return { state: 'ready', roster: demo, source: 'demo' } as const;
      }
      return { state: 'import' } as const;
    })()
      .then((next) => {
        if (!cancelled) setLoad(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openDemo = () => {
    getRoster('demo-roster.json')
      .then((demo) => setLoad(demo ? { state: 'ready', roster: demo, source: 'demo' } : { state: 'error', message: 'The demo save is missing from this copy of the site.' }))
      .catch((err: unknown) => setLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) }));
  };

  const imported = (roster: Roster, meta: WorldMeta | null) => {
    // Shown at once; storing it is a convenience for the next visit and may fail
    // (private windows), which only means importing again next time.
    void saveWorld({ roster, meta, importedAt: new Date().toISOString() });
    setLoad({ state: 'ready', roster, source: 'saved' });
  };

  const openAnother = () => {
    void clearCurrentWorld();
    setLoad({ state: 'import' });
  };

  if (load.state === 'loading') return <div className="fullpage">Reading roster…</div>;

  if (load.state === 'import') return <Import onRoster={imported} onDemo={openDemo} />;

  if (load.state === 'error') {
    return (
      <div className="fullpage">
        <div className="empty">
          <h1>Could not load the roster</h1>
          <p className="muted">{load.message}</p>
          <button type="button" onClick={openAnother}>
            Open a save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      {ChibiReview && location.hash === '#chibi' ? (
        <Suspense fallback={<div className="fullpage">Loading…</div>}>
          <ChibiReview />
        </Suspense>
      ) : (
        <Showcase roster={load.roster} />
      )}
      <footer className="legal">
        Unofficial fan project. Palworld and its characters, names and artwork are © Pocketpair, Inc.; not affiliated
        with or endorsed by Pocketpair.
        {/* Only the portfolio build ships game art (vite.config.ts), so only it says where the art came from. */}
        {import.meta.env.MODE === 'resume' &&
          ' Art shown is rendered from the author’s own copy of the game, for portfolio purposes.'}{' '}
        <button type="button" className="legal-link" onClick={openAnother}>
          {load.source === 'demo' ? 'Open your own save' : 'Open a different save'}
        </button>
      </footer>
    </div>
  );
}
