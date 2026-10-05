import { useMemo, useState } from 'react';

import { DEX, META, SPECIES_TOTAL, SpeciesArt, nameOf, roman } from './shared.tsx';
import type { Ctx } from './ctx.ts';
import { ELEMENTS, ElementChips, ElementIcon, elementOf, stagger, tierOf, title, type Element } from './parts.tsx';

const LANE = ['', 'One step away', 'Two steps away', 'Three steps away', 'Four steps away'];

/**
 * The breeding gaps as an expedition board: how many new species you can reach,
 * laid out by how far each is. Every card previews its recipe; click one for the
 * full dossier (all recipes, the route tree, your parents).
 */
export function Breeding({ ctx, onSpecies }: { ctx: Ctx; onSpecies: (id: string) => void }) {
  const { reach } = ctx;
  const [query, setQuery] = useState('');
  const [element, setElement] = useState<Element | 'all'>('all');

  const lanes = useMemo(() => {
    if (!reach) return [];
    const by = new Map<number, string[]>();
    for (const [id, d] of reach.depth) if (d > 0) by.set(d, [...(by.get(d) ?? []), id]);
    return [...by.entries()]
      .sort(([a], [b]) => a - b)
      .map(([depth, ids]) => ({ depth, ids: ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b))) }));
  }, [reach]);

  if (!reach) return <p className="sc-empty">Unrolling the breeding charts…</p>;

  const q = query.trim().toLowerCase();
  const pass = (id: string): boolean =>
    (!q || nameOf(id).toLowerCase().includes(q)) && (element === 'all' || DEX[id]?.types.includes(element));

  const ready = lanes.find((l) => l.depth === 1)?.ids.length ?? 0;
  const further = lanes.filter((l) => l.depth > 1).reduce((n, l) => n + l.ids.length, 0);
  const wild = META.unbreedable.filter((id) => !ctx.byPal.has(id));
  let order = 0;

  return (
    <>
      <header className="sc-bhero">
        <p className="sc-kicker sc-in" style={stagger(0)}>
          Breeding gaps · from your {ctx.roster.pals.length.toLocaleString('en')} pals
        </p>
        <h1 className="sc-bbig sc-in" style={stagger(1)}>
          <b>{ready}</b> new species <span>within reach</span>
        </h1>
        <p className="sc-lede sc-in" style={stagger(2)}>
          Each of these can be bred today from pals already in your boxes. {ctx.owned.length} of {SPECIES_TOTAL}{' '}
          species are discovered; the rest are charted below by how far away they are.
        </p>
        <dl className="sc-bstats sc-in" style={stagger(3)}>
          <Stat label="Discovered" value={ctx.owned.length} of={SPECIES_TOTAL} />
          <Stat label="Further out" value={further} />
          <Stat label="Lacking a mate" value={reach.missingMate.length} />
          <Stat label="No route" value={reach.unreachable.length} />
          <Stat label="Wild only" value={wild.length} />
        </dl>
      </header>

      <section className="sc-section">
        <div className="sc-bar">
          <label className="sc-search">
            <input value={query} aria-label="Find a species" placeholder="Find a species…" onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="sc-elbar" role="group" aria-label="Element">
          <button className={element === 'all' ? 'on' : ''} aria-pressed={element === 'all'} onClick={() => setElement('all')}>
            All
          </button>
          {ELEMENTS.map((e) => (
            <button
              key={e}
              className={`e-${e}${element === e ? ' on' : ''}`}
              aria-pressed={element === e}
              onClick={() => setElement(element === e ? 'all' : e)}
            >
              <ElementIcon element={e} size={16} />
              {title(e)}
            </button>
          ))}
        </div>

        {lanes.map((lane) => {
          const ids = lane.ids.filter(pass);
          if (ids.length === 0) return null;
          return (
            <div key={lane.depth} className="sc-lane">
              <h2 className="sc-lane-head">
                <span className="sc-roman">{roman(lane.depth)}</span>
                {LANE[lane.depth] ?? `${lane.depth} steps away`}
                <em>{ids.length}</em>
              </h2>
              <div className="sc-gaps">
                {ids.map((id) => (
                  <GapCard key={id} id={id} ctx={ctx} index={order++} onOpen={() => onSpecies(id)} />
                ))}
              </div>
            </div>
          );
        })}

        {!q && element === 'all' && (
          <>
            {reach.missingMate.length > 0 && (
              <Pool
                glyph="♂♀"
                head="Lacking a mate"
                note="You hold only one sex of these, so they can’t pair with their own kind. Catch or hatch the other and more of the chart opens up."
                ids={reach.missingMate}
                ctx={ctx}
                onOpen={onSpecies}
              />
            )}
            {reach.unreachable.length > 0 && (
              <Pool glyph="∅" head="No route yet" ids={reach.unreachable} ctx={ctx} onOpen={onSpecies} />
            )}
            {wild.length > 0 && (
              <Pool
                glyph="🌿"
                head="Wild only"
                note="These species can’t be bred at all. Find them in the world."
                ids={wild}
                ctx={ctx}
                onOpen={onSpecies}
              />
            )}
          </>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div className={value === 0 ? 'zero' : undefined}>
      <dt>{label}</dt>
      <dd>
        {value}
        {of !== undefined && <small>/{of}</small>}
      </dd>
    </div>
  );
}

function GapCard({ id, ctx, index, onOpen }: { id: string; ctx: Ctx; index: number; onOpen: () => void }) {
  const pair = ctx.reach?.recipe.get(id);
  const depth = ctx.reach?.depth.get(id) ?? 1;
  return (
    <button className={`sc-gap tier-${tierOf(id)} e-${elementOf(id)}`} style={stagger(Math.min(index, 30))} onClick={onOpen}>
      <span className="sc-gap-art">
        <SpeciesArt id={id} />
      </span>
      <span className="sc-gap-body">
        <b className="sc-gap-name">{nameOf(id)}</b>
        <ElementChips id={id} />
        {pair && (
          <span className="sc-gap-recipe">
            <span title={nameOf(pair[0])}>
              <SpeciesArt id={pair[0]} />
            </span>
            <i>×</i>
            <span title={nameOf(pair[1])}>
              <SpeciesArt id={pair[1]} />
            </span>
            <small>
              {nameOf(pair[0])} × {nameOf(pair[1])}
            </small>
          </span>
        )}
      </span>
      {depth > 1 && <span className="sc-gap-depth">{depth} steps</span>}
    </button>
  );
}

function Pool({
  glyph,
  head,
  note,
  ids,
  ctx,
  onOpen,
}: {
  glyph: string;
  head: string;
  note?: string;
  ids: string[];
  ctx: Ctx;
  onOpen: (id: string) => void;
}) {
  const sorted = [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return (
    <div className="sc-lane">
      <h2 className="sc-lane-head">
        <span className="sc-roman">{glyph}</span>
        {head}
        <em>{ids.length}</em>
      </h2>
      {note && <p className="sc-pool-note">{note}</p>}
      <div className="sc-pool">
        {sorted.map((id) => {
          const o = ctx.have.get(id);
          return (
            <button key={id} className={`e-${elementOf(id)}`} onClick={() => onOpen(id)}>
              <span>
                <SpeciesArt id={id} />
              </span>
              {nameOf(id)}
              {o && <small>{o.male ? '♂ only' : '♀ only'}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
