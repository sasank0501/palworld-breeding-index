import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import palsJson from '../data/pals.json';
import passivesJson from '../data/passives.json';
import type { PalDex, PassiveInfo, Roster, RosterPal } from '../types.ts';

const DEX = palsJson as unknown as Record<string, PalDex>;
const PASSIVES = passivesJson as unknown as Record<string, PassiveInfo>;

// Portraits are 100x100 at source, so the art box is exactly that — anything
// larger upscales and softens, anything non-square crops the pal.
const CARD_HEIGHT = 214;
const CARD_MIN_WIDTH = 300;
const GAP = 12;

type SortKey = 'level' | 'ivTotal' | 'rank' | 'name' | 'passives';

const LOCATIONS = [
  ['all', 'Everywhere'],
  ['palbox', 'Pal Box'],
  ['dimension', 'Dimensional Pal Storage'],
  ['party', 'Party'],
  ['base', 'Base camps'],
  ['global', 'Global storage'],
  ['unknown', 'Unknown'],
] as const;

const SORTS: Array<[SortKey, string]> = [
  ['level', 'Level'],
  ['ivTotal', 'IV total'],
  ['rank', 'Condenser rank'],
  ['passives', 'Passive count'],
  ['name', 'Name'],
];

const ivTotal = (p: RosterPal): number => p.ivs.hp + p.ivs.attack + p.ivs.defense;
const soulTotal = (p: RosterPal): number => p.souls.hp + p.souls.attack + p.souls.defense + p.souls.craftSpeed;

const dexOf = (p: RosterPal): PalDex | undefined => (p.palId ? DEX[p.palId] : undefined);
const displayName = (p: RosterPal): string => dexOf(p)?.name ?? p.characterId;

/** Tier drives the chip colour; unverified ids stay grey rather than pretending. */
function tierClass(info: PassiveInfo | undefined): string {
  if (!info || info.name === null) return 'tier-unknown';
  const t = info.tier;
  if (t === 'diamond') return 'tier-diamond';
  if (typeof t === 'number') {
    if (t >= 3) return 'tier-3';
    if (t === 2) return 'tier-2';
    if (t === 1) return 'tier-1';
    return 'tier-neg';
  }
  return 'tier-unknown';
}

const passiveLabel = (id: string): string => PASSIVES[id]?.name ?? id;

function passiveTitle(id: string): string {
  const info = PASSIVES[id];
  if (!info || !info.name) return `${id} (name not verified)`;
  return info.effects.length ? `${info.name} — ${info.effects.join(', ')}` : info.name;
}

export default function PalBox({ roster }: { roster: Roster }) {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('level');
  const [passiveFilter, setPassiveFilter] = useState('');
  const [onlyAlpha, setOnlyAlpha] = useState(false);
  const [onlyLucky, setOnlyLucky] = useState(false);
  const [minIv, setMinIv] = useState(0);

  // Every passive present in the save, so the dropdown reflects reality.
  const passiveOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const p of roster.pals) for (const s of p.passives) ids.add(s);
    return [...ids].sort((a, b) => passiveLabel(a).localeCompare(passiveLabel(b)));
  }, [roster]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = roster.pals.filter((p) => {
      if (location !== 'all' && p.location.kind !== location) return false;
      if (onlyAlpha && !p.isBoss) return false;
      if (onlyLucky && !p.isLucky) return false;
      if (minIv > 0 && ivTotal(p) < minIv) return false;
      if (passiveFilter && !p.passives.includes(passiveFilter)) return false;
      if (q) {
        const hay =
          `${displayName(p)} ${p.nickname ?? ''} ${p.characterId} ${p.passives.map(passiveLabel).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    out.sort((a, b) => {
      switch (sort) {
        case 'level':
          return b.level - a.level || ivTotal(b) - ivTotal(a);
        case 'ivTotal':
          return ivTotal(b) - ivTotal(a) || b.level - a.level;
        case 'rank':
          return b.rank - a.rank || soulTotal(b) - soulTotal(a);
        case 'passives':
          return b.passives.length - a.passives.length || ivTotal(b) - ivTotal(a);
        case 'name':
          return displayName(a).localeCompare(displayName(b)) || b.level - a.level;
      }
    });
    return out;
  }, [roster, query, location, sort, passiveFilter, onlyAlpha, onlyLucky, minIv]);

  // --- virtualised grid -----------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setCols(Math.max(1, Math.floor((w + GAP) / (CARD_MIN_WIDTH + GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(filtered.length / cols);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: 4,
  });

  // Jumping back to the top on a filter change avoids landing in empty space.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [filtered, virtualizer]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="titles">
          <h1>Pal Box</h1>
          <span className="muted">
            {roster.counts.total} pals · world {roster.world.slice(0, 8)} · imported{' '}
            {new Date(roster.exportedAt).toLocaleString()}
          </span>
        </div>
        <div className="tallies">
          {(['palbox', 'dimension', 'party', 'base', 'global'] as const).map((k) =>
            roster.counts[k] ? (
              <span key={k} className={`tally loc-${k}`}>
                {k} {roster.counts[k]}
              </span>
            ) : null,
          )}
        </div>
      </header>

      <div className="controls">
        <input
          className="search"
          placeholder="Search name, nickname or passive…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          {LOCATIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select value={passiveFilter} onChange={(e) => setPassiveFilter(e.target.value)}>
          <option value="">Any passive</option>
          {passiveOptions.map((id) => (
            <option key={id} value={id}>
              {passiveLabel(id)}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map(([v, label]) => (
            <option key={v} value={v}>
              Sort: {label}
            </option>
          ))}
        </select>
        <label className="slider">
          Min IV {minIv}
          <input type="range" min={0} max={300} step={10} value={minIv} onChange={(e) => setMinIv(+e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyAlpha} onChange={(e) => setOnlyAlpha(e.target.checked)} /> Alpha
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyLucky} onChange={(e) => setOnlyLucky(e.target.checked)} /> Lucky
        </label>
        <span className="count">{filtered.length} shown</span>
      </div>

      <div className="scroll" ref={scrollRef}>
        <div className="grid-space" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const start = row.index * cols;
            const items = filtered.slice(start, start + cols);
            return (
              <div
                key={row.key}
                className="grid-row"
                style={{
                  transform: `translateY(${row.start}px)`,
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {items.map((p) => (
                  <PalCard key={p.instanceId || `${p.characterId}-${start}`} pal={p} />
                ))}
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && <p className="nothing">Nothing matches those filters.</p>}
      </div>
    </div>
  );
}

function PalCard({ pal }: { pal: RosterPal }) {
  const dex = dexOf(pal);
  const [imgFailed, setImgFailed] = useState(false);
  const total = ivTotal(pal);
  const souls = soulTotal(pal);

  return (
    <article className={`card${pal.isBoss ? ' is-alpha' : ''}${pal.isLucky ? ' is-lucky' : ''}`}>
      <div className="card-top">
        <div className="portrait">
          {dex?.img && !imgFailed ? (
            <img src={`/${dex.img}`} alt="" loading="lazy" onError={() => setImgFailed(true)} />
          ) : (
            <span className="portrait-fallback">{displayName(pal).slice(0, 2)}</span>
          )}
          <span className={`loc loc-${pal.location.kind}`}>{pal.location.kind}</span>
        </div>

        <div className="body">
          <div className="name-row">
            <strong className="name">{displayName(pal)}</strong>
            {pal.gender && <span className={`gender ${pal.gender}`}>{pal.gender === 'male' ? '♂' : '♀'}</span>}
          </div>
          {pal.nickname && <div className="nick">“{pal.nickname}”</div>}

          <div className="badges">
            <span className="lvl">Lv {pal.level}</span>
            {pal.rank > 1 && <span className="stars">{'★'.repeat(pal.rank - 1)}</span>}
            {pal.isBoss && <span className="tag alpha">Alpha</span>}
            {pal.isLucky && <span className="tag lucky">Lucky</span>}
            {pal.isAwakened && <span className="tag awake">Awakened</span>}
            {souls > 0 && <span className="tag souls">souls {souls}</span>}
          </div>

          <div className="ivs">
            {(
              [
                ['HP', pal.ivs.hp],
                ['ATK', pal.ivs.attack],
                ['DEF', pal.ivs.defense],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="iv">
                <span className="iv-label">{label}</span>
                <span className="bar">
                  <span className={`fill ${v >= 70 ? 'good' : v >= 40 ? 'mid' : 'low'}`} style={{ width: `${v}%` }} />
                </span>
                <span className="iv-val">{v}</span>
              </div>
            ))}
            <div className="iv-total">{total}/300</div>
          </div>
        </div>
      </div>

      {/* Passives span the full card width so four chips fit on one or two rows
          instead of stacking down a narrow column. */}
      <div className="passives">
        {pal.passives.length === 0 && <span className="no-passives">no passives</span>}
        {pal.passives.map((id) => (
          <span key={id} className={`chip ${tierClass(PASSIVES[id])}`} title={passiveTitle(id)}>
            {passiveLabel(id)}
          </span>
        ))}
      </div>
    </article>
  );
}
