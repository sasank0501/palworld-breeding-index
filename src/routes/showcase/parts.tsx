import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { PalModel } from '../../design/PalModel.tsx';
import { ArtPlaceholder } from '../../components/ArtPlaceholder.tsx';
import { ElementGlyph } from '../../design/icons.tsx';
import { useBrowse } from '../../lib/browse.ts';
import { HATCH_AFTER_MS, Portrait } from '../../components/PalCards.tsx';
import { rarityFor, rarityTier, type RarityTier } from '../../design/palExtras.ts';
import type { RosterPal } from '../../types.ts';
import { DEX, PASSIVES, SpeciesArt, TraitGlyph, TraitName, byRank, rankFor, traitClass, useCodename } from './shared.tsx';

/** Small pieces shared by every Showcase section. */

export const ELEMENTS = ['fire', 'water', 'grass', 'electric', 'ice', 'ground', 'dark', 'dragon', 'neutral'] as const;
export type Element = (typeof ELEMENTS)[number];

export const elementOf = (id: string): Element => {
  const t = DEX[id]?.types?.[0] as Element | undefined;
  return t && (ELEMENTS as readonly string[]).includes(t) ? t : 'neutral';
};

/** Dex numbers sort as numbers, with a variant (Noct, Ignis, ...) after its base. */
export const dexOrder = (id: string): number => Number(DEX[id]?.num ?? 0) * 10 + (DEX[id]?.variant ?? 0);

/** All 289 species, in dex order. */
export const DEX_ORDER = Object.values(DEX).sort((a, b) => dexOrder(a.id) - dexOrder(b.id));

export const title = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** An element's icon: PalDoc's own mark (src/design/icons.tsx), in the skin's colour for that element. */
export function ElementIcon({ element, size = 18 }: { element: Element; size?: number }) {
  return <ElementGlyph element={element} size={size} className={`sc-eico e-${element}`} />;
}

/** The species' element(s) as glyph chips. */
export function ElementChips({ id, labels = false }: { id: string; labels?: boolean }) {
  const types = (DEX[id]?.types ?? []).filter((t): t is Element => (ELEMENTS as readonly string[]).includes(t));
  return (
    <span className="sc-elems">
      {types.map((t) => (
        <span key={t} className={`sc-elem e-${t}`} title={title(t)}>
          <ElementIcon element={t} size={14} />
          {labels && title(t)}
        </span>
      ))}
    </span>
  );
}

export const tierOf = (id: string | null): RarityTier => rarityTier(rarityFor(id));

const TIERS: RarityTier[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * Rarity as 1 to 5 gems in the tier's colour: one gem told the tiers apart by colour
 * alone (WCAG 1.4.1), and a count reads in any colour vision. Decorative: the tile's
 * accessible name says the tier in words.
 */
export function RarityPips({ tier }: { tier: RarityTier }) {
  return (
    <span className="sc-gems" aria-hidden="true">
      {TIERS.slice(0, TIERS.indexOf(tier) + 1).map((t) => (
        <i key={t} />
      ))}
    </span>
  );
}

/** The squash and grow, start to finish (showcase.css, "Hatch"). */
const HATCH_MS = 550;
/**
 * Species that have hatched during this visit. Each hatches once: after that,
 * switching back to it (the spotlight, next/previous, reopening its page) shows its
 * still while the model decodes, then the model, with no egg. A reload starts over.
 */
const hatched = new Set<string>();

/**
 * A pal's 3D chibi, hatching out of an egg (style D, "quick", the same as every
 * picture). While the model loads, the egg (tinted by element) sits in its place;
 * on load it squashes and the pal grows in. A model that loads within 150 ms (a
 * return visit, from disk) skips the show and just appears. No model for this
 * pal: its still, or the egg when there is no art at all. Each species hatches
 * once per visit (`hatched`). `picker` adds the animation buttons under the model.
 */
export function Stage(props: { id: string; pal?: RosterPal; picker?: boolean }) {
  // Browse mode has no 3D and no player art: the species' silhouette, in the stage's place.
  return useBrowse() ? (
    <div className="sc-stage is-none">
      <SpeciesArt id={props.id} />
    </div>
  ) : (
    <LiveStage {...props} />
  );
}

function LiveStage({ id, pal, picker = false }: { id: string; pal?: RosterPal; picker?: boolean }) {
  const codename = useCodename(id);
  const box = useRef<HTMLDivElement>(null);
  const [phase, setPhaseState] = useState<'waiting' | 'hatching' | 'done' | 'none'>('waiting');
  const current = useRef(phase);
  const setPhase = useCallback((p: typeof phase) => {
    current.current = p;
    setPhaseState(p);
  }, []);
  const still = pal ? <Portrait pal={pal} /> : <SpeciesArt id={id} />;
  const onNone = useCallback(() => setPhase('none'), [setPhase]);
  const seen = hatched.has(id);

  useEffect(() => {
    setPhase('waiting');
    const started = performance.now();
    const el = box.current;
    if (!el) return;
    let timer = 0;
    // model-viewer's 'load' may not bubble, so listen in the capture phase. It also
    // fires again when the chibi/normal toggle swaps the file: only the first counts.
    const onLoad = (): void => {
      if (current.current !== 'waiting') return;
      const first = !hatched.has(id);
      hatched.add(id);
      if (!first || performance.now() - started < HATCH_AFTER_MS) return setPhase('done');
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      setPhase('hatching');
      timer = window.setTimeout(() => setPhase('done'), reduced ? 250 : HATCH_MS);
    };
    el.addEventListener('load', onLoad, true);
    return () => {
      el.removeEventListener('load', onLoad, true);
      window.clearTimeout(timer);
    };
  }, [id, pal?.instanceId, setPhase]);

  return (
    <div className={`sc-stage is-${phase}`} ref={box}>
      {codename && phase === 'waiting' && seen && <div className="sc-stage-still">{still}</div>}
      {codename && (phase === 'waiting' || phase === 'hatching') && !(seen && phase === 'waiting') && (
        <ArtPlaceholder element={DEX[id]?.types?.[0]} pending />
      )}
      {codename && phase !== 'none' ? (
        <PalModel characterId={pal?.characterId ?? codename} name={DEX[id]?.name ?? id} fallback={null} picker={picker} onNone={onNone} />
      ) : (
        still
      )}
    </div>
  );
}

/** Passives as rank-coloured chips, best first. `want` rings the ones a plan needs. */
export function TraitChips({ ids, want, max }: { ids: string[]; want?: string[]; max?: number }) {
  if (ids.length === 0) return <span className="sc-notrait">no traits</span>;
  const shown = byRank(ids).slice(0, max ?? ids.length);
  return (
    <span className="sc-traits">
      {shown.map((id) => (
        <span
          key={id}
          className={`sc-trait ${traitClass(id)}${want?.includes(id) ? ' wanted' : ''}`}
          title={PASSIVES[id]?.name ? PASSIVES[id].effects.join(', ') : id}
        >
          <TraitGlyph id={id} />
          <TraitName id={id} />
        </span>
      ))}
      {max !== undefined && ids.length > max && <span className="sc-trait more">+{ids.length - max}</span>}
    </span>
  );
}

export { rankFor };

/**
 * The app's mark: a speckled pal egg with a zigzag crack, for a breeding tool.
 * Coloured from the skin tokens (see `.sc-egg` in showcase.css).
 */
export function PalEgg({ size = 30 }: { size?: number }) {
  return (
    <svg className="sc-egg" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <path className="egg-shell" d="M20 3C12 3 6.500 15 6.500 24.500 6.500 32 12.500 37 20 37s13.500-5 13.500-12.500C33.500 15 28 3 20 3z" />
      <path className="egg-band" d="M7.200 21.500l4.300 3.200 4.300-3.400 4.200 3.400 4.300-3.400 4.300 3.400 4.200-3.200" />
      <circle className="egg-spot" cx="15" cy="12.500" r="2.300" />
      <circle className="egg-spot" cx="24.500" cy="9.500" r="1.600" />
      <circle className="egg-spot" cx="25" cy="31" r="2.100" />
      <circle className="egg-spot" cx="14" cy="30.500" r="1.400" />
    </svg>
  );
}

/** Staggered entrance index for the .sc-in animations. */
export const stagger = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

/** A circular completion gauge. */
export function Ring({ value, max, label }: { value: number; max: number; label: ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = max ? Math.min(1, value / max) : 0;
  return (
    <div className="sc-ring" role="img" aria-label={`${value} of ${max}`}>
      <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
        <circle className="sc-ring-track" cx="60" cy="60" r={r} />
        <circle
          className="sc-ring-fill"
          cx="60"
          cy="60"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="sc-ring-label" aria-hidden="true">
        {label}
      </div>
    </div>
  );
}
