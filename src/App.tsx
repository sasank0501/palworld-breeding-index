import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import Import from './routes/Import.tsx';
import Showcase from './routes/Showcase.tsx';
import { BROWSE_ROSTER } from './lib/browse.ts';
import { ISSUES_URL } from './lib/links.ts';
import { current, goBack, navigate, onNavigate, parseRoute, type Route } from './lib/route.ts';
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

/** The extractor bench (Phase 6), dev only, at #extract: production builds drop it. */
const ExtractorTest = import.meta.env.DEV ? lazy(() => import('./routes/ExtractorTest.tsx')) : null;

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
  | { state: 'ready'; roster: Roster; source: 'saved' | 'dev' | 'demo' | 'browse'; justImported?: boolean; route?: Route };

/** A visit with no save may open the Paldex and its species pages (browse mode); anything else is the landing page. */
const browsable = (r: Route | null): r is Extract<Route, { screen: 'app' }> =>
  r?.screen === 'app' && r.section === 'dex' && (!r.page || r.page.kind === 'species');

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
  const loadNow = useRef(load);
  loadNow.current = load;

  useEffect(() => {
    let cancelled = false;
    // Which roster opens: the world imported in this browser last, then a local
    // roster.json (development), then the demo for the portfolio build, else the
    // import screen.
    // The address decides where in it: a page of the app, or (with no save) a species page to browse.
    const route = parseRoute(location.pathname);
    const at = route?.screen === 'app' ? route : undefined;
    (async (): Promise<Load> => {
      const saved = await loadCurrentWorld();
      if (saved) return { state: 'ready', roster: saved.roster, source: 'saved', route: at };
      const dev = await getRoster('roster.json');
      if (dev) return { state: 'ready', roster: dev, source: 'dev', route: at };
      if (import.meta.env.MODE === 'resume') {
        const demo = await getRoster('demo-roster.json');
        if (demo) return { state: 'ready', roster: demo, source: 'demo', route: at };
      }
      if (browsable(route)) return { state: 'ready', roster: BROWSE_ROSTER, source: 'browse', route };
      if (location.pathname !== '/') navigate('/', { replace: true });
      return { state: 'import' };
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

  // Back and Forward between the landing page and browsing with no save. (With a save the app's own
  // pages handle Back; the import screen handles leaving /upload.)
  useEffect(
    () =>
      onNavigate((pathname) => {
        const route = parseRoute(pathname);
        const l = loadNow.current;
        if (l.state === 'ready' && l.source === 'browse' && route?.screen !== 'app') setLoad({ state: 'import' });
        else if (l.state === 'import' && browsable(route)) setLoad({ state: 'ready', roster: BROWSE_ROSTER, source: 'browse', route });
      }),
    [],
  );

  /** Look around with no save (lib/browse.ts). Nothing is stored: a reload of /paldex browses again. */
  const browse = () => {
    navigate('/paldex');
    setLoad({ state: 'ready', roster: BROWSE_ROSTER, source: 'browse' });
  };

  const imported = (roster: Roster, meta: WorldMeta | null) => {
    // Shown at once; storing it is a convenience for the next visit and may fail
    // (private windows), which only means importing again next time.
    void saveWorld({ roster, meta, importedAt: new Date().toISOString() });
    const show = () => setLoad({ state: 'ready', roster, source: 'saved', justImported: true });
    // The import's own entry (/upload) is gone once it is done: the app takes the landing page's
    // place, so Back from the app doesn't land in a half-finished import.
    if (current().fromLanding) {
      goBack(() => {
        navigate('/paldex', { replace: true });
        show();
      });
    } else {
      navigate('/paldex', { replace: true });
      show();
    }
  };

  const openAnother = () => {
    void clearCurrentWorld();
    navigate('/');
    setLoad({ state: 'import' });
  };

  if (ExtractorTest && location.hash === '#extract') {
    return (
      <Suspense fallback={<div className="fullpage">Loading…</div>}>
        <ExtractorTest />
      </Suspense>
    );
  }

  if (load.state === 'loading') return <div className="fullpage">Reading roster…</div>;

  if (load.state === 'import') return <Import onRoster={imported} onBrowse={browse} />;

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

  // The disclaimer: a card on each visit (SiteNotice), then the footer at the end of the page.
  const disclaimer = (
    <>
      Unofficial fan project. Palworld and its characters, names and artwork are © Pocketpair, Inc.; not affiliated with
      or endorsed by Pocketpair. Typefaces are served from this site under the{' '}
      <a className="legal-link" href={`${import.meta.env.BASE_URL}font-licenses.txt`}>
        SIL Open Font License
      </a>
      .
      {import.meta.env.MODE !== 'resume' && (
        <>
          {' Found a problem? '}
          <a className="legal-link" href={ISSUES_URL}>
            Report it on GitHub
          </a>
          .
        </>
      )}
      {/* Only the portfolio build ships game art (vite.config.ts), so only it says where the art came from. */}
      {import.meta.env.MODE === 'resume' && (
        <>
          {' Art shown is rendered from the author’s own copy of the game, for portfolio purposes. Rights holders: '}
          <a className="legal-link" href="https://github.com/sasank0501/palworld-breeding-index/issues">
            open an issue
          </a>
          {' and anything you ask is taken down.'}
        </>
      )}
    </>
  );
  const footer = (
    <footer className="legal" id="site-footer">
      {disclaimer}{' '}
      <button type="button" className="legal-link" onClick={openAnother}>
        {load.source === 'demo' ? 'Open your own save' : load.source === 'browse' ? 'Upload a save' : 'Open a different save'}
      </button>
    </footer>
  );

  return (
    <div className="shell">
      {ChibiReview && location.hash === '#chibi' ? (
        <Suspense fallback={<div className="fullpage">Loading…</div>}>
          <ChibiReview />
          {footer}
        </Suspense>
      ) : (
        <Showcase
          roster={load.roster}
          onOpenSave={openAnother}
          justImported={load.justImported}
          notice={disclaimer}
          footer={footer}
          browse={load.source === 'browse'}
          initial={load.route}
        />
      )}
    </div>
  );
}
