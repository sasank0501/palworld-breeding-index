import { useEffect, useMemo, useRef, useState } from 'react';

import { forgetMissing, forgetPal, missingPals } from '../../userdata/edit.ts';
import type { Ctx } from './ctx.ts';
import '../../design/userdata.css';

/**
 * After an import: which pals the player starred or noted are no longer in the
 * save (sold, condensed, released). A notice with Review and Dismiss; Review lists
 * them, each with Forget, plus Forget all and Keep them for now. Nothing is
 * forgotten without the player asking: a pal may come back (Global Palbox).
 */
export function MissingNotice({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const { data, edit } = ctx.user;
  const [reviewing, setReviewing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const ids = useMemo(() => ctx.roster.pals.map((p) => p.instanceId).filter(Boolean), [ctx.roster]);
  const missing = useMemo(() => (data ? missingPals(data, ids) : []), [data, ids]);

  useEffect(() => {
    if (reviewing) heading.current?.focus();
  }, [reviewing]);
  useEffect(() => {
    if (data && missing.length === 0) onDone();
  }, [data, missing.length, onDone]);

  if (!data || missing.length === 0) return null;
  const n = missing.length;
  const pals = `${n} ${n === 1 ? 'pal' : 'pals'}`;

  return (
    <div className="sc-missing">
      {!reviewing ? (
        <div className="sc-missing-notice" role="status">
          <p>
            <b>{pals} you marked</b> {n === 1 ? 'is' : 'are'} no longer in your save.
          </p>
          <button type="button" className="sc-btn" onClick={() => setReviewing(true)}>
            Review
          </button>
          <button type="button" className="sc-btn ghost" onClick={onDone}>
            Dismiss
          </button>
        </div>
      ) : (
        <section className="sc-missing-review" aria-labelledby="missing-h">
          <h2 id="missing-h" ref={heading} tabIndex={-1}>
            No longer in your save
          </h2>
          <p className="sc-sethint">Sold, condensed or released since you last imported. Forget them, or keep them in case they come back.</p>
          <ul>
            {missing.map((m) => (
              <li key={m.instanceId}>
                <div>
                  <b>{m.label ?? 'A pal no longer in your save'}</b>
                  <span>
                    {m.favourite ? '★ favourite' : ''}
                    {m.favourite && m.note !== undefined ? ' · ' : ''}
                    {m.note !== undefined ? `note: “${m.note.length > 80 ? `${m.note.slice(0, 80)}…` : m.note}”` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="sc-btn ghost"
                  aria-label={`Forget ${m.label ?? 'this pal'}`}
                  onClick={() => edit((d) => forgetPal(d, m.instanceId))}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
          <div className="sc-missing-actions">
            <button
              type="button"
              className="sc-btn"
              onClick={() => {
                edit((d) => forgetMissing(d, ids));
                onDone();
              }}
            >
              Forget all
            </button>
            <button type="button" className="sc-btn ghost" onClick={onDone}>
              Keep them for now
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
