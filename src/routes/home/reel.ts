/**
 * The geometry of the homepage tour, kept free of the DOM so it can be tested.
 *
 * The tour shows one long "reel" of the app's pages in a window. Each page scrolls
 * up its screenshot, and the next page then rides up over it at the same speed.
 * Where the reel stands is one number, `position` (px); every page's offset in the
 * window follows from it. Chapters are laid on the reel by `knots`: the position
 * at which each chapter begins.
 *
 * All lengths are in window pixels, after scaling a screenshot to the window's
 * width.
 */

export interface ReelChapter {
  /** Which screenshot this chapter shows. Neighbours naming the same page share one layer. */
  page: string;
  /** Where the chapter starts on its page, in the screenshot's own pixels. */
  from: number;
  /** How far down its page the chapter reaches, in the screenshot's own pixels. */
  to: number;
}

export interface Reel {
  /** One entry per chapter: which layer (distinct page, in order) it shows. */
  layerOf: number[];
  /** The page of each layer. */
  pages: string[];
  /** The position at which each layer has finished sliding in. */
  starts: number[];
  /** How far each layer scrolls once it is in. */
  pans: number[];
  /** The position at the start of each chapter, then the end of the reel: chapters + 1 entries. */
  knots: number[];
  /** The window's height. */
  viewH: number;
}

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const ramp = (v: number, from: number, to: number): number => clamp((v - from) / (to - from));
export const smooth = (v: number): number => v * v * (3 - 2 * v);

/** The share of a chapter during which its description holds still; the rest hands over to the next. */
export const HOLD = 0.72;

export function buildReel(
  chapters: ReelChapter[],
  shot: { w: number; h: number },
  view: { w: number; h: number },
): Reel {
  const k = view.w / shot.w;
  const maxPan = Math.max(0, shot.h * k - view.h);

  const pages: string[] = [];
  const layerOf = chapters.map((c) => {
    if (pages[pages.length - 1] !== c.page) pages.push(c.page);
    return pages.length - 1;
  });

  const pans = pages.map((_, layer) => {
    const reach = Math.max(...chapters.filter((_c, n) => layerOf[n] === layer).map((c) => c.to));
    return Math.min(maxPan, reach * k);
  });
  const starts = [0];
  for (let i = 1; i < pages.length; i++) starts.push(starts[i - 1] + pans[i - 1] + view.h);

  // A chapter on a new page begins with that page half-way in; a later chapter on the
  // same page begins where the page has scrolled to its own `from`.
  const knots = chapters.map((c, n) => {
    if (n === 0) return 0;
    const layer = layerOf[n];
    if (layer === layerOf[n - 1]) return starts[layer] + Math.min(pans[layer], c.from * k);
    return starts[layer] - view.h / 2;
  });
  knots.push(starts[starts.length - 1] + pans[pans.length - 1]);

  return { layerOf, pages, starts, pans, knots, viewH: view.h };
}

/** Where the reel stands for a scroll progress of 0..chapters.length. */
export function positionAt(reel: Reel, progress: number): number {
  const count = reel.layerOf.length;
  const n = Math.min(count - 1, Math.floor(clamp(progress, 0, count)));
  const local = clamp(progress - n);
  return reel.knots[n] + (reel.knots[n + 1] - reel.knots[n]) * local;
}

/**
 * Which description is on show, as a number: 2 is the third one, 2.5 is half-way
 * through the hand-over to the fourth. A description holds still for most of its
 * chapter, then makes way for the next.
 */
export function textAt(count: number, progress: number): number {
  const n = Math.min(count - 1, Math.floor(clamp(progress, 0, count)));
  if (n === count - 1) return n;
  return n + smooth(ramp(progress - n, HOLD, 1));
}

/** The vertical offset of one layer in the window, for a reel position. */
export function pageOffset(reel: Reel, layer: number, position: number): number {
  return clamp(reel.starts[layer] - position, -reel.pans[layer], reel.viewH);
}
