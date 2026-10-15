/**
 * Addresses and the browser's history. Every screen a visitor sees as a different screen has its own
 * address, so the Back and Forward buttons (and a mouse's back button) step through the app instead
 * of leaving it, a refresh keeps your place, and a page can be linked to:
 *
 *   /                       the landing page (no save), or the app's home when a save is loaded
 *   /upload                 reading a save: looking for worlds, choosing one, importing
 *   /paldex                 the Paldex          /paldex/<species>   a species page (its slug: /paldex/anubis)
 *   /my-pals                My Pals             /my-pals/<id>       one of your pals (its instance id)
 *   /breeding               Breeding
 *   /planner                the Planner         /planner/saved      saved plans
 *   /paldex/hidden          pals hidden from the spotlight
 *
 * Small changes within a screen (filters, a toggle, Edit and Done) are not history entries. Opening
 * an overlay (a dialog, the Settings panel, a menu) adds a guard entry instead, so Back closes the
 * overlay rather than leaving the page under it (NN/g on overlays: support the Back button).
 *
 * No router library: the app already keeps its own screen state; this maps it to addresses. The
 * pure half (parse and format) is unit-tested; the history half is checked in a browser.
 */

export type Section = 'dex' | 'box' | 'breeding' | 'planner';
export type Page = { kind: 'species'; slug: string } | { kind: 'pal'; id: string } | { kind: 'plans' } | { kind: 'hidden' };
export type Route = { screen: 'home' } | { screen: 'upload' } | { screen: 'app'; section: Section; page: Page | null };

const SECTION_PATH: Record<Section, string> = { dex: 'paldex', box: 'my-pals', breeding: 'breeding', planner: 'planner' };
const PATH_SECTION = new Map(Object.entries(SECTION_PATH).map(([s, p]) => [p, s as Section]));

/** An address to a route; null for an address the app doesn't have. */
export function parseRoute(pathname: string): Route | null {
  let parts: string[];
  try {
    parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (parts.length === 0) return { screen: 'home' };
  const [first, second, ...rest] = parts;
  if (rest.length) return null;
  const head = first.toLowerCase();
  if (head === 'upload') return second === undefined ? { screen: 'upload' } : null;
  const section = PATH_SECTION.get(head);
  if (!section) return null;
  if (second === undefined) return { screen: 'app', section, page: null };
  if (section === 'dex') {
    const s = second.toLowerCase();
    if (s === 'hidden') return { screen: 'app', section, page: { kind: 'hidden' } };
    return /^[a-z0-9-]+$/.test(s) ? { screen: 'app', section, page: { kind: 'species', slug: s } } : null;
  }
  if (section === 'box') return /^[\w-]+$/.test(second) ? { screen: 'app', section, page: { kind: 'pal', id: second } } : null;
  if (section === 'planner' && second.toLowerCase() === 'saved') return { screen: 'app', section, page: { kind: 'plans' } };
  return null;
}

/** A route to its address. A page has one address wherever it was opened from. */
export function formatRoute(route: Route): string {
  if (route.screen === 'home') return '/';
  if (route.screen === 'upload') return '/upload';
  const { page } = route;
  if (!page) return `/${SECTION_PATH[route.section]}`;
  if (page.kind === 'species') return `/paldex/${page.slug}`;
  if (page.kind === 'pal') return `/my-pals/${encodeURIComponent(page.id)}`;
  if (page.kind === 'plans') return '/planner/saved';
  return '/paldex/hidden';
}

/** Which section a page's address belongs to, for a refresh or a link opened fresh. */
export const sectionOf = (page: Page): Section =>
  page.kind === 'pal' ? 'box' : page.kind === 'plans' ? 'planner' : 'dex';

/* ------------------------------------------------------------------ history */

/** What this module keeps in history.state. `i` counts entries in this tab; `guard` marks an overlay's entry. */
export interface HistoryState {
  pd: 1;
  i: number;
  guard?: true;
  /** The /upload entry was opened from the landing page, so finishing an import can go back over it. */
  fromLanding?: true;
}
const isOurs = (s: unknown): s is HistoryState => !!s && typeof s === 'object' && (s as HistoryState).pd === 1;

type Listener = (pathname: string, state: HistoryState) => void;
const listeners = new Set<Listener>();
/** Overlays open now, innermost last: Back closes the last one. `gone`: Back already took its guard entry. */
interface Overlay {
  close: () => void;
  gone: boolean;
}
const overlays: Overlay[] = [];
let index = 0;
/** A history.back() of our own is on its way: writes wait for it, and its popstate is not a navigation. */
let pending: null | { then?: () => void } = null;
const queue: Array<() => void> = [];
let installed = false;

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (isOurs(history.state)) index = history.state.i;
  else history.replaceState({ pd: 1, i: index } satisfies HistoryState, '');
  window.addEventListener('popstate', (e) => {
    const state: HistoryState = isOurs(e.state) ? e.state : { pd: 1, i: 0 };
    index = state.i;
    if (pending) {
      const then = pending.then;
      pending = null;
      then?.();
      while (queue.length && !pending) queue.shift()?.();
      return;
    }
    // Back with an overlay open: the innermost overlay closes. Back already left its guard entry, so the
    // page is where it should be: the entry under the guard.
    const top = overlays.pop();
    if (top) {
      top.gone = true;
      top.close();
      return;
    }
    for (const fn of [...listeners]) fn(location.pathname, state);
  });
}

/** Runs a history write now, or after a pending back() of ours has landed. */
function write(fn: () => void): void {
  install();
  if (pending) queue.push(fn);
  else fn();
}

/** Go to an address: a new history entry, or in place of the current one. */
export function navigate(path: string, opts: { replace?: boolean; fromLanding?: boolean; then?: (entry: HistoryState) => void } = {}): void {
  write(() => {
    const keepUrl = path === location.pathname;
    if (opts.replace) {
      const state: HistoryState = { ...(isOurs(history.state) ? history.state : { pd: 1, i: index }), pd: 1, i: index };
      delete state.guard;
      if (opts.fromLanding) state.fromLanding = true;
      else delete state.fromLanding;
      history.replaceState(state, '', keepUrl ? undefined : path);
    } else if (isOurs(history.state) && history.state.guard) {
      // Leaving from inside an overlay (Settings → See hidden pals, choosing a folder in the upload
      // dialog): the new page takes the overlay's guard entry, so Back goes to the page under it.
      history.replaceState({ pd: 1, i: index, ...(opts.fromLanding ? { fromLanding: true } : {}) } satisfies HistoryState, '', path);
    } else {
      index += 1;
      history.pushState({ pd: 1, i: index, ...(opts.fromLanding ? { fromLanding: true } : {}) } satisfies HistoryState, '', path);
    }
    opts.then?.(current());
  });
}

/** The browser's Back, from the app's own Back control or Esc: listeners hear it like any Back. */
export function back(): void {
  write(() => history.back());
}

/** Back one entry, as the browser's Back button does; `then` runs once it has landed (no listeners called). */
export function goBack(then?: () => void): void {
  write(() => {
    pending = { then };
    history.back();
  });
}

/** The entry this tab is on: its index, and whether it came from the landing page. */
export function current(): HistoryState {
  install();
  return isOurs(history.state) ? history.state : { pd: 1, i: index };
}

/** Called with the address and state after the browser's Back or Forward. Returns an unsubscribe. */
export function onNavigate(fn: Listener): () => void {
  install();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * An overlay opened: add a guard entry at the same address, so Back closes the overlay. When the
 * overlay closes by itself (its own button, Esc, a click outside), call the returned function: it
 * takes the guard entry away again.
 */
export function openOverlay(close: () => void): () => void {
  write(() => {
    index += 1;
    history.pushState({ pd: 1, i: index, guard: true } satisfies HistoryState, '');
  });
  const me: Overlay = { close, gone: false };
  overlays.push(me);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const at = overlays.indexOf(me);
    if (at >= 0) overlays.splice(at, 1);
    if (me.gone) return;
    write(() => {
      if (isOurs(history.state) && history.state.guard) {
        pending = {};
        history.back();
      }
    });
  };
}

/** The document title for a screen: "Anubis · Paldex · PalDoc". */
export function titleFor(parts: Array<string | null | undefined>): string {
  return [...parts.filter((p): p is string => !!p), 'PalDoc'].join(' · ');
}
