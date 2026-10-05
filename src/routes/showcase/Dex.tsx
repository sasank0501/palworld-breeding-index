import { useEffect, useMemo, useState } from 'react';

import { displayName, ivTotal, speciesName } from '../../components/PalCards.tsx';
import { passiveScore } from '../../lib/passiveCategories.ts';
import type { RosterPal } from '../../types.ts';
import { hideFromSpotlight, showInSpotlight } from '../../userdata/edit.ts';
import { readPrefs, writePrefs } from '../../userdata/store.ts';
import { DEX, UNBREEDABLE, SpeciesArt, fmt, nameOf, rankFor } from './shared.tsx';
import { statusOf, type Ctx } from './ctx.ts';
import {
  ELEMENTS,
  ElementChips,
  ElementIcon,
  Ring,
  Stage,
  TraitChips,
  dexOrder,
  elementOf,
  stagger,
  tierOf,
  title,
  type Element,
} from './parts.tsx';

const SPECIES = Object.values(DEX).sort((a, b) => dexOrder(a.id) - dexOrder(b.id));

const dexNo = (id: string): string => {
  const d = DEX[id];
  return `#${String(d?.num ?? '').padStart(3, '0')}${d && d.variant > 0 ? String.fromCharCode(64 + d.variant + 1) : ''}`;
};

type View = 'all' | 'owned' | 'ready' | 'missing';
const VIEWS: Array<[View, string]> = [
  ['all', 'All'],
  ['owned', 'Discovered'],
  ['ready', 'Within reach'],
  ['missing', 'Undiscovered'],
];

const SPOTLIGHT = 8;

type SpotOrder = 'potential' | 'passives';
const passivesOf = (p: RosterPal): number => passiveScore(p.passives.map(rankFor));
/** Best first. Potential: IV total. Passives: the passive score, IVs breaking ties. */
const ORDERS: Record<SpotOrder, (a: RosterPal, b: RosterPal) => number> = {
  potential: (a, b) => ivTotal(b) - ivTotal(a) || b.level - a.level,
  passives: (a, b) => passivesOf(b) - passivesOf(a) || ivTotal(b) - ivTotal(a) || b.level - a.level,
};

/**
 * Home: the Paldex as a showcase. A spotlight on your strongest pals up top, then
 * all 289 species as a collectible grid: discovered ones in colour, ones you can
 * breed right now glowing, the rest as silhouettes that reveal on hover.
 */
export function Dex({
  ctx,
  onSpecies,
  onPal,
}: {
  ctx: Ctx;
  onSpecies: (id: string) => void;
  onPal: (pal: RosterPal) => void;
}) {
  const { roster, byPal } = ctx;
  const [view, setView] = useState<View>('all');
  const [element, setElement] = useState<Element | 'all'>('all');
  const [query, setQuery] = useState('');

  const stats = useMemo(
    () => ({
      species: byPal.size,
      alphas: roster.pals.filter((p) => p.isBoss).length,
      lucky: roster.pals.filter((p) => p.isLucky).length,
      strong: roster.pals.filter((p) => ivTotal(p) >= 270).length,
    }),
    [roster, byPal],
  );

  // The spotlight's order is a device preference; hidden pals belong to the world.
  const [order, setOrder] = useState<SpotOrder>('potential');
  useEffect(() => {
    void readPrefs().then((p) => p.spotlight && setOrder(p.spotlight));
  }, []);
  const chooseOrder = (o: SpotOrder): void => {
    setOrder(o);
    void writePrefs({ spotlight: o });
  };
  const hidden = ctx.user.data?.hidden;

  const spotlight = useMemo(() => {
    // Your best pal of each species (leaving out any you hid), best of those first.
    const better = ORDERS[order];
    const best = [...byPal.values()]
      .map((list) => list.filter((p) => !hidden?.[p.instanceId]).sort(better)[0])
      .filter((p): p is RosterPal => !!p);
    return best.sort(better).slice(0, SPOTLIGHT);
  }, [byPal, hidden, order]);

  const elementCounts = useMemo(() => {
    const m = new Map<Element, number>();
    for (const d of SPECIES) m.set(elementOf(d.id), (m.get(elementOf(d.id)) ?? 0) + 1);
    return m;
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SPECIES.filter((d) => {
      const { status } = statusOf(ctx, d.id);
      if (view === 'owned' && status !== 'owned') return false;
      if (view === 'ready' && status !== 'ready') return false;
      if (view === 'missing' && status === 'owned') return false;
      if (element !== 'all' && !d.types.includes(element)) return false;
      return !q || d.name.toLowerCase().includes(q) || d.num === q;
    });
  }, [ctx, view, element, query]);

  const ready = ctx.reach ? [...ctx.reach.depth.values()].filter((d) => d === 1).length : 0;

  return (
    <>
      <header className="sc-hero">
        <div className="sc-hero-copy sc-in" style={stagger(0)}>
          <p className="sc-kicker">Palworld compendium · {roster.demo ? 'demo save' : 'your save'}</p>
          <h1 className="sc-mega">
            Pal<span>dex</span>
          </h1>
          <p className="sc-lede">
            {fmt.format(roster.pals.length)} pals in your boxes. {stats.species} of {SPECIES.length} species discovered
            {ctx.reach ? `, and ${ready} more you can breed right now.` : '.'}
          </p>

          <div className="sc-hero-stats">
            <Ring
              value={stats.species}
              max={SPECIES.length}
              label={
                <>
                  <b>{Math.round((stats.species / SPECIES.length) * 100)}%</b>
                  <small>complete</small>
                </>
              }
            />
            <dl>
              <div>
                <dt>Discovered</dt>
                <dd>
                  {stats.species}
                  <small>/{SPECIES.length}</small>
                </dd>
              </div>
              <div>
                <dt>Alphas</dt>
                <dd>{stats.alphas}</dd>
              </div>
              <div>
                <dt>Lucky</dt>
                <dd>{stats.lucky}</dd>
              </div>
              <div>
                <dt>IV 270+</dt>
                <dd>{stats.strong}</dd>
              </div>
            </dl>
          </div>
        </div>

        {spotlight.length > 0 && (
          <Spotlight
            pals={spotlight}
            order={order}
            onOrder={chooseOrder}
            onOpen={onPal}
            onHide={(p) => ctx.user.edit((d) => hideFromSpotlight(d, p.instanceId, undefined, displayName(p)))}
            onUnhide={(p) => ctx.user.edit((d) => showInSpotlight(d, p.instanceId))}
          />
        )}
      </header>

      <section className="sc-section" aria-label="All species">
        <div className="sc-bar">
          <h2 className="sc-h2">
            The Paldex <span>{visible.length} shown</span>
          </h2>
          <span className="sr-only" role="status">
            {visible.length} shown
          </span>
          <label className="sc-search">
            <input value={query} aria-label="Search the Paldex by name or number" placeholder="Search name or number…" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="sc-seg" role="group" aria-label="Show">
            {VIEWS.map(([k, label]) => (
              <button key={k} className={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="sc-elbar" role="group" aria-label="Element">
          <button className={element === 'all' ? 'on' : ''} aria-pressed={element === 'all'} onClick={() => setElement('all')}>
            All <span>{SPECIES.length}</span>
          </button>
          {ELEMENTS.map((e) => (
            <button
              key={e}
              className={`e-${e}${element === e ? ' on' : ''}`}
              aria-pressed={element === e}
              onClick={() => setElement(element === e ? 'all' : e)}
            >
              <ElementIcon element={e} size={16} />
              {title(e)} <span>{elementCounts.get(e) ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="sc-dexgrid" key={`${view}|${element}|${query}`}>
          {visible.map((d, i) => (
            <DexTile key={d.id} id={d.id} ctx={ctx} index={i} onOpen={() => onSpecies(d.id)} />
          ))}
          {visible.length === 0 && <p className="sc-empty">No species match that.</p>}
        </div>
      </section>
    </>
  );
}

function DexTile({ id, ctx, index, onOpen }: { id: string; ctx: Ctx; index: number; onOpen: () => void }) {
  const { status, depth } = statusOf(ctx, id);
  const mine = ctx.byPal.get(id);
  const best = mine?.[0];
  const tier = tierOf(id);

  return (
    <button
      className={`sc-dex is-${status} tier-${tier} e-${elementOf(id)}`}
      style={stagger(Math.min(index, 40))}
      onClick={onOpen}
      aria-label={`${nameOf(id)}, ${status === 'owned' ? 'discovered' : status === 'ready' ? 'can be bred now' : 'not discovered'}${mine ? `, ${mine.length} owned` : ''}`}
    >
      <span className="sc-dex-no">{dexNo(id)}</span>
      {mine && <span className="sc-dex-count">×{mine.length}</span>}
      <span className="sc-dex-art">
        <SpeciesArt id={id} />
      </span>
      <span className="sc-dex-name">{nameOf(id)}</span>
      <ElementChips id={id} />
      <span className="sc-dex-foot">
        {status === 'owned' && best && <b>IV {ivTotal(best)}</b>}
        {status === 'ready' && <b className="go">Breed now</b>}
        {status === 'far' && <b>{depth} steps</b>}
        {status === 'lost' && <b className="dim">{UNBREEDABLE.has(id) ? 'Wild only' : 'No route'}</b>}
        {status === 'unknown' && <b className="dim">…</b>}
      </span>
    </button>
  );
}

/**
 * The spotlight: your best pals, one per species, cycling. "Not this one" takes
 * the pal out (saved with the world, listed in the settings to bring back) and the
 * next best moves up into its place; Undo is offered for a few seconds. The order
 * switch ranks by IV total or by passives.
 */
function Spotlight({
  pals,
  order,
  onOrder,
  onOpen,
  onHide,
  onUnhide,
}: {
  pals: RosterPal[];
  order: SpotOrder;
  onOrder: (o: SpotOrder) => void;
  onOpen: (p: RosterPal) => void;
  onHide: (p: RosterPal) => void;
  onUnhide: (p: RosterPal) => void;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [undo, setUndo] = useState<RosterPal | null>(null);
  const pal = pals[i % pals.length];

  useEffect(() => {
    if (paused || undo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % pals.length), 9000);
    return () => window.clearInterval(t);
  }, [paused, undo, pals.length]);

  // Undo stays on offer for 8 seconds after a pal is hidden.
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(t);
  }, [undo]);

  const hide = (): void => {
    onHide(pal);
    setUndo(pal);
  };

  const id = pal.palId ?? '';
  const iv = ivTotal(pal);

  return (
    <aside
      className={`sc-spot tier-${tierOf(id)} e-${elementOf(id)}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Your strongest pals"
    >
      <div className="sc-spot-stage" key={pal.instanceId}>
        <Stage id={id} pal={pal} />
      </div>

      <div className="sc-spot-info" key={`i-${pal.instanceId}`}>
        <div className="sc-spot-top">
          <p className="sc-kicker">
            {order === 'passives' ? 'Best passives' : 'Top potential'} · {(i % pals.length) + 1} of {pals.length}
          </p>
          <span className="sc-seg sc-spot-order" role="group" aria-label="Rank the spotlight by">
            {(
              [
                ['potential', 'Potential'],
                ['passives', 'Passives'],
              ] as const
            ).map(([o, label]) => (
              <button
                key={o}
                type="button"
                className={order === o ? 'on' : ''}
                aria-pressed={order === o}
                onClick={() => {
                  onOrder(o);
                  setI(0);
                }}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
        <h2 className="sc-spot-name">{displayName(pal)}</h2>
        <p className="sc-spot-sub">
          {pal.nickname ? `${speciesName(pal)} · ` : ''}Lv {pal.level} · <ElementChips id={id} labels />
          {pal.isBoss && <span className="sc-tag alpha">Alpha</span>}
          {pal.isLucky && <span className="sc-tag lucky">Lucky</span>}
        </p>

        <div className="sc-ivs">
          {(
            [
              ['HP', pal.ivs.hp],
              ['ATK', pal.ivs.attack],
              ['DEF', pal.ivs.defense],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className={v >= 80 ? 'top' : ''}>
              <span>{label}</span>
              <i>
                <b style={{ width: `${v}%` }} />
              </i>
              <em>{v}</em>
            </div>
          ))}
          <p className="sc-iv-total">
            <b>{iv}</b> / 300 potential
          </p>
        </div>

        <TraitChips ids={pal.passives} />

        <div className="sc-spot-actions">
          <button className="sc-btn" onClick={() => onOpen(pal)}>
            Open pal
          </button>
          <button className="sc-btn ghost" onClick={hide} title="Leave this pal out of the spotlight; the next best takes its place">
            Not this one
          </button>
          <span className="sc-dots" role="group" aria-label="Choose spotlight">
            {pals.map((p, n) => (
              <button
                key={p.instanceId}
                className={n === i % pals.length ? 'on' : ''}
                aria-label={`Show ${displayName(p)}`}
                onClick={() => setI(n)}
              />
            ))}
          </span>
        </div>
        <p className="sc-spot-undo" role="status">
          {undo && (
            <>
              {displayName(undo)} won't appear here.{' '}
              <button
                type="button"
                className="sc-link"
                onClick={() => {
                  onUnhide(undo);
                  setUndo(null);
                }}
              >
                Undo
              </button>
            </>
          )}
        </p>
      </div>
    </aside>
  );
}
