import { describe, expect, it } from 'vitest';

import { MAX_SCALE, MIN_SCALE, fitView, keepInReach, reveal, zoomAt } from './viewport.ts';

const box = { w: 1000, h: 600 };

describe('fitView', () => {
  it('shrinks a picture larger than the box to fit, centred', () => {
    const v = fitView(box, { w: 2000, h: 800 }, 0);
    expect(v.scale).toBe(0.5);
    expect(v.x).toBe(0);
    expect(v.y).toBe(100);
  });

  it('leaves the padding free on the tighter side', () => {
    const v = fitView(box, { w: 2000, h: 800 }, 20);
    expect(v.scale).toBeCloseTo(0.48);
    expect(v.x).toBeCloseTo(20);
  });

  it('never enlarges a small picture, only centres it', () => {
    expect(fitView(box, { w: 400, h: 200 })).toEqual({ scale: 1, x: 300, y: 200 });
  });

  it('stops at the smallest scale for a huge picture', () => {
    expect(fitView(box, { w: 100000, h: 100 }).scale).toBe(MIN_SCALE);
  });

  it('copes with a box or picture that has no size yet', () => {
    expect(fitView({ w: 0, h: 0 }, { w: 400, h: 200 }).scale).toBe(1);
    expect(fitView(box, { w: 0, h: 0 }).scale).toBe(1);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the pointer where it is', () => {
    const before = { scale: 1, x: 100, y: 50 };
    const after = zoomAt(before, 2, 300, 250);
    // The picture's point under (300, 250) was (200, 200); it still is.
    expect((300 - after.x) / after.scale).toBeCloseTo(200);
    expect((250 - after.y) / after.scale).toBeCloseTo(200);
    expect(after.scale).toBe(2);
  });

  it('stays within the smallest and largest scale', () => {
    expect(zoomAt({ scale: 1.8, x: 0, y: 0 }, 4, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 0.3, x: 0, y: 0 }, 0.1, 0, 0).scale).toBe(MIN_SCALE);
  });

  it('does not move the picture once the scale can go no further', () => {
    const v = { scale: MAX_SCALE, x: 40, y: 70 };
    expect(zoomAt(v, 2, 500, 300)).toEqual(v);
  });
});

describe('keepInReach', () => {
  const content = { w: 800, h: 400 };
  it('leaves a view alone while enough of the picture shows', () => {
    const v = { scale: 1, x: 100, y: 100 };
    expect(keepInReach(v, box, content)).toEqual(v);
  });

  it('pulls a picture dragged off any side back to a strip of it', () => {
    expect(keepInReach({ scale: 1, x: 5000, y: 0 }, box, content).x).toBe(920);
    expect(keepInReach({ scale: 1, x: -5000, y: 0 }, box, content).x).toBe(-720);
    expect(keepInReach({ scale: 1, x: 0, y: 5000 }, box, content).y).toBe(520);
    expect(keepInReach({ scale: 1, x: 0, y: -5000 }, box, content).y).toBe(-320);
  });
});

describe('reveal', () => {
  const v = { scale: 1, x: 0, y: 0 };
  it('does nothing for a rectangle already inside', () => {
    expect(reveal(v, box, { left: 100, top: 100, right: 300, bottom: 200 })).toEqual(v);
  });

  it('moves the least distance to bring one in from the right and the bottom', () => {
    expect(reveal(v, box, { left: 900, top: 550, right: 1100, bottom: 700 }, 10)).toEqual({ scale: 1, x: -110, y: -110 });
  });

  it('brings one in from the left and the top', () => {
    expect(reveal(v, box, { left: -150, top: -40, right: 50, bottom: 60 }, 10)).toEqual({ scale: 1, x: 160, y: 50 });
  });

  it('shows the top-left corner of one larger than the box', () => {
    const r = reveal(v, box, { left: 200, top: 100, right: 1500, bottom: 900 }, 10);
    expect(200 + r.x).toBe(10);
    expect(100 + r.y).toBe(10);
  });
});
