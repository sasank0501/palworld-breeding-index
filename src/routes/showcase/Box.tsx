import { useMemo, useState } from 'react';

import { Portrait, displayName, ivTotal, palLabel, passiveLabel, speciesName } from '../../components/PalCards.tsx';
import type { RosterPal } from '../../types.ts';
import { isFavourite, toggleFavourite } from '../../userdata/edit.ts';
import { FavStar } from './Fav.tsx';
import { rankFor } from './shared.tsx';
import type { Ctx } from './ctx.ts';
import { TraitChips, elementOf, stagger, tierOf } from './parts.tsx';

const PAGE = 60;

type SortKey = 'iv' | 'level' | 'traits' | 'name';
const SORTS: Array<[SortKey, string]> = [
  ['iv', 'Potential'],
  ['level', 'Level'],
  ['traits', 'Passives'],
  ['name', 'A–Z'],
];

const DRAWERS: Array<[string, string]> = [
  ['all', 'All'],
  ['party', 'Party'],
  ['base', 'Base'],
  ['palbox', 'Pal Box'],
  ['dimension', 'Dimensional'],
];

/** Passive weight: good ranks add, flaws subtract. */
const traitScore = (p: RosterPal): number => p.passives.reduce((n, id) => n + (rankFor(id) ?? 0), 0);

/** Every pal you own, as collectible tiles. Filters sit on one line; the pal opens its own sheet. */
export function Box({ ctx, onPal }: { ctx: Ctx; onPal: (p: RosterPal, list: RosterPal[]) => void }) {
  const { roster } = ctx;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('iv');
  const [drawer, setDrawer] = useState('all');
  const [alpha, setAlpha] = useState(false);
  const [lucky, setLucky] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const { data: user, edit } = ctx.user;
  const [shown, setShown] = useState(PAGE);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = roster.pals.filter((p) => {
      if (drawer !== 'all' && p.location.kind !== drawer) return false;
      if (alpha && !p.isBoss) return false;
      if (lucky && !p.isLucky) return false;
      if (favOnly && !(user && p.instanceId && isFavourite(user, p.instanceId))) return false;
      return !q || `${displayName(p)} ${speciesName(p)} ${p.passives.map(passiveLabel).join(' ')}`.toLowerCase().includes(q);
    });
    out.sort((a, b) => {
      switch (sort) {
        case 'iv':
          return ivTotal(b) - ivTotal(a) || b.level - a.level;
        case 'level':
          return b.level - a.level || ivTotal(b) - ivTotal(a);
        case 'traits':
          return traitScore(b) - traitScore(a) || ivTotal(b) - ivTotal(a);
        case 'name':
          return displayName(a).localeCompare(displayName(b));
      }
    });
    return out;
  }, [roster, query, sort, drawer, alpha, lucky, favOnly, user]);

  const reset = (): void => setShown(PAGE);

  return (
    <>
      <header className="sc-bhero">
        <p className="sc-kicker sc-in" style={stagger(0)}>
          Your collection
        </p>
        <h1 className="sc-bbig sc-in" style={stagger(1)}>
          <b>{roster.pals.length.toLocaleString('en')}</b> pals <span>and counting</span>
        </h1>
        <dl className="sc-bstats sc-in" style={stagger(2)}>
          {DRAWERS.slice(1).map(([k, label]) => (
            <div key={k}>
              <dt>{label}</dt>
              <dd>{(roster.counts as Record<string, number>)[k] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="sc-section">
        <div className="sc-bar">
          <label className="sc-search">
            <input
              value={query}
              placeholder="Search name, nickname or passive…"
              onChange={(e) => {
                setQuery(e.target.value);
                reset();
              }}
            />
          </label>
          <div className="sc-seg" role="group" aria-label="Where">
            {DRAWERS.map(([k, label]) => (
              <button
                key={k}
                className={drawer === k ? 'on' : ''}
                aria-pressed={drawer === k}
                onClick={() => {
                  setDrawer(k);
                  reset();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="sc-seg" role="group" aria-label="Sort">
            {SORTS.map(([k, label]) => (
              <button
                key={k}
                className={sort === k ? 'on' : ''}
                aria-pressed={sort === k}
                onClick={() => {
                  setSort(k);
                  reset();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button className={`sc-flag${alpha ? ' on' : ''}`} aria-pressed={alpha} onClick={() => { setAlpha(!alpha); reset(); }}>
            Alpha
          </button>
          <button className={`sc-flag lucky${lucky ? ' on' : ''}`} aria-pressed={lucky} onClick={() => { setLucky(!lucky); reset(); }}>
            Lucky
          </button>
          <button className={`sc-flag${favOnly ? ' on' : ''}`} aria-pressed={favOnly} onClick={() => { setFavOnly(!favOnly); reset(); }}>
            ★ Favourites
          </button>
          <span className="sc-count">{list.length.toLocaleString('en')} shown</span>
        </div>

        <div className="sc-dexgrid" key={`${query}|${sort}|${drawer}|${alpha}|${lucky}|${favOnly}`}>
          {list.slice(0, shown).map((p, i) => (
            <div className="sc-palwrap" key={p.instanceId || `${p.characterId}-${i}`}>
              <PalTile pal={p} index={i} onOpen={() => onPal(p, list)} />
              {user && p.instanceId && (
                <FavStar
                  className="sc-cardstar"
                  style={stagger(Math.min(i, 40))}
                  name={displayName(p)}
                  on={isFavourite(user, p.instanceId)}
                  onToggle={() => edit((d) => toggleFavourite(d, p.instanceId, undefined, palLabel(p)))}
                />
              )}
            </div>
          ))}
          {list.length === 0 && <p className="sc-empty">{favOnly ? 'No favourites yet. Tap the star on a pal to add one.' : 'No pal matches that.'}</p>}
        </div>
        {shown < list.length && (
          <button className="sc-btn ghost more" onClick={() => setShown((n) => n + PAGE)}>
            Show more · {(list.length - shown).toLocaleString('en')} left
          </button>
        )}
      </section>
    </>
  );
}

function PalTile({ pal, index, onOpen }: { pal: RosterPal; index: number; onOpen: () => void }) {
  const id = pal.palId ?? '';
  const iv = ivTotal(pal);
  return (
    <button className={`sc-dex is-owned sc-pal tier-${tierOf(id)} e-${elementOf(id)}`} style={stagger(Math.min(index, 40))} onClick={onOpen}>
      <span className="sc-dex-no">
        Lv {pal.level}
        {pal.gender ? (pal.gender === 'male' ? ' ♂' : ' ♀') : ''}
      </span>
      {(pal.isBoss || pal.isLucky) && (
        <span className="sc-dex-flags">
          {pal.isBoss && <span className="sc-tag alpha">Alpha</span>}
          {pal.isLucky && <span className="sc-tag lucky">Lucky</span>}
        </span>
      )}
      <span className="sc-dex-art">
        <Portrait pal={pal} />
      </span>
      <span className="sc-dex-name">{displayName(pal)}</span>
      <span className="sc-pal-ivs" title={`HP ${pal.ivs.hp} · ATK ${pal.ivs.attack} · DEF ${pal.ivs.defense}`}>
        {[pal.ivs.hp, pal.ivs.attack, pal.ivs.defense].map((v, n) => (
          <i key={n} className={v >= 80 ? 'top' : ''}>
            <b style={{ width: `${v}%` }} />
          </i>
        ))}
      </span>
      <span className="sc-dex-foot">
        <b>IV {iv}</b>
        <TraitChips ids={pal.passives} max={2} />
      </span>
    </button>
  );
}
