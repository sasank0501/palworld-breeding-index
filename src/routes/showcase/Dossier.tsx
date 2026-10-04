import { useEffect, useMemo, useState } from 'react';

import { WorkIcon, displayName, ivTotal } from '../../components/PalCards.tsx';
import { WORK_LEVEL_CAP, workName, workOrder } from '../../data/work.ts';
import { FOOD_SLOTS, foodFor, partnerSkillFor, rarityFor } from '../../design/palExtras.ts';
import { canPair, type Pair } from '../../lib/breeding.ts';
import type { RosterPal } from '../../types.ts';
import { DEX, UNBREEDABLE, SpeciesArt, nameOf } from './shared.tsx';
import { statusOf, type Ctx } from './ctx.ts';
import { ElementChips, Stage, TraitChips, elementOf, stagger, tierOf, title } from './parts.tsx';
import { Tree, type TNode } from './tree.tsx';

const RECIPE_PAGE = 12;

/**
 * One species, in depth: what it is, what you hold of it, and every way to get
 * it. This is the detailed view behind both the Paldex and the Breeding gaps.
 */
export function Dossier({
  ctx,
  id,
  onSpecies,
  onPal,
  onPlan,
}: {
  ctx: Ctx;
  id: string;
  onSpecies: (id: string) => void;
  onPal: (p: RosterPal) => void;
  onPlan: (id: string) => void;
}) {
  const dex = DEX[id];
  const { status, depth } = statusOf(ctx, id);
  const mine = ctx.byPal.get(id) ?? [];
  const partner = partnerSkillFor(id);
  const food = foodFor(id) ?? 0;
  const tier = tierOf(id);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [id]);

  const work = useMemo(
    () => [...(dex?.work ?? [])].sort((a, b) => workOrder(a.job) - workOrder(b.job)),
    [dex],
  );

  // Every parent pair that makes this species, the ones you can act on first.
  const recipes = useMemo(() => {
    const list: Pair[] = ctx.combos?.[id] ?? [];
    const rank = ([a, b]: Pair): number => {
      if (canPair(a, b, ctx.have)) return 0;
      const n = Number(ctx.byPal.has(a)) + Number(ctx.byPal.has(b));
      return n === 1 ? 1 : n === 2 ? 2 : 3;
    };
    return list
      .map((p) => ({ pair: p, rank: rank(p) }))
      .sort((x, y) => x.rank - y.rank || nameOf(x.pair[0]).localeCompare(nameOf(y.pair[0])));
  }, [ctx, id]);

  const readyCount = recipes.filter((r) => r.rank === 0).length;
  const shown = showAll ? recipes : recipes.slice(0, RECIPE_PAGE);

  /** The shortest route as a tree: owned species are leaves, the rest are made from their recipe pair. */
  const route = useMemo<TNode | null>(() => {
    const reach = ctx.reach;
    if (!reach || status === 'owned' || status === 'lost' || status === 'unknown') return null;
    // `path` keeps keys unique when both parents are the same species.
    const build = (sid: string, seen: Set<string>, path: string): TNode => {
      const pair = reach.recipe.get(sid);
      const own = ctx.byPal.has(sid);
      const kids =
        !own && pair && !seen.has(sid)
          ? pair.map((p, i) => build(p, new Set([...seen, sid]), `${path}/${i}`))
          : undefined;
      return {
        key: `${path}:${sid}`,
        card: <SpeciesCard id={sid} ctx={ctx} root={path === 'r'} onOpen={onSpecies} />,
        kids,
      };
    };
    return build(id, new Set(), 'r');
  }, [ctx, id, status, onSpecies]);

  const banner =
    status === 'owned'
      ? { cls: 'owned', head: `Discovered · ×${mine.length}`, sub: `Best potential ${ivTotal(mine[0])}/300` }
      : status === 'ready'
        ? { cls: 'ready', head: 'You can breed this now', sub: `${readyCount} ready pair${readyCount === 1 ? '' : 's'} in your boxes` }
        : status === 'far'
          ? { cls: 'far', head: `${depth} breeding steps away`, sub: 'Follow the route below' }
          : status === 'lost'
            ? UNBREEDABLE.has(id)
              ? { cls: 'lost', head: 'Wild only', sub: 'This species cannot be bred. Catch it in the world.' }
              : { cls: 'lost', head: 'No route yet', sub: 'No chain reaches it from your current pals.' }
            : { cls: 'unknown', head: 'Working it out…', sub: '' };

  return (
    <article className={`sc-doss tier-${tier} e-${elementOf(id)}`} key={id}>
      <header className="sc-doss-hero">
        <div className="sc-doss-stage sc-in" style={stagger(0)}>
          <Stage id={id} pal={mine[0]} picker />
        </div>

        <div className="sc-doss-head">
          <p className="sc-kicker sc-in" style={stagger(1)}>
            No. {String(dex?.num ?? '').padStart(3, '0')} · {tier} · {dex?.types.map(title).join(' / ')}
          </p>
          <h1 className="sc-doss-name sc-in" style={stagger(2)}>
            {dex?.name ?? id}
          </h1>
          <div className="sc-in" style={stagger(3)}>
            <ElementChips id={id} labels />
          </div>

          <div className={`sc-banner is-${banner.cls} sc-in`} style={stagger(4)}>
            <b>{banner.head}</b>
            <span>{banner.sub}</span>
          </div>

          <dl className="sc-facts sc-in" style={stagger(5)}>
            <div>
              <dt>Rarity</dt>
              <dd>{rarityFor(id) ?? '—'}</dd>
            </div>
            <div>
              <dt>Appetite</dt>
              <dd>
                {food || '—'}
                <small>/{FOOD_SLOTS}</small>
              </dd>
            </div>
            <div>
              <dt>Recipes</dt>
              <dd>{UNBREEDABLE.has(id) ? 0 : recipes.length}</dd>
            </div>
            <div>
              <dt>Owned</dt>
              <dd>{mine.length}</dd>
            </div>
          </dl>

          <button className="sc-btn sc-in" style={stagger(6)} disabled={UNBREEDABLE.has(id)} onClick={() => onPlan(id)}>
            Plan passives for {dex?.name} →
          </button>
        </div>
      </header>

      <div className="sc-doss-grid">
        <section className="sc-card sc-in" style={stagger(2)}>
          <h2 className="sc-h3">Partner skill</h2>
          {partner ? (
            <>
              <p className="sc-partner-name">{partner.name}</p>
              <p className="sc-partner-desc">{partner.description}</p>
            </>
          ) : (
            <p className="sc-muted">None recorded.</p>
          )}
        </section>

        <section className="sc-card sc-in" style={stagger(3)}>
          <h2 className="sc-h3">Work suitability</h2>
          {work.length === 0 ? (
            <p className="sc-muted">None.</p>
          ) : (
            <ul className="sc-work">
              {work.map((w) => (
                <li key={w.job}>
                  <WorkIcon job={w.job} />
                  <span>{workName(w.job)}</span>
                  <i aria-label={`${w.level} of ${WORK_LEVEL_CAP}`}>
                    {Array.from({ length: WORK_LEVEL_CAP }, (_, n) => (
                      <b key={n} className={n < w.level ? 'on' : undefined} />
                    ))}
                  </i>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sc-card wide sc-in" style={stagger(4)}>
          <h2 className="sc-h3">
            Your collection <span>{mine.length ? `${mine.length} owned` : ''}</span>
          </h2>
          {mine.length === 0 ? (
            <p className="sc-muted">You don’t have a {dex?.name} yet.</p>
          ) : (
            <ul className="sc-mine">
              {mine.slice(0, 6).map((p) => (
                <li key={p.instanceId}>
                  <button onClick={() => onPal(p)}>
                    <b>{displayName(p)}</b>
                    <span>
                      Lv {p.level} · IV {ivTotal(p)}
                      {p.gender ? (p.gender === 'male' ? ' · ♂' : ' · ♀') : ''}
                    </span>
                    <TraitChips ids={p.passives} max={3} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {!UNBREEDABLE.has(id) && (
        <section className="sc-doss-breed">
          <h2 className="sc-h2">
            How to breed it <span>{recipes.length} recipes</span>
          </h2>

          {route && (
            <div className="sc-card route sc-in" style={stagger(1)}>
              <h3 className="sc-h3">
                Shortest route <span>{depth} step{depth === 1 ? '' : 's'} from what you own</span>
              </h3>
              <Tree root={route} />
              <p className="sc-legend">
                <i className="own" /> you have this <i className="make" /> bred from the pair on its left
              </p>
            </div>
          )}

          <div className="sc-card sc-in" style={stagger(2)}>
            <h3 className="sc-h3">
              Every parent pair <span>{readyCount} ready now</span>
            </h3>
            {ctx.combos === null ? (
              <p className="sc-muted">Loading the breeding matrix…</p>
            ) : (
              <ul className="sc-recipes">
                {shown.map(({ pair, rank }) => (
                  <li key={pair.join('+')} className={`rk-${rank}`}>
                    <ParentChip id={pair[0]} ctx={ctx} onOpen={onSpecies} />
                    <i className="x">×</i>
                    <ParentChip id={pair[1]} ctx={ctx} onOpen={onSpecies} />
                    <em>{rank === 0 ? 'Ready' : rank === 1 ? 'Need one more' : rank === 2 ? 'Wrong sexes' : 'Not owned'}</em>
                  </li>
                ))}
              </ul>
            )}
            {recipes.length > RECIPE_PAGE && (
              <button className="sc-btn ghost more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${recipes.length}`}
              </button>
            )}
          </div>
        </section>
      )}
    </article>
  );
}

/** A species as a compact card: a tree node. */
function SpeciesCard({ id, ctx, root, onOpen }: { id: string; ctx: Ctx; root: boolean; onOpen: (id: string) => void }) {
  const own = ctx.byPal.get(id);
  return (
    <button className={`sc-tcard ${root ? 'is-root' : own ? 'is-own' : 'is-make'} e-${elementOf(id)}`} onClick={() => onOpen(id)}>
      <span className="sc-tcard-art">
        <SpeciesArt id={id} />
      </span>
      <b>{nameOf(id)}</b>
      <small>{root ? 'the goal' : own ? `you have ×${own.length}` : 'breed this'}</small>
    </button>
  );
}

function ParentChip({ id, ctx, onOpen }: { id: string; ctx: Ctx; onOpen: (id: string) => void }) {
  const own = ctx.byPal.get(id);
  return (
    <button className={`sc-pchip${own ? ' own' : ''} e-${elementOf(id)}`} onClick={() => onOpen(id)}>
      <span className="sc-pchip-art">
        <SpeciesArt id={id} />
      </span>
      <b>{nameOf(id)}</b>
      {own && <small>×{own.length}</small>}
    </button>
  );
}
