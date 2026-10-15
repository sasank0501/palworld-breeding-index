import { describe, expect, it } from 'vitest';

import palsJson from '../data/pals.json';
import { formatRoute, parseRoute, sectionOf, titleFor, type Route } from './route.ts';

const SPECIES = Object.values(palsJson as Record<string, { id: string; slug: string; name: string }>);

describe('addresses', () => {
  const cases: Array<[string, Route]> = [
    ['/', { screen: 'home' }],
    ['/upload', { screen: 'upload' }],
    ['/paldex', { screen: 'app', section: 'dex', page: null }],
    ['/my-pals', { screen: 'app', section: 'box', page: null }],
    ['/breeding', { screen: 'app', section: 'breeding', page: null }],
    ['/planner', { screen: 'app', section: 'planner', page: null }],
    ['/paldex/anubis', { screen: 'app', section: 'dex', page: { kind: 'species', slug: 'anubis' } }],
    ['/paldex/hidden', { screen: 'app', section: 'dex', page: { kind: 'hidden' } }],
    ['/planner/saved', { screen: 'app', section: 'planner', page: { kind: 'plans' } }],
    ['/my-pals/0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0', { screen: 'app', section: 'box', page: { kind: 'pal', id: '0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0' } }],
  ];

  it.each(cases)('%s reads as its screen and is written back the same', (path, route) => {
    expect(parseRoute(path)).toEqual(route);
    expect(formatRoute(route)).toBe(path);
  });

  it('ignores a trailing slash and the case of fixed words', () => {
    expect(parseRoute('/paldex/')).toEqual({ screen: 'app', section: 'dex', page: null });
    expect(parseRoute('/Paldex/Anubis')).toEqual({ screen: 'app', section: 'dex', page: { kind: 'species', slug: 'anubis' } });
    expect(parseRoute('/PLANNER/Saved')).toEqual({ screen: 'app', section: 'planner', page: { kind: 'plans' } });
  });

  it('turns down addresses the app does not have', () => {
    for (const p of ['/robots.txt', '/pals/lamball.webp', '/paldex/anubis/extra', '/breeding/anything', '/planner/x', '/upload/x', '/paldex/<b>', '/%E0%A4%A']) {
      expect(parseRoute(p), p).toBeNull();
    }
  });

  it('gives every species its own readable address, and reads it back', () => {
    const paths = SPECIES.map((d) => formatRoute({ screen: 'app', section: 'dex', page: { kind: 'species', slug: d.slug } }));
    expect(new Set(paths).size).toBe(SPECIES.length);
    for (const [i, p] of paths.entries()) {
      expect(p).toMatch(/^\/paldex\/[a-z0-9-]+$/);
      expect(parseRoute(p)).toEqual({ screen: 'app', section: 'dex', page: { kind: 'species', slug: SPECIES[i].slug } });
    }
  });

  it('keeps clear of the folders the site serves art from', () => {
    for (const p of ['/pals', '/pal-models', '/pal-portraits', '/silhouettes', '/assets', '/extractor']) expect(parseRoute(p), p).toBeNull();
  });

  it('puts each page in the section its address names', () => {
    expect(sectionOf({ kind: 'species', slug: 'anubis' })).toBe('dex');
    expect(sectionOf({ kind: 'hidden' })).toBe('dex');
    expect(sectionOf({ kind: 'pal', id: 'x' })).toBe('box');
    expect(sectionOf({ kind: 'plans' })).toBe('planner');
  });

  it('names the screen in the title, the site last', () => {
    expect(titleFor(['Anubis', 'Paldex'])).toBe('Anubis · Paldex · PalDoc');
    expect(titleFor([null, 'Planner'])).toBe('Planner · PalDoc');
    expect(titleFor([])).toBe('PalDoc');
  });
});
