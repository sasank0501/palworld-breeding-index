import { describe, expect, it } from 'vitest';

import { describeFeatures, detectFeatures } from './features.ts';

describe('detectFeatures', () => {
  it('answers no, rather than throwing, where the browser APIs are missing', async () => {
    // vitest runs in Node: no document, no navigator.storage, no pickers. Every
    // caller relies on getting a plain answer back, never an exception.
    const f = await detectFeatures();
    expect(f.directoryPicker).toBe(false);
    expect(f.opfs).toBe(false);
    expect(f.opfsWritable).toBe(false);
    expect(f.serviceWorker).toBe(false);
    expect(f.webgl2).toBe(false);
  });

  it('checks once per page', () => {
    expect(detectFeatures()).toBe(detectFeatures());
  });
});

describe('describeFeatures', () => {
  it('formats the quota and turns the flags into yes/no', async () => {
    const rows = describeFeatures({ ...(await detectFeatures()), webAssembly: true, quota: { usage: 0, quota: 10 * 1024 * 1024 } });
    expect(rows.webAssembly).toBe('yes');
    expect(rows.opfs).toBe('no');
    expect(rows.quota).toBe('0 MB used of 10 MB');
  });
});
