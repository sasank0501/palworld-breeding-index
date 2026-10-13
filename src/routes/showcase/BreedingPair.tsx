import { useId, useMemo, useState } from 'react';

import metaJson from '../../data/meta.json';
import { childOf, outcomeStatus, pairIndex, pairStatus, type GenderRule, type PairStatus } from '../../lib/pair.ts';
import type { Ctx } from './ctx.ts';
import { DEX, SpeciesArt, nameOf } from './shared.tsx';
import { ElementChips, elementOf, tierOf } from './parts.tsx';

const GENDER = (metaJson as unknown as { gender: GenderRule[] }).gender;
const ALL = Object.values(DEX);

/**
 * The pair calculator on the Breeding page: two parents in, their child out, and whether the
 * player can breed it today from the pals they own. The lists below answer "what can I make?";
 * this answers "what do these two make?". Three of the page's own list cards in a row: the two
 * parents each hold a search box, the result opens the species' page.
 */
export function BreedingPair({ ctx, onSpecies }: { ctx: Ctx; onSpecies: (id: string) => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const index = useMemo(() => (ctx.combos ? pairIndex(ctx.combos) : null), [ctx.combos]);
  const result = index && a && b ? childOf(index, a, b, GENDER) : null;
  const titleId = useId();

  return (
    <section className="sc-bpair" aria-labelledby={titleId}>
      <div className="sc-bpair-head">
        <h2 id={titleId}>Pair calculator</h2>
        <p>Pick two parents, see what they breed and whether you can do it today.</p>
      </div>
      <div className="sc-bpair-row">
        <ParentCard label="First parent" id={a} onPick={setA} ctx={ctx} />
        <i aria-hidden="true">×</i>
        <ParentCard label="Second parent" id={b} onPick={setB} ctx={ctx} />
        <i aria-hidden="true">=</i>
        <div className="sc-bpair-out" role="status">
          {!a || !b ? (
            <p className="sc-bpair-blank">The pal they breed shows here once both parents are chosen.</p>
          ) : !result ? (
            <p className="sc-bpair-blank">Unrolling the breeding charts…</p>
          ) : result.kind === 'none' ? (
            <p className="sc-bpair-blank">
              PalDoc has no breeding data for {nameOf(a)} with {nameOf(b)}.
            </p>
          ) : result.kind === 'child' ? (
            <ChildCard id={result.child} status={pairStatus(a, b, ctx.have)} note={statusNote(pairStatus(a, b, ctx.have), a, b)} ctx={ctx} onOpen={onSpecies} />
          ) : (
            result.outcomes.map((o) => {
              const st = outcomeStatus(o.female, o.male, ctx.have);
              const how = `Female ${nameOf(o.female)} with male ${nameOf(o.male)}`;
              const note =
                st === 'ready'
                  ? `${how}: ready now`
                  : st === 'sexes'
                    ? `${how}: you own both species, but not that female and that male`
                    : `${how}: ${statusNote(st, o.female, o.male).replace(/^./, (c) => c.toLowerCase())}`;
              return <ChildCard key={o.child} id={o.child} status={st} note={note} ctx={ctx} onOpen={onSpecies} />;
            })
          )}
        </div>
      </div>
    </section>
  );
}

/** What stands between the player and this pairing, in words. */
function statusNote(status: PairStatus, a: string, b: string): string {
  if (status === 'ready') return 'Ready now: you own both';
  if (status === 'sexes') return a === b ? `You need a male and a female ${nameOf(a)}` : `Your ${nameOf(a)} and ${nameOf(b)} are the same sex`;
  if (status === 'needBoth') return a === b ? `You don’t own a ${nameOf(a)} yet` : 'You own neither parent yet';
  return `You don’t own a ${nameOf(status === 'needA' ? a : b)} yet`;
}

/** A parent: the list card, with a search box that changes which species it is. */
function ParentCard({ label, id, onPick, ctx }: { label: string; id: string; onPick: (id: string) => void; ctx: Ctx }) {
  const [query, setQuery] = useState('');
  const own = id ? ctx.byPal.get(id)?.length ?? 0 : 0;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL.filter((d) => d.name.toLowerCase().includes(q))
      .sort((x, y) => Number(!x.name.toLowerCase().startsWith(q)) - Number(!y.name.toLowerCase().startsWith(q)) || x.name.localeCompare(y.name))
      .slice(0, 8);
  }, [query]);
  const pick = (next: string) => {
    onPick(next);
    setQuery('');
  };

  return (
    <div className={`sc-gap${id ? ` tier-${tierOf(id)} e-${elementOf(id)}` : ''}`}>
      <span className="sc-gap-art">{id ? <SpeciesArt id={id} /> : <i aria-hidden="true">?</i>}</span>
      <span className="sc-gap-body">
        <span className="sc-bpair-label">{label}</span>
        <b className="sc-gap-name">{id ? nameOf(id) : 'Not chosen yet'}</b>
        {id && (
          <span>
            <ElementChips id={id} /> <small className="sc-bpair-note">{own ? `you own ×${own}` : 'not owned'}</small>
          </span>
        )}
        <span className="sc-bpair-find sc-search block">
          <input
            value={query}
            aria-label={`${label}: search species`}
            placeholder={id ? `${nameOf(id)}, or another…` : 'Search 289 species…'}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
              else if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
          <span className="sr-only" role="status">
            {query ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}` : ''}
          </span>
          {matches.length > 0 && (
            <ul className="sc-matches">
              {matches.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => pick(d.id)}>
                    <span>
                      <SpeciesArt id={d.id} />
                    </span>
                    {d.name}
                    {ctx.byPal.has(d.id) && <em>×{ctx.byPal.get(d.id)?.length}</em>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
      </span>
    </div>
  );
}

/** The result: a list card that opens the species' page, with what it takes to breed it. */
function ChildCard({ id, status, note, ctx, onOpen }: { id: string; status: PairStatus; note: string; ctx: Ctx; onOpen: (id: string) => void }) {
  const own = ctx.byPal.get(id)?.length ?? 0;
  return (
    <button type="button" className={`sc-gap tier-${tierOf(id)} e-${elementOf(id)}${status === 'ready' ? ' is-ready' : ''}`} onClick={() => onOpen(id)}>
      <span className="sc-gap-art">
        <SpeciesArt id={id} />
      </span>
      <span className="sc-gap-body">
        <span className="sc-bpair-label">They breed{own ? ` · you own ×${own}` : ' · new to you'}</span>
        <b className="sc-gap-name">{nameOf(id)}</b>
        <ElementChips id={id} />
        <span className={`sc-bpair-note${status === 'ready' ? ' ready' : ''}`}>{note}</span>
      </span>
    </button>
  );
}
