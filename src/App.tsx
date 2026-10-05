import { lazy, Suspense, useEffect, useState } from 'react';

import Showcase from './routes/Showcase.tsx';
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

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; roster: Roster };

export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // roster.json is produced by `npm run import-save` and is gitignored, so a
    // fresh clone or a deployed copy has none. Those fall back to the demo
    // roster (scripts/make-demo-roster.mjs); with neither, 404 is a state.
    // The dev server answers a missing file with index.html, so a body that
    // fails to parse counts as missing too.
    const get = async (file: string): Promise<Roster | null> => {
      const res = await fetch(`${import.meta.env.BASE_URL}${file}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try {
        return (await res.json()) as Roster;
      } catch {
        return null;
      }
    };
    get('roster.json')
      .then(async (roster) => roster ?? (await get('demo-roster.json')))
      .then((roster) => {
        if (cancelled) return;
        setLoad(roster ? { state: 'ready', roster } : { state: 'missing' });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.state === 'loading') return <div className="fullpage">Reading roster…</div>;

  if (load.state === 'missing') {
    return (
      <div className="fullpage">
        <div className="empty">
          <h1>No roster imported yet</h1>
          <p>Read your Pal Box out of a local save file:</p>
          <pre>npm run import-save</pre>
          <p className="muted">
            Close Palworld first. The importer copies the save before reading it and never writes back. Use{' '}
            <code>npm run import-save -- --list</code> to pick a specific world.
          </p>
        </div>
      </div>
    );
  }

  if (load.state === 'error') {
    return (
      <div className="fullpage">
        <div className="empty">
          <h1>Could not load roster.json</h1>
          <p className="muted">{load.message}</p>
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
          ' Art shown is rendered from the author’s own copy of the game, for portfolio purposes.'}
      </footer>
    </div>
  );
}
