import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { displayName, ivTotal, speciesName } from '../../components/PalCards.tsx';
import { useBrowse } from '../../lib/browse.ts';
import { passiveScore } from '../../lib/passiveCategories.ts';
import type { RosterPal } from '../../types.ts';
import { hideFromSpotlight, showInSpotlight } from '../../userdata/edit.ts';
import { readPrefs, writePrefs } from '../../userdata/store.ts';
import { Chevron, DEX, UNBREEDABLE, SpeciesArt, fmt, nameOf, rankFor } from './shared.tsx';
import { statusOf, type Ctx } from './ctx.ts';
import { BreedingPair } from './BreedingPair.tsx';
import {
  ELEMENTS,
  ElementChips,
  ElementIcon,
  RarityPips,
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
/** What the spotlight shows: your party, or your best pals ranked one of two ways. */
type SpotView = 'party' | SpotOrder;
/** The party in slot order. Hide does not apply: it is the team in use, never a "best of" list. */
const bySlot = (a: RosterPal, b: RosterPal): number => (a.location.slot ?? 99) - (b.location.slot ?? 99);
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
  onUpload,
}: {
  ctx: Ctx;
  onSpecies: (id: string) => void;
  onPal: (pal: RosterPal) => void;
  /** Browse mode only: back to the upload page. */
  onUpload?: () => void;
}) {
  const { roster, byPal } = ctx;
  // Browse mode (a visit with no save): every species as a silhouette to open, nothing owned or ranked.
  const browse = useBrowse();
  const [view, setView] = useState<View>('all');
  const [element, setElement] = useState<Element | 'all'>('all');
  // Phones fold the view switch and the element chips behind one button (docs/A11Y.md, item 10).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
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

  // The spotlight's view is a device preference (the last one picked); hidden pals belong to the world.
  // Until one is picked it opens on the party. The spotlight waits for the stored choice, so a
  // returning player never sees the party flash up first.
  const [picked, setPicked] = useState<SpotView | null>(null);
  const [prefsRead, setPrefsRead] = useState(false);
  useEffect(() => {
    void readPrefs()
      .then((p) => p.spotlight && setPicked(p.spotlight))
      .catch(() => undefined)
      .finally(() => setPrefsRead(true));
  }, []);
  const hidden = ctx.user.data?.hidden;

  const party = useMemo(() => roster.pals.filter((p) => p.location.kind === 'party').sort(bySlot), [roster]);
  // A stored "party" for a save with no party pals shows Potential and keeps the stored choice.
  const spotView: SpotView = picked === 'party' && !party.length ? 'potential' : picked ?? (party.length ? 'party' : 'potential');
  const chooseSpotView = (v: SpotView): void => {
    setPicked(v);
    void writePrefs({ spotlight: v });
  };

  const spotlight = useMemo(() => {
    if (spotView === 'party') return party;
    // Your best pal of each species (leaving out any you hid), best of those first.
    const better = ORDERS[spotView];
    const best = [...byPal.values()]
      .map((list) => list.filter((p) => !hidden?.[p.instanceId]).sort(better)[0])
      .filter((p): p is RosterPal => !!p);
    return best.sort(better).slice(0, SPOTLIGHT);
  }, [byPal, hidden, spotView, party]);

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
        {browse ? (
          <>
          <div className="sc-hero-copy sc-in" style={stagger(0)}>
            <p className="sc-kicker">Palworld compendium · browsing</p>
            <h1 className="sc-mega">
              Pal<span>Doc</span>
            </h1>
            <p className="sc-lede">
              All {SPECIES.length} species, each with every parent pair that breeds it. Open a pal, then open its parents to work back to
              something you can catch. With your own save, PalDoc does this for the pals you own.
            </p>
            {onUpload && (
              <button type="button" className="sc-btn" onClick={onUpload}>
                Upload your save
              </button>
            )}
          </div>
          <aside className="sc-card sc-howto sc-in" style={stagger(2)} aria-labelledby="howto-title">
            <h2 id="howto-title" className="sc-h3">
              Plan breeding by hand
            </h2>
            <ol>
              <li>
                <b>Open the pal you want.</b> Its page lists every pair of parents that breeds it.
              </li>
              <li>
                <b>Pick a pair.</b> Prefer parents you already have, or can catch in the wild.
              </li>
              <li>
                <b>Open a parent and repeat</b> until every parent in the chain is one you can get. Esc takes you back a step.
              </li>
            </ol>
          </aside>
          <div className="sc-pair-slot">
            <BreedingPair ctx={ctx} onSpecies={onSpecies} browse />
          </div>
          </>
        ) : (
          <div className="sc-hero-copy sc-in" style={stagger(0)}>
            <p className="sc-kicker">Palworld compendium · {roster.demo ? 'demo save' : 'your save'}</p>
            <h1 className="sc-mega">
              Pal<span>Doc</span>
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
        )}

        {!browse && prefsRead && spotlight.length > 0 && (
          <Spotlight
            pals={spotlight}
            view={spotView}
            hasParty={party.length > 0}
            onView={chooseSpotView}
            onOpen={onPal}
            onHide={(p) => ctx.user.edit((d) => hideFromSpotlight(d, p.instanceId, undefined, displayName(p)))}
            onUnhide={(p) => ctx.user.edit((d) => showInSpotlight(d, p.instanceId))}
          />
        )}
      </header>

      <section className={`sc-section${filtersOpen ? ' filters-open' : ''}`} aria-label="All species">
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
          {/* Shown on phones only (CSS); says which filters are on while they're folded away. */}
          <button
            type="button"
            className="sc-filtoggle"
            aria-expanded={filtersOpen}
            aria-controls={browse ? `${filtersId}-el` : `${filtersId}-view ${filtersId}-el`}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            Filters
            {(view !== 'all' || element !== 'all') && (
              <span>
                {[view !== 'all' && VIEWS.find(([k]) => k === view)?.[1], element !== 'all' && title(element)].filter(Boolean).join(' · ')}
              </span>
            )}
            <Chevron dir="right" />
          </button>
          {!browse && (
            <div className="sc-seg sc-dexfilter" id={`${filtersId}-view`} role="group" aria-label="Show">
              {VIEWS.map(([k, label]) => (
                <button key={k} className={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => setView(k)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sc-elbar sc-dexfilter" id={`${filtersId}-el`} role="group" aria-label="Element">
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
  const browse = useBrowse();
  const { status, depth } = browse ? { status: 'owned' as const, depth: 0 } : statusOf(ctx, id);
  const mine = ctx.byPal.get(id);
  const best = mine?.[0];
  const tier = tierOf(id);

  return (
    <button
      className={`sc-dex is-${status} tier-${tier} e-${elementOf(id)}`}
      style={stagger(Math.min(index, 40))}
      onClick={onOpen}
      aria-label={
        browse
          ? `${nameOf(id)}, ${tier}`
          : `${nameOf(id)}, ${tier}, ${status === 'owned' ? 'discovered' : status === 'ready' ? 'can be bred now' : 'not discovered'}${mine ? `, ${mine.length} owned` : ''}`
      }
    >
      <span className="sc-dex-no">{dexNo(id)}</span>
      {mine && <span className="sc-dex-count">×{mine.length}</span>}
      <span className="sc-dex-art">
        <SpeciesArt id={id} />
        <RarityPips tier={tier} />
      </span>
      <span className="sc-dex-name">{nameOf(id)}</span>
      <ElementChips id={id} />
      <span className="sc-dex-foot">
        {browse && UNBREEDABLE.has(id) && <b>Wild only</b>}
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
 * The spotlight: your party, or your best pals one per species. "Hide" takes a pal
 * out of the two best-pal views, never out of the save (saved with the world, listed in the settings to bring back) and the
 * next best moves up into its place; Undo is offered for a few seconds. The party view has no
 * Hide: it is the team in use. The switch picks the view: party, or best pals ranked by IV total
 * or by passives (a thin rule after Party says it is a different kind of view).
 */
function Spotlight({
  pals,
  view,
  hasParty,
  onView,
  onOpen,
  onHide,
  onUnhide,
}: {
  pals: RosterPal[];
  view: SpotView;
  hasParty: boolean;
  onView: (v: SpotView) => void;
  onOpen: (p: RosterPal) => void;
  onHide: (p: RosterPal) => void;
  onUnhide: (p: RosterPal) => void;
}) {
  // Changes only when asked: no auto-advance. Moving content is what NN/g found people
  // miss and dislike, and Baymard's carousel guidelines rule it out on mobile.
  const [i, setI] = useState(0);
  const [undo, setUndo] = useState<RosterPal | null>(null);
  const n = pals.length;
  const cur = i % n;
  const pal = pals[cur];
  const prevPal = pals[(cur + n - 1) % n];
  const nextPal = pals[(cur + 1) % n];

  // The info column is rebuilt for each pal (its entrance animation), so a control
  // that changed the pal is a new element afterwards. Remember which one had focus
  // and focus its replacement once the new pal is on screen.
  const aside = useRef<HTMLElement>(null);
  const refocus = useRef<'prev' | 'next' | 'dot' | null>(null);
  useEffect(() => {
    const k = refocus.current;
    if (!k) return;
    refocus.current = null;
    aside.current?.querySelector<HTMLElement>(k === 'dot' ? '.sc-dots button.on' : `.sc-spot-step[data-dir="${k}"]`)?.focus();
  }, [i]);
  const step = (d: 1 | -1): void => {
    refocus.current = d > 0 ? 'next' : 'prev';
    setI((cur + d + n) % n);
  };

  // Arrows, Home and End pick a pal and move focus with it.
  const dotKeys = (e: KeyboardEvent<HTMLElement>): void => {
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (cur + 1) % n
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (cur + n - 1) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    refocus.current = 'dot';
    setI(next);
  };

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
    <aside ref={aside} className={`sc-spot tier-${tierOf(id)} e-${elementOf(id)}`} aria-label={view === 'party' ? 'Your party' : 'Your strongest pals'}>
      {/* Says which pal is showing after a change; the visible counter is inside the rebuilt column. */}
      <p className="sr-only" role="status">
        Showing {displayName(pal)}, {cur + 1} of {n}.
      </p>
      <div className="sc-spot-stage" key={pal.instanceId}>
        <Stage id={id} pal={pal} />
      </div>

      <div className="sc-spot-info" key={`i-${pal.instanceId}`}>
        <div className="sc-spot-top">
          {/* Which view, then the pager under it, both on the right. Party first with a rule after it:
              it is a different kind of view (your team), where the other two rank your best pals. */}
          <span className="sc-seg sc-spot-order" role="group" aria-label="Show in the spotlight">
            {hasParty && (
              <>
                <button
                  type="button"
                  className={view === 'party' ? 'on' : ''}
                  aria-pressed={view === 'party'}
                  onClick={() => {
                    onView('party');
                    setI(0);
                  }}
                >
                  Party
                </button>
                <i className="sc-seg-rule" aria-hidden="true" />
              </>
            )}
            {(
              [
                ['potential', 'Potential'],
                ['passives', 'Passives'],
              ] as const
            ).map(([o, label]) => (
              <button
                key={o}
                type="button"
                className={view === o ? 'on' : ''}
                aria-pressed={view === o}
                onClick={() => {
                  onView(o);
                  setI(0);
                }}
              >
                {label}
              </button>
            ))}
          </span>
          {/* Previous and next grouped with the counter, outside the 3D frame: arrows
              on a slide invite accidental taps on it (Friedman, Smashing Magazine), and
              here dragging the frame turns the model. WCAG 2.5.7 asks for exactly these
              buttons as the non-drag way through a carousel. */}
          <span className="sc-spot-pager">
            {n > 1 && (
              <button type="button" className="sc-spot-step" data-dir="prev" onClick={() => step(-1)} aria-label={`Previous: ${displayName(prevPal)}`} title={`Previous: ${displayName(prevPal)}`}>
                <Chevron dir="left" />
              </button>
            )}
            {/* Just the position: the switch above already says which pals these are. */}
            <p className="sc-kicker sc-spot-count">
              {cur + 1} of {n}
            </p>
            {n > 1 && (
              <button type="button" className="sc-spot-step" data-dir="next" onClick={() => step(1)} aria-label={`Next: ${displayName(nextPal)}`} title={`Next: ${displayName(nextPal)}`}>
                <Chevron dir="right" />
              </button>
            )}
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
          {view !== 'party' && (
            <button
              className="sc-btn ghost"
              onClick={hide}
              aria-label={`Hide ${displayName(pal)} from the spotlight`}
              title="Hide from the spotlight. Your save isn't changed."
            >
              Hide
            </button>
          )}
          {/* One Tab stop; arrow keys move between pals (a roving tabindex). */}
          <span className="sc-dots" role="group" aria-label="Choose spotlight" onKeyDown={dotKeys}>
            {pals.map((p, k) => {
              const on = k === cur;
              return (
                <button
                  key={p.instanceId}
                  className={on ? 'on' : ''}
                  tabIndex={on ? 0 : -1}
                  aria-current={on || undefined}
                  aria-label={`Show ${displayName(p)}`}
                  onClick={() => setI(k)}
                />
              );
            })}
          </span>
        </div>
        <p className="sc-spot-undo" role="status">
          {undo && (
            <>
              {displayName(undo)} hidden from the spotlight.{' '}
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
