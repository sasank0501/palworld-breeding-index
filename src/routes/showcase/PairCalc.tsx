import { useId, useMemo, useState } from 'react';

import metaJson from '../../data/meta.json';
import type { Combos } from '../../lib/breeding.ts';
import { childOf, pairIndex, type GenderRule } from '../../lib/pair.ts';
import { DEX, SpeciesArt, nameOf } from './shared.tsx';
import { elementOf } from './parts.tsx';

const GENDER = (metaJson as unknown as { gender: GenderRule[] }).gender;
const BY_NAME = Object.values(DEX).sort((a, b) => a.name.localeCompare(b.name));

/**
 * The pair calculator on the browse page: choose two parents, see their child. The species pages
 * answer "what makes this pal?"; this answers the question the other way round. Two native
 * selects, so the keyboard, type-ahead and a phone's own picker all work without any of our code.
 */
export function PairCalc({ combos, onSpecies }: { combos: Combos | null; onSpecies: (id: string) => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const titleId = useId();
  const index = useMemo(() => (combos ? pairIndex(combos) : null), [combos]);
  const result = index && a && b ? childOf(index, a, b, GENDER) : null;

  const picker = (label: string, value: string, set: (id: string) => void) => (
    <label>
      {label}
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Choose a pal…</option>
        {BY_NAME.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );
  const child = (id: string) => (
    <button type="button" className={`sc-pchip e-${elementOf(id)}`} onClick={() => onSpecies(id)}>
      <span className="sc-pchip-art">
        <SpeciesArt id={id} />
      </span>
      <b>{nameOf(id)}</b>
    </button>
  );

  return (
    <section className="sc-card sc-paircalc" aria-labelledby={titleId}>
      <div>
        <h2 id={titleId} className="sc-h3">
          Pair calculator
        </h2>
        <p className="sc-muted">Choose two parents to see the pal they breed.</p>
      </div>
      <div className="sc-paircalc-pick">
        {picker('First parent', a, setA)}
        <i aria-hidden="true">×</i>
        {picker('Second parent', b, setB)}
      </div>
      <div className="sc-paircalc-out" role="status">
        {!a || !b ? (
          <p className="sc-muted">The child shows here once both parents are chosen.</p>
        ) : !index || !result ? (
          <p className="sc-muted">Loading the breeding matrix…</p>
        ) : result.kind === 'none' ? (
          <p>
            PalDoc has no breeding data for {nameOf(a)} with {nameOf(b)}.
          </p>
        ) : result.kind === 'child' ? (
          <p>
            <span>
              {nameOf(a)} with {nameOf(b)} breeds
            </span>
            {child(result.child)}
          </p>
        ) : (
          <>
            <p>This pair depends on which parent is female.</p>
            {result.outcomes.map((o) => (
              <p key={o.child}>
                <span>
                  Female {nameOf(o.female)} with male {nameOf(o.male)} breeds
                </span>
                {child(o.child)}
              </p>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
