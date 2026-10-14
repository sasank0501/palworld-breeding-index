import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Where the main nav's highlight sits: the box of the tab that is on, measured in its container.
 * One element glides from the old tab to the new one (so Paldex to Planner is a single smooth
 * travel across the tabs between), instead of the fill snapping from one button to the next.
 *
 * It follows the tab through everything that moves it: a different tab, a theme (the fonts differ,
 * so the tabs' widths do), a window resize, a font arriving late. The first position is set
 * without a transition so the page never opens with the highlight sliding in from the corner.
 */
export function useTabSlider(box: RefObject<HTMLElement | null>, active: string, skin: string) {
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  const measure = (): void => {
    const on = box.current?.querySelector<HTMLElement>('button.on');
    if (!on) return setPos(null);
    const next = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    setPos((p) => (p && p.x === next.x && p.y === next.y && p.w === next.w && p.h === next.h ? p : next));
  };

  useLayoutEffect(measure, [active, skin]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll('button').forEach((b) => ro.observe(b));
    void document.fonts?.ready.then(measure);
    // Transitions start after the first position has been painted.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return { pos, animate };
}
