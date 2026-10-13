import { describe, expect, it } from 'vitest';

import { buildReel, HOLD, pageOffset, positionAt, textAt, type ReelChapter } from './reel.ts';

const SHOT = { w: 1360, h: 1700 };
const VIEW = { w: 1000, h: 700 };
const CHAPTERS: ReelChapter[] = [
  { page: 'home', from: 0, to: 60 },
  { page: 'home', from: 600, to: 900 },
  { page: 'mypals', from: 0, to: 520 },
  { page: 'breeding', from: 0, to: 560 },
  { page: 'planner', from: 0, to: 900 },
];
const reel = buildReel(CHAPTERS, SHOT, VIEW);
const k = VIEW.w / SHOT.w;

describe('buildReel', () => {
  it('gives neighbouring chapters on one page a single layer', () => {
    expect(reel.pages).toEqual(['home', 'mypals', 'breeding', 'planner']);
    expect(reel.layerOf).toEqual([0, 0, 1, 2, 3]);
  });

  it('lets a page scroll as far as its deepest chapter reaches, never past its own end', () => {
    const maxPan = SHOT.h * k - VIEW.h; // 550: a 700 px window shows 700 of the page's 1,249
    expect(reel.pans[1]).toBeCloseTo(520 * k); // 382: room to spare
    expect(reel.pans[3]).toBeCloseTo(maxPan); // reaches 900 (661), stops at the page's end
    expect(Math.max(...reel.pans)).toBeLessThanOrEqual(maxPan + 1e-9);
    // A page that reaches deeper than it has room for stops at its end.
    const deep = buildReel([{ page: 'a', from: 0, to: 5000 }], SHOT, VIEW);
    expect(deep.pans[0]).toBeCloseTo(maxPan);
  });

  it('starts each next page one window below the end of the last one', () => {
    expect(reel.starts[0]).toBe(0);
    for (let i = 1; i < reel.starts.length; i++) {
      expect(reel.starts[i]).toBeCloseTo(reel.starts[i - 1] + reel.pans[i - 1] + VIEW.h);
    }
  });

  it('lays chapters on the reel in strictly increasing order, ending where the last page ends', () => {
    expect(reel.knots).toHaveLength(CHAPTERS.length + 1);
    expect(reel.knots[0]).toBe(0);
    for (let n = 1; n < reel.knots.length; n++) expect(reel.knots[n]).toBeGreaterThan(reel.knots[n - 1]);
    const last = reel.starts.length - 1;
    expect(reel.knots[CHAPTERS.length]).toBeCloseTo(reel.starts[last] + reel.pans[last]);
  });

  it('starts a chapter on a new page with that page half in the window', () => {
    for (const n of [2, 3, 4]) expect(pageOffset(reel, reel.layerOf[n], reel.knots[n])).toBeCloseTo(VIEW.h / 2);
  });

  it('starts a later chapter on the same page where that page has scrolled to', () => {
    expect(pageOffset(reel, 0, reel.knots[1])).toBeCloseTo(-600 * k);
  });

  it('copes with a window taller than the screenshot: nothing to scroll, still in order', () => {
    const tall = buildReel(CHAPTERS, SHOT, { w: 1000, h: 5000 });
    expect(tall.pans.every((p) => p === 0)).toBe(true);
    for (let n = 1; n < tall.knots.length; n++) expect(tall.knots[n]).toBeGreaterThanOrEqual(tall.knots[n - 1]);
  });
});

describe('positionAt', () => {
  it('runs from the start to the end of the reel without a jump at chapter boundaries', () => {
    expect(positionAt(reel, 0)).toBe(0);
    expect(positionAt(reel, CHAPTERS.length)).toBeCloseTo(reel.knots[CHAPTERS.length]);
    for (let n = 1; n < CHAPTERS.length; n++) {
      expect(positionAt(reel, n - 1e-9)).toBeCloseTo(positionAt(reel, n), 3);
    }
    let prev = -1;
    for (let p = 0; p <= CHAPTERS.length; p += 0.05) {
      const at = positionAt(reel, p);
      expect(at).toBeGreaterThanOrEqual(prev);
      prev = at;
    }
  });

  it('stays inside the reel for out-of-range progress', () => {
    expect(positionAt(reel, -3)).toBe(0);
    expect(positionAt(reel, 99)).toBeCloseTo(reel.knots[CHAPTERS.length]);
  });
});

describe('pageOffset', () => {
  it('parks a page below the window, slides it in, then scrolls it up', () => {
    expect(pageOffset(reel, 1, 0)).toBe(VIEW.h);
    expect(pageOffset(reel, 1, reel.starts[1])).toBeCloseTo(0);
    expect(pageOffset(reel, 1, reel.starts[1] + 100)).toBeCloseTo(-100);
    expect(pageOffset(reel, 1, reel.starts[1] + 1e6)).toBeCloseTo(-reel.pans[1]);
  });

  it('keeps the first page in place at the start', () => {
    expect(pageOffset(reel, 0, 0)).toBe(0);
  });
});

describe('textAt', () => {
  it('holds one description still for most of its chapter', () => {
    expect(textAt(5, 0)).toBe(0);
    expect(textAt(5, 0.5)).toBe(0);
    expect(textAt(5, 2 + HOLD)).toBe(2);
  });

  it('hands over to the next one by the end of the chapter, smoothly', () => {
    expect(textAt(5, 1 - 1e-9)).toBeCloseTo(1, 4);
    const mid = textAt(5, 1 + (HOLD + 1) / 2 - 1);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it('stays on the last description to the end', () => {
    expect(textAt(5, 4.5)).toBe(4);
    expect(textAt(5, 5)).toBe(4);
    expect(textAt(5, 99)).toBe(4);
  });
});
