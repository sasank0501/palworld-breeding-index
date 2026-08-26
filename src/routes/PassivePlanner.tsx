import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import palsJson from '../data/pals.json';
import metaJson from '../data/meta.json';
import passivesJson from '../data/passives.json';
import { RankMark } from '../components/RankMark.tsx';
import type { Combos } from '../lib/breeding.ts';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  PRESETS,
  RANK_LABELS,
  RANK_ORDER,
  categorise,
  rankClass,
  rankOf,
  rankSort,
  type Rank,
} from '../lib/passiveCategories.ts';
import {
  MAX_PASSIVES,
  flattenPlan,
  solvePassivePlan,
  type BreedNode,
  type PlanNode,
  type PlannerPal,
  type SolveResult,
} from '../lib/passivePlan.ts';
import type { PalDex, PassiveInfo, Roster, RosterPal } from '../types.ts';

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
  const [groupBy, setGroupBy] = useState<'rank' | 'purpose'>('rank');

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

  // The planner works on the trimmed PlannerPal; the step cards want the full
  // record (IVs, rank, alpha) so a parent reads like a Pal Box card.
  const byInstance = useMemo(
    () => new Map(roster.pals.map((p) => [p.instanceId, p])),
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

  /** Rank per id, resolved once: it drives the grouping, the sort and the plate. */
  const rankById = useMemo(() => {
    const m = new Map<string, Rank | null>();
    for (const [id, info] of Object.entries(PASSIVES)) m.set(id, rankOf(id, info));
    return m;
  }, []);

  /**
   * Grouped headings for the picker. Rank is the default because it is how the
   * game and paldb both present passives — the plate colour you are looking at
   * *is* the group. Purpose stays a click away for "build me a worker".
   */
  const groups = useMemo(() => {
    const buckets = new Map<string, string[]>();
    const push = (key: string, id: string): void => {
      const list = buckets.get(key);
      if (list) list.push(id);
      else buckets.set(key, [id]);
    };

    for (const [id, info] of Object.entries(PASSIVES)) {
      if (groupBy === 'rank') {
        // Unranked ids still get a bucket rather than vanishing from the picker.
        push(String(rankById.get(id) ?? 'unknown'), id);
      } else {
        const c = categorise(info);
        if (c) push(c, id);
      }
    }

    // Owned first — a passive nothing in your box carries cannot start a chain,
    // so it belongs at the bottom whatever its rank. Then by rank, which walks
    // each group from 5 down through the debuffs, and only then by carrier count
    // as the tie-break.
    for (const list of buckets.values()) {
      list.sort(
        (a, b) =>
          Number((carriers.get(b)?.length ?? 0) > 0) - Number((carriers.get(a)?.length ?? 0) > 0) ||
          rankSort(rankById.get(b) ?? null) - rankSort(rankById.get(a) ?? null) ||
          (carriers.get(b)?.length ?? 0) - (carriers.get(a)?.length ?? 0) ||
          passiveLabel(a).localeCompare(passiveLabel(b)),
      );
    }

    const order: Array<{ key: string; label: string }> =
      groupBy === 'rank'
        ? [
            ...RANK_ORDER.map((r) => ({ key: String(r), label: RANK_LABELS[r] })),
            { key: 'unknown', label: 'Unverified' },
          ]
        : CATEGORY_ORDER.map((c) => ({ key: c, label: CATEGORY_LABELS[c] }));

    return order
      .map(({ key, label }) => ({ key, label, ids: buckets.get(key) ?? [] }))
      .filter((g) => g.ids.length > 0);
  }, [carriers, groupBy, rankById]);

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
    <div className="app planner-app">
      <div className="planner">
        <section className="panel panel-target">
          <h2 className="panel-head">1 · Target Pal</h2>
          <TargetHero id={target} />
          <SpeciesCombo
            value={target}
            options={speciesOptions}
            query={speciesQuery}
            onQuery={setSpeciesQuery}
            onPick={(id) => {
              setTarget(id);
              setResult(null);
            }}
          />
          {target && UNBREEDABLE.has(target) && (
            <p className="warn-line">This species cannot be bred, so it can never receive passives.</p>
          )}
        </section>

        <section className="panel panel-passives">
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

          <div className="group-by" role="group" aria-label="Group passives by">
            <span className="group-by-label muted">Group by</span>
            <button
              className={groupBy === 'rank' ? 'seg on' : 'seg'}
              aria-pressed={groupBy === 'rank'}
              onClick={() => setGroupBy('rank')}
            >
              Rank
            </button>
            <button
              className={groupBy === 'purpose' ? 'seg on' : 'seg'}
              aria-pressed={groupBy === 'purpose'}
              onClick={() => setGroupBy('purpose')}
            >
              Purpose
            </button>
          </div>

          <div className="picker">
            {groups.map((group) => (
              <div key={group.key} className="picker-group">
                <h3>
                  {group.label} <span className="group-count">{group.ids.length}</span>
                </h3>
                <div className="chips">
                  {group.ids.map((id) => {
                    const n = carriers.get(id)?.length ?? 0;
                    const on = picked.includes(id);
                    const full = !on && picked.length >= MAX_PASSIVES;
                    const rank = rankById.get(id) ?? null;
                    return (
                      <button
                        key={id}
                        className={`chip pick ${rankClass(rank)}${on ? ' on' : ''}${n === 0 ? ' unowned' : ''}`}
                        disabled={n === 0 || full}
                        onClick={() => toggle(id)}
                        title={
                          n === 0
                            ? `${passiveTitle(id)} — no Pal in your box carries this`
                            : `${passiveTitle(id)} — ${n} in your box`
                        }
                      >
                        <span className="chip-label">{passiveLabel(id)}</span>
                        {n > 0 && <span className="count-badge">{n}</span>}
                        <RankMark rank={rank} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-plan">
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
        {/* This half of the screen is always on show now, so it needs something
            to say before the first solve rather than sitting blank. */}
        {!result && !solving && (
          <div className="empty-result">
            <strong>No plan yet</strong>
            <p className="muted">
              {target
                ? picked.length
                  ? `Hit “Find breeding chain” to route ${nameOf(target)}.`
                  : 'Pick the passives you want it to end up with.'
                : 'Pick a target species to start.'}
            </p>
          </div>
        )}

        {solving && (
          <div className="empty-result">
            <strong>Solving…</strong>
          </div>
        )}

        {result && !result.ok && (
          <div className="empty-result">
            <strong>{result.reason}</strong>
            {result.blocking?.length ? (
              <p className="muted">Blocked by: {result.blocking.map(passiveLabel).join(', ')}</p>
            ) : null}
          </div>
        )}

        {result?.ok && (
          <PlanView plan={result.plan} carriers={carriers} target={target} byInstance={byInstance} />
        )}
      </div>
    </div>
  );
}

function PlanView({
  plan,
  carriers,
  target,
  byInstance,
}: {
  plan: { root: PlanNode; steps: number; contamination: number };
  carriers: Map<string, PlannerPal[]>;
  target: string;
  byInstance: Map<string, RosterPal>;
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
            <div className="step-head">
              <span className="step-n">{i + 1}</span>
              <span className="step-title">
                Breed <strong>{nameOf(s.species)}</strong>
              </span>
              <span className={`badge ${s.poolSize === s.need.length ? 'clean' : 'diluted'}`}>
                want {s.need.length} of {s.poolSize} in pool
              </span>
            </div>
            <div className="pairing">
              <ParentCard node={s.parents[0]} steps={steps} byInstance={byInstance} />
              <span className="times">×</span>
              <ParentCard node={s.parents[1]} steps={steps} byInstance={byInstance} />
              <span className="arrow">→</span>
              <ChildCard species={s.species} need={s.need} final={i === steps.length - 1} />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Square art box, matching the Pal Box card portraits. */
function Portrait({ id, size, badge }: { id: string | null; size: 'sm' | 'md' | 'lg'; badge?: ReactNode }) {
  const dex = id ? DEX[id] : undefined;
  const [failed, setFailed] = useState(false);
  // Rows are recycled as the dropdown filters, so a stale failure must not
  // blank out the next species to land in this slot.
  useEffect(() => setFailed(false), [id]);

  return (
    <div className={`portrait portrait-${size}`}>
      {dex?.img && !failed ? (
        <img src={`/${dex.img}`} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="portrait-fallback">{dex ? dex.name.slice(0, 2) : '?'}</span>
      )}
      {badge}
    </div>
  );
}

/** The selected species, shown as art rather than a line of text. */
function TargetHero({ id }: { id: string }) {
  const dex = id ? DEX[id] : undefined;

  if (!dex) {
    return (
      <div className="target-hero empty">
        <div className="portrait portrait-lg">
          <span className="portrait-fallback">?</span>
        </div>
        <div className="target-meta">
          <strong className="target-name">No target yet</strong>
          <span className="muted small">Search below for the species you want to end up with.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="target-hero">
      <Portrait id={id} size="lg" />
      <div className="target-meta">
        <strong className="target-name">{dex.name}</strong>
        <span className="muted small">#{dex.num}</span>
        <div className="type-row">
          {dex.types.map((t) => (
            <span key={t} className="type">
              {t}
            </span>
          ))}
        </div>
        {UNBREEDABLE.has(id) && <span className="badge diluted">cannot be bred</span>}
      </div>
    </div>
  );
}

/**
 * Search box and dropdown in one control. A plain <select> cannot show portraits,
 * and a disabled <option> silently swallows the click — so the list is built from
 * buttons, which also lets unbreedable species be picked and then explained.
 */
function SpeciesCombo({
  value,
  options,
  query,
  onQuery,
  onPick,
}: {
  value: string;
  options: PalDex[];
  query: string;
  onQuery: (q: string) => void;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Arrowing through 289 species is useless if the highlight scrolls out of view.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = (id: string): void => {
    onPick(id);
    onQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const n = options.length;
      if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault();
      commit(options[active].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="combo" ref={boxRef}>
      <div className="combo-field">
        <input
          className="search combo-input"
          role="combobox"
          aria-expanded={open}
          aria-controls="species-listbox"
          aria-autocomplete="list"
          placeholder={value ? `${nameOf(value)} — search to change` : 'Search 289 species…'}
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="combo-caret"
          aria-label={open ? 'Close species list' : 'Open species list'}
          onClick={() => setOpen((o) => !o)}
        >
          ▾
        </button>
      </div>

      {open && (
        <ul className="combo-list" id="species-listbox" role="listbox" ref={listRef}>
          {options.length === 0 && <li className="combo-empty muted small">No species matches “{query}”.</li>}
          {options.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === value}
                data-active={i === active}
                className={`combo-row${p.id === value ? ' on' : ''}${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(p.id)}
              >
                <Portrait id={p.id} size="sm" />
                <span className="combo-name">{p.name}</span>
                {UNBREEDABLE.has(p.id) && <span className="combo-note">cannot be bred</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PassiveChips({ ids, need }: { ids: string[]; need: string[] }) {
  if (ids.length === 0) return <span className="no-passives">no passives</span>;
  return (
    <>
      {ids.map((id) => {
        const rank = rankOf(id, PASSIVES[id]);
        return (
          <span
            key={id}
            className={`chip ${rankClass(rank)}${need.includes(id) ? ' wanted' : ''}`}
            title={passiveTitle(id)}
          >
            <span className="chip-label">{passiveLabel(id)}</span>
            <RankMark rank={rank} />
          </span>
        );
      })}
    </>
  );
}

function ParentCard({
  node,
  steps,
  byInstance,
}: {
  node: PlanNode;
  steps: BreedNode[];
  byInstance: Map<string, RosterPal>;
}) {
  if (node.kind === 'breed') {
    // Post-order flattening guarantees a bred parent already appeared as a step.
    const from = steps.indexOf(node) + 1;
    return (
      <div className="pal-card bred">
        <Portrait id={node.species} size="md" badge={<span className="loc loc-step">from step {from}</span>} />
        <div className="pal-card-body">
          <strong className="name">{nameOf(node.species)}</strong>
          <span className="muted small">bred earlier in this plan</span>
          <div className="carries">
            <PassiveChips ids={node.need} need={node.need} />
          </div>
        </div>
      </div>
    );
  }

  const full = byInstance.get(node.pal.instanceId);
  const ivTotal = full ? full.ivs.hp + full.ivs.attack + full.ivs.defense : null;

  return (
    <div className="pal-card seed">
      <Portrait
        id={node.species}
        size="md"
        badge={<span className={`loc loc-${node.pal.location ?? 'unknown'}`}>{node.pal.location}</span>}
      />
      <div className="pal-card-body">
        <div className="name-row">
          <strong className="name">{nameOf(node.species)}</strong>
          {node.pal.gender && (
            <span className={`gender ${node.pal.gender}`}>{node.pal.gender === 'male' ? '♂' : '♀'}</span>
          )}
        </div>
        {node.pal.nickname && <div className="nick">“{node.pal.nickname}”</div>}

        <div className="badges">
          {node.pal.level != null && <span className="lvl">Lv {node.pal.level}</span>}
          {full && full.rank > 1 && <span className="stars">{'★'.repeat(full.rank - 1)}</span>}
          {full?.isBoss && <span className="tag alpha">Alpha</span>}
          {ivTotal !== null && <span className="muted small">IV {ivTotal}/300</span>}
        </div>

        <div className="carries">
          <PassiveChips ids={node.pal.passives} need={node.need} />
        </div>

        {node.candidates.length > 1 && (
          <span className="muted small">{node.candidates.length} in your box could fill this slot</span>
        )}
      </div>
    </div>
  );
}

function ChildCard({ species, need, final }: { species: string; need: string[]; final: boolean }) {
  return (
    <div className={`pal-card is-child${final ? ' final' : ''}`}>
      <Portrait id={species} size="md" />
      <div className="pal-card-body">
        <strong className="name">{nameOf(species)}</strong>
        <span className="muted small">{final ? 'your target' : 'feeds the next step'}</span>
        <div className="carries">
          <PassiveChips ids={need} need={need} />
        </div>
      </div>
    </div>
  );
}
