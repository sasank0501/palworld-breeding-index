import { useMemo, useState } from 'react';

import { Portrait, displayName, ivTotal, speciesName } from '../../components/PalCards.tsx';
import type { RosterPal } from '../../types.ts';
import { showInSpotlight } from '../../userdata/edit.ts';
import type { Ctx } from './ctx.ts';
import '../../design/userdata.css';

/**
 * Every pal hidden from the PalDoc spotlight ("Hide" there), opened from the
 * settings panel's "See hidden pals". A page of its own on the Showcase stack
 * (like Saved plans), so the settings panel stays short however many are hidden.
 * Back or Esc returns to where you were.
 */
export function HiddenPals({ ctx, onPal }: { ctx: Ctx; onPal: (p: RosterPal) => void }) {
  const [said, setSaid] = useState('');
  const byId = useMemo(() => new Map(ctx.roster.pals.map((p) => [p.instanceId, p])), [ctx.roster]);
  const hidden = Object.entries(ctx.user.data?.hidden ?? {})
    .map(([id, h]) => ({ id, at: h.at, label: h.label, pal: byId.get(id) }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const show = (ids: string[], what: string) => {
    ctx.user.edit((d) => ids.reduce((next, id) => showInSpotlight(next, id), d));
    setSaid(`${what} can appear in the spotlight again.`);
  };

  return (
    <section className="sc-section sc-plans" aria-labelledby="hp-title">
      <div className="sc-plans-head">
        <h1 id="hp-title" className="sc-plans-title">
          Hidden from the spotlight <span>({hidden.length})</span>
        </h1>
        {hidden.length > 1 && (
          <button type="button" className="sc-btn ghost" onClick={() => show(hidden.map((h) => h.id), 'Every hidden pal')}>
            Show all again
          </button>
        )}
      </div>
      <p className="sc-sethint">Hiding only takes a pal out of the PalDoc spotlight. It stays in your save and everywhere else in the app.</p>

      {hidden.length === 0 ? (
        <p className="sc-empty">No pals are hidden. “Hide” on the PalDoc spotlight takes one out of it.</p>
      ) : (
        <ul className="sc-plans-list sc-hidden-list">
          {hidden.map((h) => {
            const name = h.pal ? displayName(h.pal) : (h.label ?? 'A pal');
            return (
              <li key={h.id}>
                <span className="sc-hidden-art">{h.pal ? <Portrait pal={h.pal} /> : null}</span>
                <div className="sc-plans-what">
                  <b>{name}</b>
                  <span>
                    {h.pal
                      ? `${h.pal.nickname ? `${speciesName(h.pal)} · ` : ''}Lv ${h.pal.level} · ${ivTotal(h.pal)}/300 potential`
                      : 'No longer in your save'}
                  </span>
                </div>
                <div className="sc-plans-actions">
                  {h.pal && (
                    <button type="button" className="sc-btn ghost" onClick={() => onPal(h.pal!)}>
                      Open
                    </button>
                  )}
                  <button type="button" className="sc-btn" aria-label={`Show ${name} in the spotlight again`} onClick={() => show([h.id], name)}>
                    Show again
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </section>
  );
}
