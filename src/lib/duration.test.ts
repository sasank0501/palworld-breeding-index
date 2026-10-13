import { describe, expect, it } from 'vitest';

import { formatDuration } from './duration.ts';

describe('formatDuration', () => {
  it('counts seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(42.4)).toBe('42 s');
  });

  it('gives minutes and padded seconds', () => {
    expect(formatDuration(60)).toBe('1 min 00 s');
    expect(formatDuration(185)).toBe('3 min 05 s');
  });

  it('gives hours and minutes from an hour', () => {
    expect(formatDuration(3720)).toBe('1 h 02 min');
  });

  it('treats a negative time as zero', () => {
    expect(formatDuration(-5)).toBe('0 s');
  });
});
