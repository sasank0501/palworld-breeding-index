import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import palsJson from '../data/pals.json';
import passivesJson from '../data/passives.json';
import skillsJson from '../data/skills.json';
import { WORK_LEVEL_CAP, workBonuses, workName, workOrder } from '../data/work.ts';
import { RankMark } from './RankMark.tsx';
import { rankClass, rankOf, rankSort } from '../lib/passiveCategories.ts';
import { PalModel } from '../design/PalModel.tsx';
import { stripBoss } from '../save/species.ts';
import { FOOD_SLOTS, foodFor, levelProgress, partnerSkillFor, rarityFor, rarityTier } from '../design/palExtras.ts';
import type { ActiveSkill, PalDex, PassiveInfo, RosterPal } from '../types.ts';
import '../design/design.css';

const DEX = palsJson as unknown as Record<string, PalDex>;
const PASSIVES = passivesJson as unknown as Record<string, PassiveInfo>;
const SKILLS = skillsJson as unknown as Record<string, ActiveSkill>;

/**
 * The pal card and the pal detail page, as used by the Pal Box tab. Settled in
 * a design sandbox against the real roster, then moved here.
 *
 * Styles live in src/design/design.css (dl- card, dp- detail). Partner skill,
 * food and the exp curve are species data the save lacks — see
 * src/design/palExtras.ts.
 */

/** Only these nine appear in pals.json; anything else falls back to neutral. */
const ELEMENTS = new Set([
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'ground',
  'dark',
  'dragon',
  'neutral',
]);

const dexOf = (p: RosterPal): PalDex | undefined => (p.palId ? DEX[p.palId] : undefined);
export const speciesName = (p: RosterPal): string => dexOf(p)?.name ?? p.characterId;
/** A nickname is the player's own name for the pal, so it wins over the species. */
export const displayName = (p: RosterPal): string => p.nickname ?? speciesName(p);
export const ivTotal = (p: RosterPal): number => p.ivs.hp + p.ivs.attack + p.ivs.defense;

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const passiveLabel = (id: string): string => PASSIVES[id]?.name ?? id;

function passiveTitle(id: string): string {
  const info = PASSIVES[id];
  if (!info || !info.name) return `${id} (name not verified)`;
  return info.effects.length ? `${info.name} — ${info.effects.join(', ')}` : info.name;
}

/** Primary element drives the detail page's colour scheme. */
function elementOf(dex: PalDex | undefined): string {
  const first = dex?.types?.[0];
  return first && ELEMENTS.has(first) ? first : 'neutral';
}

/** Ordered strongest-first so the chips read the way the Pal Box sorts them. */
const sortedPassives = (ids: string[]): string[] =>
  [...ids].sort((a, b) => rankSort(rankOf(b, PASSIVES[b])) - rankSort(rankOf(a, PASSIVES[a])));

const DENSITY_KEY = 'palworld-card-density';

/**
 * Card sizes as named presets rather than a column count: people pick by feel
 * ("show me more"), every preset still adapts to the window, and three layouts
 * are three to get right instead of nine. Compact also drops the type row and
 * IV stats — it is for scanning a big box for one pal.
 */
export type Density = 'comfortable' | 'default' | 'compact';
const DENSITIES: Array<{ id: Density; label: string }> = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'default', label: 'Default' },
  { id: 'compact', label: 'Compact' },
];

function readDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    return v === 'comfortable' || v === 'compact' ? v : 'default';
  } catch {
    return 'default';
  }
}

/** The saved card size, persisted per browser. */
export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>(readDensity);
  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* storage off — the choice lasts until reload */
    }
  }, [density]);
  return [density, setDensity];
}

/**
 * Columns per size on a wide screen, and the narrowest a card may get before
 * the grid drops a column. Mirrors the .density-* rules in design.css.
 */
export const DENSITY_LAYOUT: Record<Density, { cols: number; floor: number }> = {
  comfortable: { cols: 4, floor: 260 },
  default: { cols: 6, floor: 200 },
  compact: { cols: 8, floor: 150 },
};

export function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <div className="dl-density" role="group" aria-label="Card size">
      {DENSITIES.map((d) => (
        <button
          key={d.id}
          type="button"
          className={value === d.id ? 'on' : undefined}
          aria-pressed={value === d.id}
          onClick={() => onChange(d.id)}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}

/** "Dragon · Grass", each element in its own colour. Shared by card and detail. */
function TypeNames({ dex }: { dex: PalDex | undefined }) {
  if (!dex?.types?.length) return <>—</>;
  return (
    <>
      {dex.types.map((t, i) => (
        <span key={t} style={{ color: `var(--elem-${ELEMENTS.has(t) ? t : 'neutral'})` }}>
          {i > 0 && ' · '}
          {titleCase(t)}
        </span>
      ))}
    </>
  );
}

/**
 * Rendered chibi stills (scripts/render-portraits.mjs), keyed like the model
 * manifest by base codename. Fetched once per page load and shared; a missing
 * index (no stills rendered) just means every card keeps its sprite.
 */
type StillIndex = Record<string, { file: string; v: number }>;
let stillsPromise: Promise<StillIndex> | null = null;
function loadStills(): Promise<StillIndex> {
  stillsPromise ??= fetch(`${import.meta.env.BASE_URL}pal-portraits/index.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<StillIndex>) : {}))
    .catch(() => ({}));
  return stillsPromise;
}

function useStill(characterId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadStills().then((index) => {
      const hit = index[stripBoss(characterId).base];
      if (live) setUrl(hit ? `${import.meta.env.BASE_URL}pal-portraits/${hit.file}.webp?v=${hit.v}` : null);
    });
    return () => {
      live = false;
    };
  }, [characterId]);
  return url;
}

function Portrait({ pal }: { pal: RosterPal }) {
  const dex = dexOf(pal);
  const still = useStill(pal.characterId);
  const [failed, setFailed] = useState<string | null>(null);

  // Prefer the chibi still; fall back to the 100px dex sprite, then initials.
  if (still && failed !== still) {
    return <img className="still" src={still} alt="" loading="lazy" onError={() => setFailed(still)} />;
  }
  if (!dex?.img || failed === dex.img) {
    return <span className="dl-art-fallback">{speciesName(pal).slice(0, 2)}</span>;
  }
  return <img src={`/${dex.img}`} alt="" loading="lazy" onError={() => setFailed(dex.img)} />;
}

function IvRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="dl-iv">
      <span className="dl-iv-label">{label}</span>
      <span className="dl-track">
        <span className={`dl-track-fill${value >= 50 ? ' high' : ''}`} style={{ width: `${value}%` }} />
      </span>
      <span className="dl-iv-val">{value}</span>
    </div>
  );
}

/**
 * Built to a supplied mockup. The frame is the pal's rarity tier — never its
 * element — and the only extras over the mockup are the Alpha/Lucky/Awakened
 * pills and the passives that slide over the portrait on hover.
 */
export function PalTradingCard({ pal, onOpen }: { pal: RosterPal; onOpen: () => void }) {
  const dex = dexOf(pal);
  const passives = sortedPassives(pal.passives);

  return (
    <button type="button" onClick={onOpen} className={`dl-frame rarity-${rarityTier(rarityFor(pal.palId))}`}>
      <div className="dl-card">
        {/* Grid, not nested flex: the stars line spans under "Lv" as well, so
            three stars plus all three pills still fit on one line. */}
        <div className="dl-head">
          <span className="dl-name">
            <span className="dl-name-text">{displayName(pal)}</span>
            {pal.gender && <span className={`dl-gender ${pal.gender}`}>{pal.gender === 'male' ? '♂' : '♀'}</span>}
          </span>
          <span className="dl-level">Lv {pal.level}</span>
          {/* Rendered even when empty so every card is the same height. */}
          <span className="dl-sub">
            {pal.rank > 1 && <span className="dl-stars">{'★'.repeat(pal.rank - 1)}</span>}
            {pal.isBoss && <span className="dl-pill alpha">Alpha</span>}
            {pal.isLucky && <span className="dl-pill lucky">Lucky</span>}
            {pal.isAwakened && <span className="dl-pill awake">Awakened</span>}
          </span>
        </div>

        <div className="dl-art">
          <Portrait pal={pal} />
          {passives.length > 0 && (
            <div className="dl-passives">
              {passives.map((id) => {
                const rank = rankOf(id, PASSIVES[id]);
                return (
                  <span key={id} className={`chip ${rankClass(rank)}`} title={passiveTitle(id)}>
                    <span className="chip-label">{passiveLabel(id)}</span>
                    <RankMark rank={rank} />
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="dl-type-row">
          <span className="dl-types">
            <TypeNames dex={dex} />
          </span>
          <span className="dl-iv-total">
            IV <b>{ivTotal(pal)}</b>/300
          </span>
        </div>

        <div className="dl-stats">
          <IvRow label="HP" value={pal.ivs.hp} />
          <IvRow label="ATK" value={pal.ivs.attack} />
          <IvRow label="DEF" value={pal.ivs.defense} />
        </div>
      </div>
    </button>
  );
}

/* ---------- detail page --------------------------------------------------
   Built to a supplied mockup of the in-game Pal Stats screen. Always dark,
   whatever the theme toggle says — it is meant to read as a game screen — so
   every colour lives under .dp-page in design.css and nothing here consults
   the theme. */

/** Letter grade for a 0-100 IV, matching the mockup's thresholds. */
const grade = (v: number): string => (v >= 80 ? 'S' : v >= 60 ? 'A' : v >= 30 ? 'B' : 'C');

/** Two tiers get an accent, the rest keep the chip scheme's neutral/red. */
function tierOf(id: string): string {
  const rank = rankOf(id, PASSIVES[id]);
  if (rank === null) return 'unknown';
  if (rank >= 4) return 'teal';
  if (rank >= 2) return 'gold';
  return rank === 1 ? 'plain' : 'neg';
}

/** Equipped first, then the rest — MasteredWaza does not repeat the equipped three. */
function skillsOf(pal: RosterPal): string[] {
  return [...new Set([...(pal.skills?.equipped ?? []), ...(pal.skills?.learned ?? [])])];
}

/** A bar drawn as discrete segments, the way the game draws its gauges. */
function Segments({ count, filled, className }: { count: number; filled: number; className: string }) {
  return (
    <span className={`dp-seg ${className}`} style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={i < filled ? 'on' : undefined} />
      ))}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className={`dp-stat${value >= 50 ? ' high' : ''}`}>
      <span className="dp-grade">{grade(value)}</span>
      <span className="dp-stat-name">{label}</span>
      <Segments count={20} filled={Math.round(value / 5)} className="dp-stat-bar" />
      <span className="dp-stat-val">{value}</span>
    </div>
  );
}

export function PalDetail({ pal, onBack }: { pal: RosterPal; onBack: () => void }) {
  const dex = dexOf(pal);
  const name = displayName(pal);
  const xp = levelProgress(pal.level, pal.exp);
  const partner = partnerSkillFor(pal.palId);
  const food = foodFor(pal.palId);
  const skills = skillsOf(pal);
  // Species base plus any boost passives (Farmhand: Farming +1). A boost can
  // also add a job the species lacks. Listed in the in-game row order.
  const bonuses = workBonuses(pal.passives);
  const base = new Map((dex?.work ?? []).map((w) => [w.job, w.level]));
  const work = [...new Set([...base.keys(), ...bonuses.keys()])]
    .map((job) => ({
      job,
      level: Math.min(WORK_LEVEL_CAP, (base.get(job) ?? 0) + (bonuses.get(job) ?? 0)),
      boosted: bonuses.has(job),
    }))
    .sort((a, b) => workOrder(a.job) - workOrder(b.job));

  return (
    // Same colour rules as the card in the list: primary element, overridden by
    // Alpha (rose) and Lucky (gold) — Lucky wins when a pal is both.
    <div
      className={`app dp-page dl-elem-${elementOf(dex)}${pal.isBoss ? ' is-alpha' : ''}${pal.isLucky ? ' is-lucky' : ''}`}
    >
      <div className="dp-scroll">
        <button type="button" className="dp-back" onClick={onBack}>
          ‹ Back to cards
        </button>

        <div className="dp-card">
          <div className="dp-col">
            <section className="dp-portrait">
              <div className="dp-portrait-inner">
                <header className="dp-portrait-head">
                  <h2>
                    {name}
                    {pal.gender && (
                      <span className={`dp-gender ${pal.gender}`}>{pal.gender === 'male' ? '♂' : '♀'}</span>
                    )}
                    {pal.isBoss && <span className="dp-badge alpha">Alpha</span>}
                    {pal.isLucky && <span className="dp-badge lucky">Lucky</span>}
                  </h2>
                  <span className="dp-lv">Lv {pal.level}</span>
                </header>

                <div className="dp-stage">
                  <PalModel characterId={pal.characterId} name={name} fallback={<Portrait pal={pal} />} />
                </div>

                <div className="dp-foot">
                  <div className="dp-foot-cell">
                    <span className="dp-foot-label">Rank</span>
                    <span className="dp-stars">{pal.rank > 1 ? '★'.repeat(pal.rank - 1) : '—'}</span>
                  </div>
                  <div className="dp-foot-cell">
                    <span className="dp-foot-label">Type</span>
                    <span className="dp-type">
                      <TypeNames dex={dex} />
                    </span>
                  </div>
                  <div className="dp-foot-cell">
                    <span className="dp-foot-label">XP</span>
                    <span className="dp-xp" title="Progress to the next level">
                      <span className="dp-xp-fill" style={{ width: `${Math.round(xp * 100)}%` }} />
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="dp-panel">
              <h3 className="dp-label">Partner skill</h3>
              {partner ? (
                <>
                  <div className="dp-partner-head">
                    <span className="dp-partner-name">{partner.name}</span>
                    {/* Partner skill level follows the condenser rank. */}
                    <span className="dp-pill">Lv {pal.rank}</span>
                  </div>
                  <p className="dp-partner-desc">{partner.description}</p>
                </>
              ) : (
                <p className="dp-none">—</p>
              )}
            </section>

            <section className="dp-panel">
              <div className="dp-row-head">
                <h3 className="dp-label">Food</h3>
                <span className="dp-food-count">
                  {food ?? '—'} / {FOOD_SLOTS}
                </span>
              </div>
              <Segments count={FOOD_SLOTS} filled={food ?? 0} className="dp-food-bar" />
            </section>
          </div>

          <div className="dp-col">
            <section className="dp-panel dp-potential">
              <div className="dp-strip">
                <h3 className="dp-label">Potential · IVs</h3>
                <span className="dp-total">
                  TOTAL <b>{ivTotal(pal)}</b>/300
                </span>
              </div>
              <div className="dp-stats">
                <StatRow label="HP" value={pal.ivs.hp} />
                <StatRow label="Attack" value={pal.ivs.attack} />
                <StatRow label="Defense" value={pal.ivs.defense} />
              </div>
            </section>

            <section className="dp-panel">
              <h3 className="dp-label">Passive skills</h3>
              {pal.passives.length === 0 ? (
                <p className="dp-none">This pal has no passives.</p>
              ) : (
                <div className="dp-passives">
                  {sortedPassives(pal.passives).map((id) => (
                    <div key={id} className={`dp-passive tier-${tierOf(id)}`} title={passiveTitle(id)}>
                      <div className="dp-passive-head">
                        <span className="dp-passive-name">{passiveLabel(id)}</span>
                        <RankMark rank={rankOf(id, PASSIVES[id])} />
                      </div>
                      <p className="dp-passive-desc">
                        {PASSIVES[id]?.effects?.length ? PASSIVES[id].effects.join(' · ') : 'Effect not verified'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="dp-panel dp-actives">
              <div className="dp-row-head">
                <h3 className="dp-label">Active skills</h3>
                <span className="dp-muted">{skills.length} learned</span>
              </div>
              {skills.length === 0 ? (
                <p className="dp-none">
                  {pal.skills ? 'No active skills learned.' : 'Re-run npm run import-save to read active skills.'}
                </p>
              ) : (
                <div className="dp-skill-grid">
                  {skills.map((id) => {
                    const s = SKILLS[id];
                    const el = s && ELEMENTS.has(s.element) ? s.element : 'neutral';
                    return (
                      <div key={id} className="dp-skill" title={s ? undefined : `${id} — not in skills.json`}>
                        <span className="dp-elem-pill" style={{ ['--pill']: `var(--elem-${el})` } as CSSProperties}>
                          {s ? s.element : '?'}
                        </span>
                        <span className="dp-skill-name">{s?.name ?? id}</span>
                        {s && (
                          <span className="dp-skill-foot">
                            <span>
                              Power <b>{s.power}</b>
                            </span>
                            <span className="dp-mono">CT {s.cooldown}s</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="dp-panel">
              <h3 className="dp-label">Work suitability</h3>
              {work.length === 0 ? (
                <p className="dp-none">No work suitabilities.</p>
              ) : (
                <div className="dp-work">
                  {work.map((w) => (
                    <div
                      key={w.job}
                      className="dp-work-row"
                      title={w.boosted ? 'Includes a boost from a passive' : undefined}
                    >
                      <span className="dp-work-name">
                        {/* The game's own icon (scripts/fetch-work-icons.mjs). */}
                        <img className="dp-work-icon" src={`${import.meta.env.BASE_URL}work-icons/${w.job}.webp`} alt="" />
                        {workName(w.job)}
                        {w.boosted && <span className="dp-work-boost">▲</span>}
                      </span>
                      <Segments count={WORK_LEVEL_CAP} filled={w.level} className="dp-work-bar" />
                      <span className="dp-work-lv">
                        {w.level}
                        <span className="dp-work-cap">/{WORK_LEVEL_CAP}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
