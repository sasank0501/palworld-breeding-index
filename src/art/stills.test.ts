import { describe, expect, it } from 'vitest';

import { STILL, opaqueBounds, placeStill, stillsToMake } from './stills.ts';

const image = (w: number, h: number, solid: Array<[number, number, number, number]>) => {
  const a = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of solid) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * w + x] = 255;
  return (x: number, y: number) => a[y * w + x];
};

describe('opaqueBounds', () => {
  it('finds the box around everything drawn', () => {
    expect(opaqueBounds(image(20, 20, [[5, 4, 9, 15]]), 20, 20)).toEqual({ x: 5, y: 4, w: 5, h: 12 });
  });
  it('calls a shot with nothing solid in it empty, as render-portraits did', () => {
    expect(opaqueBounds(() => 0, 10, 10)).toBeNull();
    expect(opaqueBounds(() => 8, 10, 10)).toBeNull(); // a faint haze is not a pal
  });
});

describe('placeStill', () => {
  it('fits a tall pal to 88% of the square, centred across and a little low', () => {
    const { dst } = placeStill({ x: 0, y: 0, w: 100, h: 200 });
    expect(dst.h).toBe(Math.round(STILL.size * STILL.fill));
    expect(dst.x).toBe(Math.round((STILL.size - dst.w) / 2));
    expect(dst.y).toBe(Math.round((STILL.size - dst.h) * STILL.lowness));
  });
  it('crops a very wide pal to its middle before fitting', () => {
    const { src } = placeStill({ x: 0, y: 0, w: 600, h: 100 });
    expect(src.w).toBe(150);
    expect(src.x).toBe(225);
  });
});

describe('stillsToMake', () => {
  it('makes one still per model file, for species only, with every name that uses it', () => {
    const todo = stillsToMake({
      SheepBall: { v: 1, chibi: true },
      SheepBall_Gym: { v: 1, chibi: true, file: 'SheepBall' },
      NotAPal: { v: 1, chibi: true },
      Anubis: { v: 1, chibi: false },
    });
    expect(todo).toEqual([{ file: 'SheepBall', names: ['SheepBall', 'SheepBall_Gym'] }]);
  });
});
