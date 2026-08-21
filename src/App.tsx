import { useEffect, useState } from 'react';

import Gaps from './routes/Gaps.tsx';
import PalBox from './routes/PalBox.tsx';
import PassivePlanner from './routes/PassivePlanner.tsx';
import type { Roster } from './types.ts';

type Tab = 'box' | 'gaps' | 'planner';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; roster: Roster };

export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTab] = useState<Tab>('box');

  useEffect(() => {
    let cancelled = false;
    // roster.json is produced by `npm run import-save` and is gitignored, so a
    // fresh clone legitimately has no file here — 404 is a state, not a failure.
    fetch(`${import.meta.env.BASE_URL}roster.json`)
      .then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Roster>;
      })
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
        <span className="tabs-meta muted">
          {load.roster.counts.total} pals · world {load.roster.world.slice(0, 8)}
        </span>
      </nav>
      {tab === 'box' && <PalBox roster={load.roster} />}
      {tab === 'gaps' && <Gaps roster={load.roster} />}
      {tab === 'planner' && <PassivePlanner roster={load.roster} />}
    </div>
  );
}
