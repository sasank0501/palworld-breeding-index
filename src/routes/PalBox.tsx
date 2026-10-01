import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import {
  DENSITY_LAYOUT,
  DensityToggle,
  PalDetail,
  PalTradingCard,
  displayName,
  ivTotal,
  passiveLabel,
  useDensity,
} from '../components/PalCards.tsx';
import type { Roster, RosterPal } from '../types.ts';

/** Matches the grid gap in design.css; the column maths below depends on it. */
const GAP = 16;

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

const soulTotal = (p: RosterPal): number => p.souls.hp + p.souls.attack + p.souls.defense + p.souls.craftSpeed;

export default function PalBox({ roster }: { roster: Roster }) {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('level');
  const [passiveFilter, setPassiveFilter] = useState('');
  const [onlyAlpha, setOnlyAlpha] = useState(false);
  const [onlyLucky, setOnlyLucky] = useState(false);
  const [minIv, setMinIv] = useState(0);
  const [density, setDensity] = useDensity();
  const [selected, setSelected] = useState<RosterPal | null>(null);

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

    // Nicknamed pals lead whatever the sort: naming one is how a player marks
    // it as important.
    out.sort((a, b) => {
      const named = Number(b.nickname !== null) - Number(a.nickname !== null);
      if (named) return named;
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
  // Columns follow the size preset exactly as the CSS presets do: the preset's
  // column count, minus however many would push a card below its floor width.
  // Row height is measured from the rendered cards (the portrait is square, so
  // height tracks width) rather than assumed.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cols: maxCols, floor } = DENSITY_LAYOUT[density];
  const cols = Math.max(1, Math.min(maxCols, Math.floor((width + GAP) / (floor + GAP))));
  const rowCount = Math.ceil(filtered.length / cols);
  const cardWidth = width ? (width - (cols - 1) * GAP) / cols : floor;
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    // A first guess only (square portrait + header + stats); measureElement
    // replaces it with the real height once a row renders.
    estimateSize: () => cardWidth + (density === 'compact' ? 70 : 230) + GAP,
    overscan: 3,
  });

  // Jumping back to the top on a filter change avoids landing in empty space.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [filtered, virtualizer]);

  return (
    // .dp-page carries the card and detail tokens, which follow the theme
    // toggle. The detail page opens over the list rather than replacing it, so
    // Back lands on the same scroll position.
    <div className="app dp-page dl-page box-page">
      <header className="topbar">
        <div className="titles">
          <h1>Pal Box</h1>
          <span className="muted">
            {roster.demo
              ? `${roster.counts.total} pals · demo save (import your own with npm run import-save)`
              : `${roster.counts.total} pals · world ${roster.world.slice(0, 8)} · imported ${new Date(roster.exportedAt).toLocaleString()}`}
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
        <DensityToggle value={density} onChange={setDensity} />
        <span className="count">{filtered.length} shown</span>
      </div>

      <div className="scroll" ref={scrollRef}>
        <div className="grid-space" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const start = row.index * cols;
            const items = filtered.slice(start, start + cols);
            return (
              <div
                // Keyed by layout too: a column or size change remounts the row,
                // and a remount is what makes measureElement read it again.
                key={`${row.key}-${cols}-${density}`}
                ref={virtualizer.measureElement}
                data-index={row.index}
                className={`grid-row density-${density}`}
                style={{
                  transform: `translateY(${row.start}px)`,
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {items.map((p) => (
                  <PalTradingCard key={p.instanceId || `${p.characterId}-${start}`} pal={p} onOpen={() => setSelected(p)} />
                ))}
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && <p className="nothing">Nothing matches those filters.</p>}
      </div>

      {selected && (
        <div className="box-detail">
          <PalDetail pal={selected} onBack={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
