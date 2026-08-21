import { useEffect, useMemo, useState } from 'react';

import palsJson from '../data/pals.json';
import metaJson from '../data/meta.json';
import { expandRoute, solveReach, summariseOwned, type Combos, type Reach } from '../lib/breeding.ts';
import type { PalDex, Roster } from '../types.ts';

const DEX = palsJson as unknown as Record<string, PalDex>;
const META = metaJson as unknown as { unbreedable: string[]; gender: unknown[] };
const ALL_IDS = Object.keys(DEX);

const nameOf = (id: string): string => DEX[id]?.name ?? id;

export default function Gaps({ roster }: { roster: Roster }) {
  const [combos, setCombos] = useState<Combos | null>(null);
  const [depthFilter, setDepthFilter] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // combos.json is ~700 KB; keep it out of the initial bundle.
  useEffect(() => {
    let cancelled = false;
    import('../data/combos.json')
      .then((m) => {
        if (!cancelled) setCombos(m.default as unknown as Combos);
      })
      .catch(() => {
        if (!cancelled) setCombos({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const owned = useMemo(() => summariseOwned(roster.pals), [roster]);

  const reach: Reach | null = useMemo(() => {
    if (!combos) return null;
    return solveReach({ owned, combos, allIds: ALL_IDS, unbreedable: META.unbreedable });
  }, [combos, owned]);

  const groups = useMemo(() => {
    if (!reach) return null;
    const byDepth = new Map<number, string[]>();
    for (const [id, d] of reach.depth) {
      if (d === 0) continue;
      const list = byDepth.get(d) ?? [];
      list.push(id);
      byDepth.set(d, list);
    }
    for (const list of byDepth.values()) list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return byDepth;
  }, [reach]);

  if (!reach || !groups) return <div className="fullpage">Loading breeding matrix…</div>;

  const depths = [...groups.keys()].sort((a, b) => a - b);
  const ownedCount = owned.length;
  const totalGaps = [...groups.values()].reduce((n, l) => n + l.length, 0);

  const q = query.trim().toLowerCase();
  const visible = depths
    .filter((d) => depthFilter === 'all' || d === depthFilter)
    .map((d) => ({ depth: d, ids: (groups.get(d) ?? []).filter((id) => !q || nameOf(id).toLowerCase().includes(q)) }))
    .filter((g) => g.ids.length > 0);

  return (
    <div className="app">
      <div className="summary">
        <Tile label="Owned" value={ownedCount} sub={`of ${ALL_IDS.length} species`} tone="good" />
        {depths.map((d) => (
          <Tile key={d} label={`${d} step${d > 1 ? 's' : ''} away`} value={(groups.get(d) ?? []).length} tone="accent" />
        ))}
        <Tile label="Unreachable" value={reach.unreachable.length} sub="no chain exists" tone="bad" />
        <Tile label="Unbreedable" value={META.unbreedable.length} sub="cannot be bred at all" tone="muted" />
        <Tile label="Missing a mate" value={reach.missingMate.length} sub="own one gender only" tone="warn" />
      </div>

      <div className="controls">
        <input
          className="search"
          placeholder="Search a target Pal…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className={depthFilter === 'all' ? 'pill on' : 'pill'} onClick={() => setDepthFilter('all')}>
          All {totalGaps}
        </button>
        {depths.map((d) => (
          <button
            key={d}
            className={depthFilter === d ? 'pill on' : 'pill'}
            onClick={() => setDepthFilter(d)}
          >
            {d} step{d > 1 ? 's' : ''} ({(groups.get(d) ?? []).length})
          </button>
        ))}
      </div>

      <div className="scroll">
        {visible.map((g) => (
          <section key={g.depth} className="depth-block">
            <h2 className="depth-head">
              {g.depth} breeding step{g.depth > 1 ? 's' : ''} away <span className="muted">· {g.ids.length}</span>
            </h2>
            <div className="gap-list">
              {g.ids.map((id) => (
                <GapRow
                  key={id}
                  id={id}
                  reach={reach}
                  open={expanded === id}
                  onToggle={() => setExpanded(expanded === id ? null : id)}
                />
              ))}
            </div>
          </section>
        ))}

        {visible.length === 0 && <p className="nothing">Nothing matches.</p>}

        {reach.unreachable.length > 0 && depthFilter === 'all' && !q && (
          <section className="depth-block">
            <h2 className="depth-head">
              Unreachable <span className="muted">· no chain from your roster</span>
            </h2>
            <div className="gap-list">
              {reach.unreachable.map((id) => (
                <div key={id} className="gap unreachable">
                  <Portrait id={id} />
                  <div className="gap-body">
                    <strong>{nameOf(id)}</strong>
                    <span className="muted">needs a parent species you do not own</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {reach.missingMate.length > 0 && depthFilter === 'all' && !q && (
          <section className="depth-block">
            <h2 className="depth-head">
              Missing a mate <span className="muted">· {reach.missingMate.length} species, one gender only</span>
            </h2>
            <p className="muted note">
              These cannot be paired with themselves. Catching or hatching the opposite gender may unlock further
              targets.
            </p>
            <div className="gap-list compact">
              {reach.missingMate
                .slice()
                .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
                .map((id) => {
                  const o = owned.find((x) => x.palId === id);
                  return (
                    <div key={id} className="gap tight">
                      <Portrait id={id} small />
                      <div className="gap-body">
                        <strong>{nameOf(id)}</strong>
                        <span className="muted">
                          {o?.count ?? 0}× · {o?.male ? 'male only' : 'female only'}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: 'good' | 'bad' | 'accent' | 'muted' | 'warn';
}) {
  return (
    <div className={`tile tone-${tone}`}>
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

function Portrait({ id, small }: { id: string; small?: boolean }) {
  const dex = DEX[id];
  const [failed, setFailed] = useState(false);
  return (
    <span className={small ? 'thumb small' : 'thumb'}>
      {dex?.img && !failed ? (
        <img src={`/${dex.img}`} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-fallback">{nameOf(id).slice(0, 2)}</span>
      )}
    </span>
  );
}

function GapRow({
  id,
  reach,
  open,
  onToggle,
}: {
  id: string;
  reach: Reach;
  open: boolean;
  onToggle: () => void;
}) {
  const pair = reach.recipe.get(id);
  const route = useMemo(() => expandRoute(id, reach), [id, reach]);
  const multiStep = route.length > 1;

  return (
    <div className={`gap${open ? ' open' : ''}`}>
      <Portrait id={id} />
      <div className="gap-body">
        <div className="gap-title">
          <strong>{nameOf(id)}</strong>
          {DEX[id]?.types.map((t) => (
            <span key={t} className={`type t-${t}`}>
              {t}
            </span>
          ))}
        </div>
        {pair && (
          <div className="recipe">
            <span className="parent">{nameOf(pair[0])}</span>
            <span className="times">×</span>
            <span className="parent">{nameOf(pair[1])}</span>
          </div>
        )}
        {multiStep && (
          <button className="route-toggle" onClick={onToggle}>
            {open ? 'Hide' : `Show full route (${route.length} steps)`}
          </button>
        )}
        {open && (
          <ol className="route">
            {route.map((s, i) => (
              <li key={`${s.child}-${i}`}>
                <span className="parent">{nameOf(s.parents[0])}</span>
                <span className="times">×</span>
                <span className="parent">{nameOf(s.parents[1])}</span>
                <span className="arrow">→</span>
                <strong>{nameOf(s.child)}</strong>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
