import { useEffect, useMemo, useState } from 'react';

import palsJson from '../data/pals.json';
import metaJson from '../data/meta.json';
import passivesJson from '../data/passives.json';
import type { Combos } from '../lib/breeding.ts';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  PRESETS,
  categorise,
  isNegative,
  type Category,
} from '../lib/passiveCategories.ts';
import {
  MAX_PASSIVES,
  flattenPlan,
  nodePool,
  solvePassivePlan,
  type PlanNode,
  type PlannerPal,
  type SolveResult,
} from '../lib/passivePlan.ts';
import type { PalDex, PassiveInfo, Roster } from '../types.ts';

const DEX = palsJson as unknown as Record<string, PalDex>;
const PASSIVES = passivesJson as unknown as Record<string, PassiveInfo>;
const META = metaJson as unknown as { unbreedable: string[] };
const UNBREEDABLE = new Set(META.unbreedable);

const nameOf = (id: string): string => DEX[id]?.name ?? id;
const passiveLabel = (id: string): string => PASSIVES[id]?.name ?? id;

function passiveTitle(id: string): string {
  const info = PASSIVES[id];
  if (!info?.name) return id;
  return info.effects.length ? `${info.name} — ${info.effects.join(', ')}` : info.name;
}

export default function PassivePlanner({ roster }: { roster: Roster }) {
  const [combos, setCombos] = useState<Combos | null>(null);
  const [target, setTarget] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [speciesQuery, setSpeciesQuery] = useState('');

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

  const owned: PlannerPal[] = useMemo(
    () =>
      roster.pals
        .filter((p) => p.palId)
        .map((p) => ({
          instanceId: p.instanceId,
          palId: p.palId as string,
          gender: p.gender,
          passives: p.passives,
          nickname: p.nickname,
          level: p.level,
          location: p.location.kind,
        })),
    [roster],
  );

  /** Carrier counts drive both the "you own N" hint and the scarcity warning. */
  const carriers = useMemo(() => {
    const m = new Map<string, PlannerPal[]>();
    for (const p of owned) {
      for (const s of p.passives) {
        const list = m.get(s);
        if (list) list.push(p);
        else m.set(s, [p]);
      }
    }
    return m;
  }, [owned]);

  const byCategory = useMemo(() => {
    const m = new Map<Category, string[]>();
    for (const [id, info] of Object.entries(PASSIVES)) {
      const c = categorise(info);
      if (!c) continue;
      const list = m.get(c);
      if (list) list.push(id);
      else m.set(c, [id]);
    }
    // Owned first, then by carrier count — the practical ordering.
    for (const list of m.values()) {
      list.sort((a, b) => (carriers.get(b)?.length ?? 0) - (carriers.get(a)?.length ?? 0) || passiveLabel(a).localeCompare(passiveLabel(b)));
    }
    return m;
  }, [carriers]);

  const speciesOptions = useMemo(() => {
    const q = speciesQuery.trim().toLowerCase();
    return Object.values(DEX)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [speciesQuery]);

  const toggle = (id: string): void => {
    setResult(null);
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_PASSIVES ? cur : [...cur, id],
    );
  };

  const applyPreset = (ids: string[]): void => {
    setResult(null);
    // Presets list best-first; keep the ones you actually own, up to the cap.
    setPicked(ids.filter((id) => carriers.has(id)).slice(0, MAX_PASSIVES));
  };

  const canSolve = combos !== null && target !== '' && picked.length > 0 && !UNBREEDABLE.has(target);

  const solve = (): void => {
    if (!combos || !canSolve) return;
    setSolving(true);
    setResult(null);
    // Yield a frame so "Solving…" paints before the search blocks the thread.
    setTimeout(() => {
      const r = solvePassivePlan({
        target,
        want: picked,
        owned,
        combos,
        unbreedable: META.unbreedable,
      });
      setResult(r);
      setSolving(false);
    }, 16);
  };

  if (!combos) return <div className="fullpage">Loading breeding matrix…</div>;

  return (
    <div className="app">
      <div className="planner">
        <section className="panel">
          <h2 className="panel-head">1 · Target Pal</h2>
          <input
            className="search"
            placeholder="Filter species…"
            value={speciesQuery}
            onChange={(e) => setSpeciesQuery(e.target.value)}
          />
          <select
            className="species-select"
            size={8}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setResult(null);
            }}
          >
            {speciesOptions.map((p) => (
              <option key={p.id} value={p.id} disabled={UNBREEDABLE.has(p.id)}>
                {p.name}
                {UNBREEDABLE.has(p.id) ? ' — cannot be bred' : ''}
              </option>
            ))}
          </select>
          {target && UNBREEDABLE.has(target) && (
            <p className="warn-line">This species cannot be bred, so it can never receive passives.</p>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-head">
            2 · Passives <span className="muted">{picked.length}/{MAX_PASSIVES}</span>
          </h2>

          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} className="pill" onClick={() => applyPreset(p.passives)} title={p.blurb}>
                {p.label}
              </button>
            ))}
            {picked.length > 0 && (
              <button className="pill ghost" onClick={() => { setPicked([]); setResult(null); }}>
                Clear
              </button>
            )}
          </div>

          <div className="picker">
            {CATEGORY_ORDER.map((cat) => {
              const list = byCategory.get(cat) ?? [];
              if (!list.length) return null;
              return (
                <div key={cat} className="picker-group">
                  <h3>{CATEGORY_LABELS[cat]}</h3>
                  <div className="chips">
                    {list.map((id) => {
                      const n = carriers.get(id)?.length ?? 0;
                      const on = picked.includes(id);
                      const full = !on && picked.length >= MAX_PASSIVES;
                      return (
                        <button
                          key={id}
                          className={`chip pick${on ? ' on' : ''}${n === 0 ? ' unowned' : ''}`}
                          disabled={n === 0 || full}
                          onClick={() => toggle(id)}
                          title={
                            n === 0
                              ? `${passiveTitle(id)} — no Pal in your box carries this`
                              : `${passiveTitle(id)} — ${n} in your box`
                          }
                        >
                          {passiveLabel(id)}
                          {n > 0 && <span className="count-badge">{n}</span>}
                          {isNegative(PASSIVES[id]) && <span className="neg-dot" title="debuff">▾</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-head">3 · Plan</h2>
          <button className="solve-btn" disabled={!canSolve || solving} onClick={solve}>
            {solving ? 'Solving…' : 'Find breeding chain'}
          </button>
          {!canSolve && !solving && (
            <p className="muted small">Pick a target species and at least one passive.</p>
          )}
          <p className="muted small">
            Inheritance is random — this finds a chain that <em>can</em> work, then you re-roll each step
            until it lands. Pool size shows how diluted each step is.
          </p>
        </section>
      </div>

      <div className="scroll">
        {result && !result.ok && (
          <div className="empty-result">
            <strong>{result.reason}</strong>
            {result.blocking?.length ? (
              <p className="muted">Blocked by: {result.blocking.map(passiveLabel).join(', ')}</p>
            ) : null}
          </div>
        )}

        {result?.ok && <PlanView plan={result.plan} carriers={carriers} target={target} />}
      </div>
    </div>
  );
}

function PlanView({
  plan,
  carriers,
  target,
}: {
  plan: { root: PlanNode; steps: number; contamination: number };
  carriers: Map<string, PlannerPal[]>;
  target: string;
}) {
  const steps = flattenPlan(plan.root);

  if (steps.length === 0) {
    const seed = plan.root;
    return (
      <div className="empty-result good">
        <strong>No breeding needed.</strong>
        {seed.kind === 'seed' && (
          <p className="muted">
            {seed.pal.nickname ? `“${seed.pal.nickname}” ` : ''}
            {nameOf(seed.species)} in your {seed.pal.location} already has {seed.need.map(passiveLabel).join(', ')}.
          </p>
        )}
      </div>
    );
  }

  // A seed that is the sole carrier of one of its passives is a real risk.
  const scarce: string[] = [];
  const walk = (n: PlanNode): void => {
    if (n.kind === 'seed') {
      for (const s of n.need) if ((carriers.get(s)?.length ?? 0) === 1) scarce.push(s);
      return;
    }
    walk(n.parents[0]);
    walk(n.parents[1]);
  };
  walk(plan.root);

  return (
    <>
      <div className="plan-summary">
        <span className="tile-inline">
          <strong>{plan.steps}</strong> breeding step{plan.steps === 1 ? '' : 's'}
        </span>
        <span className="tile-inline">
          to <strong>{nameOf(target)}</strong>
        </span>
        {plan.contamination === 0 ? (
          <span className="badge clean">clean pools throughout</span>
        ) : (
          <span className="badge diluted">{plan.contamination} extra passive(s) in the pools</span>
        )}
      </div>

      {scarce.length > 0 && (
        <p className="warn-line">
          Heads up: {[...new Set(scarce)].map(passiveLabel).join(', ')} — you own only one carrier. If it is
          lost or its passives change, this plan breaks.
        </p>
      )}

      <ol className="steps">
        {steps.map((s, i) => (
          <li key={`${s.species}-${i}`} className="step">
            <div className="step-n">{i + 1}</div>
            <div className="step-body">
              <div className="pairing">
                <ParentChip node={s.parents[0]} />
                <span className="times">×</span>
                <ParentChip node={s.parents[1]} />
                <span className="arrow">→</span>
                <span className="child">{nameOf(s.species)}</span>
              </div>
              <div className="carries">
                {s.need.map((id) => (
                  <span key={id} className="chip tier-3" title={passiveTitle(id)}>
                    {passiveLabel(id)}
                  </span>
                ))}
                <span className={`badge ${s.poolSize === s.need.length ? 'clean' : 'diluted'}`}>
                  want {s.need.length} of {s.poolSize} in pool
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function ParentChip({ node }: { node: PlanNode }) {
  if (node.kind === 'breed') {
    return (
      <span className="parent bred" title="produced by an earlier step">
        {nameOf(node.species)} <span className="muted">(from step)</span>
      </span>
    );
  }
  const extra = [...nodePool(node)].filter((s) => !node.need.includes(s));
  return (
    <span className="parent seed">
      <span className={`gender ${node.pal.gender ?? ''}`}>
        {node.pal.gender === 'male' ? '♂' : node.pal.gender === 'female' ? '♀' : '?'}
      </span>{' '}
      {nameOf(node.species)}
      {node.pal.nickname ? <span className="muted"> “{node.pal.nickname}”</span> : null}
      <span className="muted">
        {' '}
        · {node.pal.location}
        {node.candidates.length > 1 ? ` · ${node.candidates.length} to choose from` : ''}
        {extra.length ? ` · carries ${extra.length} extra` : ''}
      </span>
    </span>
  );
}
