import type { CSSProperties } from 'react';

import { ELEMENT_ICONS, WORK_COLOURS, WORK_ICONS, type IconPart } from './iconData.ts';

/**
 * The element and work icons, drawn as inline SVG from src/design/iconData.ts. Inline, so they
 * take their colours from the skin (an element's mark is `currentColor`, which `.sc-eico` sets
 * to the skin's colour for that element) and need no image files. They are decoration beside a
 * written name everywhere they appear, so they are hidden from screen readers.
 */

const FILL: Record<IconPart['c'], string> = {
  glyph: 'currentColor',
  // The surface the icon sits on, where a caller says what it is; else the panel.
  cut: 'var(--ico-cut, var(--panel-solid, #fff))',
  main: 'var(--w-main)',
  shade: 'color-mix(in srgb, var(--w-main) 66%, #000)',
  tint: 'color-mix(in srgb, var(--w-main) 62%, #fff)',
};

function Parts({ parts }: { parts: IconPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.stroke ? (
          <path key={i} d={p.d} fill="none" stroke={FILL[p.c]} strokeWidth={p.stroke} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={i} d={p.d} fill={FILL[p.c]} fillRule={p.evenodd ? 'evenodd' : undefined} />
        ),
      )}
    </>
  );
}

/** An element's mark. The marks are drawn in the middle 16 units of the grid, so the view box crops to them. */
export function ElementGlyph({ element, size = 18, className }: { element: string; size?: number; className?: string }) {
  const parts = ELEMENT_ICONS[element] ?? ELEMENT_ICONS.neutral;
  return (
    <svg className={className} width={size} height={size} viewBox="4 4 16 16" aria-hidden="true" focusable="false">
      <Parts parts={parts} />
    </svg>
  );
}

/** A work suitability's icon, in the job's own colour (src/design/showcase.css darkens it on the light skins). */
export function WorkGlyph({ job, size = 24, className }: { job: string; size?: number; className?: string }) {
  const parts = WORK_ICONS[job];
  if (!parts) return <span className={className} style={{ display: 'inline-block', width: size, height: size }} aria-hidden="true" />;
  return (
    <svg
      className={`sc-wico${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ '--w': WORK_COLOURS[job] } as CSSProperties}
    >
      <Parts parts={parts} />
    </svg>
  );
}
