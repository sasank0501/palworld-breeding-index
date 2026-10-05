import { useEffect, useMemo, useRef, useState } from 'react';

import { deletePlan } from '../../userdata/edit.ts';
import type { Plan } from '../../userdata/schema.ts';
import type { Ctx } from './ctx.ts';
import { PASSIVES, nameOf } from './shared.tsx';
import '../../design/userdata.css';

export type SavedPlan = Plan & { id: string };

const passiveName = (id: string) => PASSIVES[id]?.name ?? id;
export const planLabel = (p: Plan) => p.passives.map(passiveName).join(', ') || 'No passives';

/** Saved plans, most recently changed first. */
export function plansOf(user: Ctx['user']): SavedPlan[] {
  const plans = user.data?.plans ?? {};
  return Object.entries(plans)
    .map(([id, p]) => ({ ...p, id }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

type Sort = 'recent' | 'name';

/**
 * Every saved plan, opened from the Planner's "See all". Opens in place on the
 * Showcase stack like a species page, so Back or Esc returns to the Planner.
 */
export function SavedPlans({ ctx, onOpen }: { ctx: Ctx; onOpen: (p: SavedPlan) => void }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [said, setSaid] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const all = plansOf(ctx.user);

  // Arriving here moves focus to the page heading, so screen readers announce it.
  useEffect(() => heading.current?.focus(), []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((p) => !q || `${nameOf(p.species)} ${planLabel(p)}`.toLowerCase().includes(q));
    if (sort === 'name') list.sort((a, b) => nameOf(a.species).localeCompare(nameOf(b.species)));
    return list;
  }, [all, query, sort]);

  const remove = (p: SavedPlan) => {
    ctx.user.edit((d) => deletePlan(d, p.id));
    setSaid(`Deleted the ${nameOf(p.species)} plan.`);
  };

  return (
    <section className="sc-section sc-plans" aria-labelledby="sp-title">
      <div className="sc-plans-head">
        <h1 id="sp-title" ref={heading} tabIndex={-1} className="sc-plans-title">
          Saved plans <span>({all.length})</span>
        </h1>
        <label className="sc-search">
          <span className="sr-only">Search saved plans</span>
          <input value={query} placeholder="Search species or passive…" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="sc-plans-sort">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent">Recently saved</option>
            <option value="name">Species A–Z</option>
          </select>
        </label>
      </div>

      {all.length === 0 ? (
        <p className="sc-empty">No saved plans yet. In the Planner, pick a species and passives, then Save this plan.</p>
      ) : shown.length === 0 ? (
        <p className="sc-empty">No saved plan matches “{query}”.</p>
      ) : (
        <ul className="sc-plans-list">
          {shown.map((p) => (
            <li key={p.id}>
              <div className="sc-plans-what">
                <b>{nameOf(p.species)}</b>
                <span>{planLabel(p)}</span>
              </div>
              <time dateTime={p.at}>{new Date(p.at).toLocaleDateString()}</time>
              <div className="sc-plans-actions">
                <button type="button" className="sc-btn" onClick={() => onOpen(p)}>
                  Open
                </button>
                <button type="button" className="sc-btn ghost" aria-label={`Delete the ${nameOf(p.species)} plan`} onClick={() => remove(p)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </section>
  );
}
