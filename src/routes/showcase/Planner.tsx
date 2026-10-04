import { useEffect, useMemo, useState } from 'react';

import { Portrait, displayName, ivTotal } from '../../components/PalCards.tsx';
import { PRESETS, RANK_ORDER, rankSort } from '../../lib/passiveCategories.ts';
import {
  MAX_PASSIVES,
  flattenPlan,
  solvePassivePlan,
  type PlanNode,
  type PlannerPal,
  type SolveResult,
} from '../../lib/passivePlan.ts';
import type { RosterPal } from '../../types.ts';
import { DEX, LOCATION, META, PASSIVES, SpeciesArt, TraitName, UNBREEDABLE, nameOf, rankFor, roman, traitClass, traitGlyph } from './shared.tsx';
import type { Ctx } from './ctx.ts';
import { ElementChips, PalEgg, TraitChips, elementOf, stagger, tierOf } from './parts.tsx';
import { Tree, type TNode } from './tree.tsx';

const RANK_NAMES: Record<string, string> = {
  '5': 'World Tree',
  '4': 'Rank IV',
  '3': 'Rank III',
  '2': 'Rank II',
  '1': 'Rank I',
  neg: 'Flaws',
  unk: 'Unverified',
};
const rankKey = (id: string): string => {
  const r = rankFor(id);
  return r === null ? 'unk' : r < 0 ? 'neg' : String(r);
};

/**
 * The passive planner as a workshop: choose a species and up to four passives on
 * the left, get a lineage on the right: a tree of who breeds with whom, the pals
 * to gather (and where they are kept), and the alternatives for each passive.
 */
export function Planner({
  ctx,
  initialTarget,
  onSpecies,
  onPal,
}: {
  ctx: Ctx;
  initialTarget: string;
  onSpecies: (id: string) => void;
  onPal: (p: RosterPal) => void;
}) {
  const [target, setTarget] = useState(initialTarget);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (initialTarget) {
      setTarget(initialTarget);
      setResult(null);
    }
  }, [initialTarget]);

  const planner: PlannerPal[] = useMemo(
    () =>
      ctx.roster.pals
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
    [ctx.roster],
  );
  const byInstance = useMemo(() => new Map(ctx.roster.pals.map((p) => [p.instanceId, p])), [ctx.roster]);

  /** passive id -> your pals that carry it, strongest first. */
  const carriers = useMemo(() => {
    const m = new Map<string, RosterPal[]>();
    for (const p of ctx.roster.pals) for (const s of p.passives) m.set(s, [...(m.get(s) ?? []), p]);
    for (const list of m.values()) list.sort((a, b) => ivTotal(b) - ivTotal(a));
    return m;
  }, [ctx.roster]);

  const { groups, unowned } = useMemo(() => {
    const by = new Map<string, string[]>();
    const missing: string[] = [];
    for (const id of Object.keys(PASSIVES)) {
      if (!carriers.has(id)) {
        if (PASSIVES[id]?.name) missing.push(id);
        continue;
      }
      const k = rankKey(id);
      by.set(k, [...(by.get(k) ?? []), id]);
    }
    for (const list of by.values()) list.sort((a, b) => (carriers.get(b)?.length ?? 0) - (carriers.get(a)?.length ?? 0));
    const keys = [...RANK_ORDER.filter((r) => r > 0).map(String), 'neg', 'unk'];
    return {
      groups: keys.filter((k) => by.has(k)).map((k) => ({ key: k, ids: by.get(k) as string[] })),
      unowned: missing.sort((a, b) => rankSort(rankFor(b)) - rankSort(rankFor(a))),
    };
  }, [carriers]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return Object.values(DEX)
      .filter((d) => d.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
      .slice(0, 8);
  }, [query]);

  const toggle = (id: string): void => {
    setResult(null);
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_PASSIVES ? cur : [...cur, id]));
  };

  const canSolve = ctx.combos !== null && target !== '' && picked.length > 0 && !UNBREEDABLE.has(target);
  const solve = (): void => {
    if (!ctx.combos || !canSolve) return;
    setSolving(true);
    setResult(null);
    setTimeout(() => {
      setResult(solvePassivePlan({ target, want: picked, owned: planner, combos: ctx.combos!, unbreedable: META.unbreedable }));
      setSolving(false);
    }, 16);
  };

  const tdex = target ? DEX[target] : undefined;

  return (
    <>
      <header className="sc-phero">
        <p className="sc-kicker sc-in" style={stagger(0)}>
          Passive planner
        </p>
        <h1 className="sc-pbig sc-in" style={stagger(1)}>
          Breed the <span>perfect</span> pal
        </h1>
        <p className="sc-lede sc-in" style={stagger(2)}>
          Pick a species and up to four passives. The planner finds a chain of pairings from the pals you already own.
          Inheritance is still random at every step, so expect to re-roll some eggs.
        </p>
      </header>

      <div className="sc-plan">
        <div className="sc-plan-setup">
          <section className="sc-card sc-in" style={stagger(3)}>
            <h2 className="sc-h3">
              <span className="sc-roman">1</span> Target species
            </h2>
            <div className={`sc-target${tdex ? ` tier-${tierOf(target)} e-${elementOf(target)}` : ''}`}>
              <span className="sc-target-art">{tdex ? <SpeciesArt id={target} /> : <i>?</i>}</span>
              <div>
                <b>{tdex?.name ?? 'Not chosen yet'}</b>
                {tdex ? <ElementChips id={target} labels /> : <small>Search below.</small>}
                {target && UNBREEDABLE.has(target) && <em className="warn">Can’t be bred, so it can’t get passives.</em>}
              </div>
            </div>
            <label className="sc-search block">
              <input
                value={query}
                placeholder={tdex ? `${tdex.name}, or another…` : 'Search 289 species…'}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches[0]) {
                    setTarget(matches[0].id);
                    setResult(null);
                    setQuery('');
                  }
                }}
              />
            </label>
            {matches.length > 0 && (
              <ul className="sc-matches">
                {matches.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => {
                        setTarget(d.id);
                        setResult(null);
                        setQuery('');
                      }}
                    >
                      <span>
                        <SpeciesArt id={d.id} />
                      </span>
                      {d.name}
                      {UNBREEDABLE.has(d.id) && <em>can’t be bred</em>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sc-card sc-in" style={stagger(4)}>
            <h2 className="sc-h3">
              <span className="sc-roman">2</span> Passives{' '}
              <span>
                {picked.length}/{MAX_PASSIVES}
              </span>
            </h2>
            <div className="sc-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  title={p.blurb}
                  onClick={() => {
                    setResult(null);
                    setPicked(p.passives.filter((id) => carriers.has(id)).slice(0, MAX_PASSIVES));
                  }}
                >
                  {p.label}
                </button>
              ))}
              {picked.length > 0 && (
                <button
                  className="clear"
                  onClick={() => {
                    setPicked([]);
                    setResult(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="sc-picker">
              {groups.map((g) => (
                <div key={g.key}>
                  <h3>{RANK_NAMES[g.key]}</h3>
                  <div>
                    {g.ids.map((id) => {
                      const on = picked.includes(id);
                      return (
                        <button
                          key={id}
                          className={`sc-pick ${traitClass(id)}${on ? ' on' : ''}`}
                          aria-pressed={on}
                          disabled={!on && picked.length >= MAX_PASSIVES}
                          title={PASSIVES[id]?.effects?.join(', ') || id}
                          onClick={() => toggle(id)}
                        >
                          <i>{traitGlyph(id)}</i>
                          <TraitName id={id} />
                          <small>{carriers.get(id)?.length}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {unowned.length > 0 && (
                <details className="sc-unowned">
                  <summary>Not in your boxes · {unowned.length}</summary>
                  <p>
                    {unowned.map((id, i) => (
                      <span key={id} className={traitClass(id)}>
                        {i > 0 && ', '}
                        <TraitName id={id} />
                      </span>
                    ))}
                  </p>
                </details>
              )}
            </div>
          </section>

          <button className="sc-btn sc-solve sc-in" style={stagger(5)} disabled={!canSolve || solving} onClick={solve}>
            {solving ? 'Working it out…' : 'Find the lineage'}
          </button>
          {!canSolve && !solving && <p className="sc-muted center">Choose a species and at least one passive.</p>}
        </div>

        <div className="sc-plan-result">
          {!result && !solving && (
            <div className="sc-blank sc-in" style={stagger(4)}>
              <PalEgg size={84} />
              <p>
                {!target
                  ? 'Pick a species to start.'
                  : !picked.length
                    ? `Now choose what ${nameOf(target)} should inherit.`
                    : `Ready. Find the lineage for ${nameOf(target)}.`}
              </p>
            </div>
          )}
          {solving && (
            <div className="sc-blank">
              <p>Tracing pairings through {ctx.roster.pals.length.toLocaleString('en')} pals…</p>
            </div>
          )}
          {result && !result.ok && (
            <div className="sc-blank bad">
              <p>{result.reason}</p>
              {result.blocking?.length ? (
                <small>
                  Blocked by{' '}
                  {result.blocking.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <TraitName id={id} />
                    </span>
                  ))}
                </small>
              ) : null}
            </div>
          )}
          {result?.ok && (
            <Lineage
              plan={result.plan}
              target={target}
              picked={picked}
              carriers={carriers}
              byInstance={byInstance}
              onSpecies={onSpecies}
              onPal={onPal}
            />
          )}
        </div>
      </div>
    </>
  );
}

function Lineage({
  plan,
  target,
  picked,
  carriers,
  byInstance,
  onSpecies,
  onPal,
}: {
  plan: { root: PlanNode; steps: number; contamination: number };
  target: string;
  picked: string[];
  carriers: Map<string, RosterPal[]>;
  byInstance: Map<string, RosterPal>;
  onSpecies: (id: string) => void;
  onPal: (p: RosterPal) => void;
}) {
  const steps = flattenPlan(plan.root);

  // Every pal the plan pulls from your boxes, in the order it first needs them.
  const gather = useMemo(() => {
    const out: Array<{ pal: RosterPal; need: string[]; location: string }> = [];
    const seen = new Set<string>();
    const walk = (n: PlanNode): void => {
      if (n.kind === 'seed') {
        const full = byInstance.get(n.pal.instanceId);
        if (full && !seen.has(full.instanceId)) {
          seen.add(full.instanceId);
          out.push({ pal: full, need: n.need, location: n.pal.location ?? 'unknown' });
        }
      } else n.parents.forEach(walk);
    };
    walk(plan.root);
    return out;
  }, [plan.root, byInstance]);

  const scarce = useMemo(() => {
    const s = new Set<string>();
    for (const g of gather) g.need.forEach((id) => (carriers.get(id)?.length ?? 0) === 1 && s.add(id));
    return [...s];
  }, [gather, carriers]);

  const tree = useMemo<TNode>(() => {
    const conv = (n: PlanNode, path: string): TNode => {
      if (n.kind === 'seed') {
        const full = byInstance.get(n.pal.instanceId);
        return {
          key: `${path}:${n.pal.instanceId}`,
          card: full ? (
            <SeedCard pal={full} need={n.need} location={n.pal.location ?? 'unknown'} others={n.candidates.length - 1} onOpen={onPal} />
          ) : null,
        };
      }
      return {
        key: `${path}:${n.species}`,
        card: <BredCard species={n.species} need={n.need} pool={n.poolSize} root={path === 'r'} onOpen={onSpecies} />,
        kids: n.parents.map((p, i) => conv(p, `${path}/${i}`)),
      };
    };
    return conv(plan.root, 'r');
  }, [plan.root, byInstance, onPal, onSpecies]);

  if (steps.length === 0 && plan.root.kind === 'seed') {
    const s = plan.root;
    return (
      <div className="sc-blank good">
        <p>
          No breeding needed. A {nameOf(s.species)} in your {LOCATION[s.pal.location ?? 'unknown']} already has them.
        </p>
      </div>
    );
  }

  return (
    <div className="sc-result">
      <header className="sc-rhead sc-in" style={stagger(0)}>
        <span className="sc-rbig">{plan.steps}</span>
        <div>
          <p>
            generation{plan.steps === 1 ? '' : 's'} to <b>{nameOf(target)}</b>
          </p>
          <span className={`sc-chip ${plan.contamination === 0 ? 'clean' : 'dirty'}`}>
            {plan.contamination === 0
              ? 'clean pools: only the passives you want'
              : `${plan.contamination} unwanted passive${plan.contamination === 1 ? '' : 's'} in the pools`}
          </span>
        </div>
      </header>

      {scarce.length > 0 && (
        <p className="sc-warnbar sc-in" style={stagger(1)}>
          Only one pal you own carries{' '}
          {scarce.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <b>
                <TraitName id={id} />
              </b>
            </span>
          ))}
          . Keep it safe until the chain is done.
        </p>
      )}

      <section className="sc-card sc-in" style={stagger(2)}>
        <h2 className="sc-h3">Lineage tree</h2>
        <Tree root={tree} />
        <p className="sc-legend">
          <i className="own" /> a pal you own <i className="make" /> bred in this plan, carrying the passives shown
        </p>
      </section>

      <div className="sc-resgrid">
        <section className="sc-card sc-in" style={stagger(3)}>
          <h2 className="sc-h3">
            Gather these pals <span>{gather.length}</span>
          </h2>
          <ol className="sc-gather">
            {gather.map(({ pal, need, location }) => (
              <li key={pal.instanceId}>
                <button onClick={() => onPal(pal)}>
                  <span className="sc-gather-art">
                    <Portrait pal={pal} />
                  </span>
                  <span>
                    <b>{displayName(pal)}</b>
                    <small>
                      Lv {pal.level} · IV {ivTotal(pal)}
                    </small>
                    <TraitChips ids={need} want={need} />
                  </span>
                  <em className={`sc-loc loc-${location}`}>{LOCATION[location]}</em>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="sc-card sc-in" style={stagger(4)}>
          <h2 className="sc-h3">
            Order of operations <span>{steps.length}</span>
          </h2>
          <ol className="sc-steps">
            {steps.map((s, i) => (
              <li key={`${s.species}-${i}`}>
                <span className="sc-roman">{roman(i + 1)}</span>
                <div>
                  <b>Breed {nameOf(s.species)}</b>
                  <small>
                    {s.need.length} wanted of {s.poolSize} in the pool
                    {s.poolSize === s.need.length ? ' · clean' : ''}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="sc-card sc-in" style={stagger(5)}>
        <h2 className="sc-h3">Other pals you could use</h2>
        <div className="sc-alts">
          {picked.map((id) => {
            const list = carriers.get(id) ?? [];
            return (
              <div key={id}>
                <h4 className={traitClass(id)}>
                  <i>{traitGlyph(id)}</i>
                  <TraitName id={id} /> <small>{list.length} owned</small>
                </h4>
                <ul>
                  {list.slice(0, 4).map((p) => (
                    <li key={p.instanceId}>
                      <button onClick={() => onPal(p)}>
                        <b>{displayName(p)}</b>
                        <span>
                          IV {ivTotal(p)} · {LOCATION[p.location.kind]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SeedCard({
  pal,
  need,
  location,
  others,
  onOpen,
}: {
  pal: RosterPal;
  need: string[];
  location: string;
  others: number;
  onOpen: (p: RosterPal) => void;
}) {
  return (
    <button className="sc-pcard is-own" onClick={() => onOpen(pal)}>
      <span className="sc-pcard-art">
        <Portrait pal={pal} />
      </span>
      <b>{displayName(pal)}</b>
      <small>
        Lv {pal.level} · IV {ivTotal(pal)}
        {pal.gender ? (pal.gender === 'male' ? ' · ♂' : ' · ♀') : ''}
      </small>
      <TraitChips ids={pal.passives} want={need} max={4} />
      <em className={`sc-loc loc-${location}`}>{LOCATION[location]}</em>
      {others > 0 && <span className="sc-pcard-more">{others} other{others === 1 ? '' : 's'} would do</span>}
    </button>
  );
}

function BredCard({
  species,
  need,
  pool,
  root,
  onOpen,
}: {
  species: string;
  need: string[];
  pool: number;
  root: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button className={`sc-pcard ${root ? 'is-root' : 'is-make'} e-${elementOf(species)}`} onClick={() => onOpen(species)}>
      <span className="sc-pcard-art">
        <SpeciesArt id={species} />
      </span>
      <b>{nameOf(species)}</b>
      <small>{root ? 'your goal' : 'bred in this plan'}</small>
      <TraitChips ids={need} />
      {!root && <span className="sc-pcard-more">pool of {pool}</span>}
    </button>
  );
}
