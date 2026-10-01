import { lazy, Suspense, useEffect, useState } from 'react';

import Gaps from './routes/Gaps.tsx';
import PalBox from './routes/PalBox.tsx';
import PassivePlanner from './routes/PassivePlanner.tsx';
import type { Roster } from './types.ts';

type Tab = 'box' | 'gaps' | 'planner' | 'chibi';

/**
 * The chibi review sandbox is a local-only tool and gitignored, so it may not
 * exist. import.meta.glob resolves to {} when the file is absent, which keeps a
 * fresh clone building; the tab only appears where the file does.
 */
const reviewModule = Object.values(import.meta.glob<{ default: React.ComponentType }>('./routes/ChibiReview.tsx'))[0];
const ChibiReview = reviewModule ? lazy(reviewModule) : null;

/** null = follow the OS. Only an explicit choice is written to the document. */
type Theme = 'light' | 'dark' | null;

const THEME_KEY = 'palworld-theme';

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null; // private mode / storage disabled — fall back to the OS
  }
}

/**
 * Theme is a three-state thing pretending to be a switch: light, dark, or
 * whatever the OS says. Leaving `data-theme` off in the third case is what lets
 * the CSS media query keep working, so a user who never touches the button
 * follows their system for the rest of the session too.
 */
function useTheme(): { theme: Theme; dark: boolean; setTheme: (next: Theme) => void } {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    try {
      if (theme) localStorage.setItem(THEME_KEY, theme);
      else localStorage.removeItem(THEME_KEY);
    } catch {
      /* not worth failing a render over */
    }
  }, [theme]);

  // Tracked so the button's label stays honest if the OS flips mid-session; the
  // CSS follows on its own.
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return { theme, dark: theme === 'dark' || (theme === null && systemDark), setTheme };
}

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; roster: Roster };

export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTab] = useState<Tab>('box');
  // Held here, not in the button, so the choice applies to the empty and error
  // screens too — they render before any nav exists.
  const { theme, dark, setTheme } = useTheme();

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
      <nav className="tabs">
        <button className={tab === 'box' ? 'tab on' : 'tab'} onClick={() => setTab('box')}>
          Pal Box
        </button>
        <button className={tab === 'gaps' ? 'tab on' : 'tab'} onClick={() => setTab('gaps')}>
          Breeding gaps
        </button>
        <button className={tab === 'planner' ? 'tab on' : 'tab'} onClick={() => setTab('planner')}>
          Passive planner
        </button>
        {ChibiReview && (
          <button className={tab === 'chibi' ? 'tab on' : 'tab'} onClick={() => setTab('chibi')}>
            Chibi review
          </button>
        )}
        <span className="tabs-meta muted">
          {load.roster.demo
            ? `${load.roster.counts.total} pals · demo save`
            : `${load.roster.counts.total} pals · world ${load.roster.world.slice(0, 8)}`}
        </span>
        <button
          className="theme-toggle"
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          title={theme === null ? 'Following your system theme' : `Using the ${theme} theme`}
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
          {dark ? 'Light' : 'Dark'}
        </button>
      </nav>
      {tab === 'box' && <PalBox roster={load.roster} />}
      {tab === 'gaps' && <Gaps roster={load.roster} />}
      {tab === 'planner' && <PassivePlanner roster={load.roster} />}
      {tab === 'chibi' && ChibiReview && (
        <Suspense fallback={<div className="fullpage">Loading…</div>}>
          <ChibiReview />
        </Suspense>
      )}
    </div>
  );
}
