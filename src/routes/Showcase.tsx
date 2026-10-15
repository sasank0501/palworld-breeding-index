import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { SiteNotice } from '../components/SiteNotice.tsx';
import { BrowseContext } from '../lib/browse.ts';
import { back as historyBack, current, formatRoute, navigate, onNavigate, parseRoute, sectionOf, titleFor, type Page, type Route } from '../lib/route.ts';
import { DEX_DESCRIPTION, HOME_DESCRIPTION, describePage, speciesDescription } from '../lib/seo.ts';
import { SHOW_SUPPORT, SUPPORT_URL } from '../lib/links.ts';

import type { Roster, RosterPal } from '../types.ts';
import { DEX, nameOf, Chevron } from './showcase/shared.tsx';
import { Box } from './showcase/Box.tsx';
import { Breeding } from './showcase/Breeding.tsx';
import { Dex } from './showcase/Dex.tsx';
import { Dossier } from './showcase/Dossier.tsx';
import { PalSheet } from './showcase/PalSheet.tsx';
import { ArtNotice } from './showcase/Art.tsx';
import { MissingNotice } from './showcase/Missing.tsx';
import { Planner } from './showcase/Planner.tsx';
import { SavedPlans } from './showcase/SavedPlans.tsx';
import { useTabSlider } from './showcase/TabSlider.tsx';
import { useCtx } from './showcase/ctx.ts';
import { DEX_ORDER, PalEgg } from './showcase/parts.tsx';
import { Settings } from './showcase/Settings.tsx';
import { useSkin } from './showcase/skins.ts';
import { HiddenPals } from './showcase/HiddenPals.tsx';
import '../design/showcase.css';
import '../design/showcase-views.css';

/**
 * The app. Home is the Paldex (all 289 species, with a spotlight on your strongest
 * pals); My Pals, Breeding and Planner go deeper. It comes in four Palworld skins
 * (Palpagos, Mount Obsidian, Sakurajima, Feybreak), all styled from tokens in
 * src/design/showcase.css, so every view re-skins from one place.
 *
 * A species or a pal opens *in place of* the section, on a stack, so Back (or Esc)
 * returns to exactly the list you came from, filters and scroll kept.
 *
 * Each tab and each opened page is also a browser history entry with its own address
 * (src/lib/route.ts): the browser's Back, a mouse's back button, Esc and the "← Back" link
 * all step back the same way, a refresh keeps the page, and a page can be linked to.
 */
type Section = 'dex' | 'box' | 'breeding' | 'planner';
const SECTIONS: Array<[Section, string]> = [
  ['dex', 'Paldex'],
  ['box', 'My Pals'],
  ['breeding', 'Breeding'],
  ['planner', 'Planner'],
];

type Entry = { kind: 'species'; id: string } | { kind: 'pal'; pal: RosterPal; list: RosterPal[] } | { kind: 'plans' } | { kind: 'hidden' };
/** What one history entry shows: a section, and the pages opened over it. */
type Snapshot = { section: Section; stack: Entry[] };

const SLUG_ID = new Map(Object.values(DEX).map((d) => [d.slug, d.id]));
const pageOf = (e: Entry): Page =>
  e.kind === 'species'
    ? { kind: 'species', slug: DEX[e.id]?.slug ?? e.id }
    : e.kind === 'pal'
      ? { kind: 'pal', id: e.pal.instanceId }
      : { kind: e.kind };
const routeOf = (snap: Snapshot): Route => {
  const top = snap.stack[snap.stack.length - 1];
  return { screen: 'app', section: snap.section, page: top ? pageOf(top) : null };
};
const entryName = (e: Entry): string =>
  e.kind === 'plans' ? 'Saved plans' : e.kind === 'hidden' ? 'Hidden from the spotlight' : e.kind === 'species' ? nameOf(e.id) : e.pal.nickname || nameOf(e.pal.palId ?? '');

/** Focus the visible page's main heading (made focusable for this, not for Tab). */
function focusHeading(): void {
  const h = [...document.querySelectorAll<HTMLElement>('#main h1')].find((el) => !el.closest('[hidden]'));
  if (!h) return;
  if (!h.hasAttribute('tabindex')) h.tabIndex = -1;
  h.focus({ preventScroll: true });
}

export default function Showcase({
  roster,
  onOpenSave,
  justImported = false,
  notice,
  footer,
  browse = false,
  initial,
}: {
  roster: Roster;
  /** The address the app opened at (a refresh or a link), or none for the Paldex. */
  initial?: Route;
  /** Where "Open a different save" goes (and, in browse mode, "Upload save"). */
  onOpenSave?: () => void;
  /** Browse mode: a visit with no save. Only the Paldex and its species pages (lib/browse.ts). */
  browse?: boolean;
  /** True right after an import, to check for marked pals that left the save. */
  justImported?: boolean;
  /** The disclaimer, shown as a card on each visit until dismissed into the footer. */
  notice?: ReactNode;
  /** The site footer (id "site-footer"), placed at the end of the scrolling page. */
  footer?: ReactNode;
}) {
  const [skin, setSkin] = useSkin();
  const ctx = useCtx(roster);
  // A route to what it shows here: a species by its slug, a pal by its id in this save. An address
  // that doesn't match (an unknown species, a pal from another save) falls back to its section.
  // A visit with no save has only the Paldex and species pages.
  const fromRoute = (route: Route | null): Snapshot => {
    if (!route || route.screen !== 'app') return { section: 'dex', stack: [] };
    const page = route.page;
    const section: Section = browse ? 'dex' : page ? sectionOf(page) : route.section;
    if (!page) return { section, stack: [] };
    if (page.kind === 'species') {
      const id = SLUG_ID.get(page.slug);
      return { section, stack: id ? [{ kind: 'species', id }] : [] };
    }
    if (browse) return { section, stack: [] };
    if (page.kind === 'pal') {
      const pal = roster.pals.find((p) => p.instanceId === page.id);
      return { section, stack: pal ? [{ kind: 'pal', pal, list: [pal] }] : [] };
    }
    return { section, stack: [page.kind === 'plans' ? { kind: 'plans' } : { kind: 'hidden' }] };
  };
  const [first] = useState(() => fromRoute(initial ?? null));
  const [section, setSection] = useState<Section>(first.section);
  const [stack, setStack] = useState<Entry[]>(first.stack);
  /** What each history entry in this tab showed, by its index, so Back and Forward restore it exactly. */
  const snaps = useRef(new Map<number, Snapshot>());
  const now = useRef<Snapshot>(first);
  now.current = { section, stack };
  const record = (snap: Snapshot, replace: boolean): void =>
    navigate(formatRoute(routeOf(snap)), { replace, then: (entry) => snaps.current.set(entry.i, snap) });
  const [planTarget, setPlanTarget] = useState('');
  const [checkMissing, setCheckMissing] = useState(justImported);
  useEffect(() => setCheckMissing(justImported), [justImported, roster]);
  const missingDone = useCallback(() => setCheckMissing(false), []);
  const [planToOpen, setPlanToOpen] = useState<{ species: string; passives: string[]; key: number } | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const slider = useTabSlider(tabs, section, skin);

  // The sub bar and sticky panels sit under the nav at --nav-h. The nav's height
  // depends on the width, the theme's border and the font, so it is measured, not
  // guessed: a fixed value left the "← Back" bar partly under the nav on every width.
  useEffect(() => {
    const el = nav.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => shell.current?.style.setProperty('--nav-h', `${Math.ceil(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const savedScroll = useRef(0);
  const top = stack[stack.length - 1];
  /** What had focus when each page was opened, so Back can return to it. */
  const openers = useRef<(HTMLElement | null)[]>([]);

  const push = useCallback((e: Entry) => {
    openers.current.push(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const { section: sec, stack: s } = now.current;
    if (s.length === 0) savedScroll.current = page.current?.scrollTop ?? 0;
    const next = [...s, e];
    setStack(next);
    record({ section: sec, stack: next }, false);
    page.current?.scrollTo({ top: 0 });
  }, []);

  // The app's own Back (the "← Back" link, Esc) is the browser's Back, so all of them agree. A page
  // opened straight from an address has nothing behind it in this tab: it closes in place instead.
  const back = useCallback(() => {
    if (current().i > 0) {
      historyBack();
      return;
    }
    const { section: sec, stack: s } = now.current;
    const next = s.slice(0, -1);
    setStack(next);
    record({ section: sec, stack: next }, true);
  }, []);

  // The address the app opened at is this entry's; Back and Forward restore what each entry showed.
  useEffect(() => {
    record(first, true);
    return onNavigate((pathname, entry) => {
      const route = parseRoute(pathname);
      // An entry from before the save was opened (the landing page, the import): with a save, that is
      // the Paldex. With no save, the app gives way to the landing page (App.tsx).
      if (!route || route.screen !== 'app') {
        if (browse) return;
        navigate('/paldex', { replace: true });
      }
      const snap = snaps.current.get(entry.i) ?? fromRoute(route);
      snaps.current.set(entry.i, snap);
      if (snap.section !== now.current.section) {
        setSection(snap.section);
        openers.current = [];
        depth.current = snap.stack.length;
        savedScroll.current = 0;
        page.current?.scrollTo({ top: 0 });
        requestAnimationFrame(focusHeading);
      }
      setStack(snap.stack);
    });
  }, []);

  // Back to the list: put the scroll where it was, once the list is visible again.
  useEffect(() => {
    if (stack.length === 0) requestAnimationFrame(() => page.current?.scrollTo({ top: savedScroll.current }));
  }, [stack.length]);

  // Focus follows the page (docs/A11Y.md item 7). The control that opened a page
  // disappears with the list, and focus left on nothing makes a screen reader read
  // the whole new page from the top. So: a new page focuses its heading, and Back
  // returns focus to whatever opened the page.
  const depth = useRef(stack.length);
  useEffect(() => {
    const was = depth.current;
    depth.current = stack.length;
    if (stack.length > was) requestAnimationFrame(focusHeading);
    else if (stack.length < was) {
      const opener = openers.current.splice(stack.length).at(0);
      // The opener may be gone, or hidden (a button in the closed settings panel).
      requestAnimationFrame(() => (opener?.isConnected && opener.getClientRects().length ? opener.focus({ preventScroll: true }) : focusHeading()));
    }
  }, [stack.length]);

  // Straight after an import the import screen is gone: start on the Paldex heading.
  useEffect(() => {
    if (justImported) requestAnimationFrame(focusHeading);
  }, [justImported, roster]);

  const openSpecies = useCallback((id: string) => push({ kind: 'species', id }), [push]);
  const openPal = useCallback((pal: RosterPal, list?: RosterPal[]) => push({ kind: 'pal', pal, list: list ?? [pal] }), [push]);

  const go = (s: Section): void => {
    const same = s === section && stack.length === 0;
    setSection(s);
    openers.current = [];
    depth.current = 0;
    setStack([]);
    savedScroll.current = 0;
    page.current?.scrollTo({ top: 0 });
    if (!same) record({ section: s, stack: [] }, false);
  };

  const plan = (id: string): void => {
    setPlanTarget(id);
    go('planner');
  };

  /** Previous / next within what you opened it from: the pal list, or dex order. */
  // Previous and next replace the page's entry rather than adding one: Back goes to the list, not
  // through every pal stepped past.
  const step = useCallback((delta: number) => {
    const { section: sec, stack: s } = now.current;
    const t = s[s.length - 1];
    if (!t || t.kind === 'plans' || t.kind === 'hidden') return;
    let swap: Entry | null = null;
    if (t.kind === 'pal') {
      const i = t.list.findIndex((p) => p.instanceId === t.pal.instanceId);
      const next = t.list[i + delta];
      if (next) swap = { ...t, pal: next };
    } else {
      const i = DEX_ORDER.findIndex((d) => d.id === t.id);
      const next = DEX_ORDER[i + delta];
      if (next) swap = { kind: 'species', id: next.id };
    }
    if (!swap) return;
    const stackNext = [...s.slice(0, -1), swap];
    setStack(stackNext);
    record({ section: sec, stack: stackNext }, true);
    page.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent): void => {
      // Typing: arrows move the caret, Esc is the field's own (the note box uses it to cancel).
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable) return;
      if (e.key === 'Escape') back();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, back, step]);

  const sectionLabel = SECTIONS.find(([k]) => k === section)?.[1] ?? '';

  // The title names the screen, so a screen reader, the tab and the history list all say where you are.
  // The Paldex and its species pages are also what a search can find (src/lib/seo.ts).
  useEffect(() => {
    const title = top ? titleFor([entryName(top), top.kind === 'species' ? 'Paldex' : sectionLabel]) : titleFor([sectionLabel]);
    const page = top ? pageOf(top) : null;
    const path = section === 'dex' && (!page || page.kind === 'species') ? formatRoute({ screen: 'app', section, page }) : null;
    describePage(title, top?.kind === 'species' ? speciesDescription(entryName(top)) : section === 'dex' ? DEX_DESCRIPTION : HOME_DESCRIPTION, path);
  }, [top, section, sectionLabel]);

  return (
    <BrowseContext.Provider value={browse}>
    <div className="sc-shell" data-skin={skin} ref={shell}>
      <div className="sc-fx" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      {/* tabIndex -1: Firefox makes a scrolling box a Tab stop, and this one is the whole page.
          The keyboard still scrolls it from whatever inside it has focus. */}
      <div className="sc-page" ref={page} tabIndex={-1}>
        {/* Skips the top bar. It moves focus itself: the URL's hash belongs to the app (#chibi). */}
        <a
          className="sc-skip"
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('main')?.focus();
          }}
        >
          Skip to content
        </a>
        {notice && <SiteNotice footerId="site-footer">{notice}</SiteNotice>}
        <nav className="sc-nav" aria-label="Showcase" ref={nav}>
          <span className="sc-brand" aria-hidden="true">
            <PalEgg size={30} />
            PalDoc
          </span>
          {browse ? (
            <span className="sc-tabs-gap" />
          ) : (
            <div className="sc-tabs" role="tablist" ref={tabs}>
              {slider.pos && (
                <span
                  className={`sc-tab-slider${slider.animate ? ' go' : ''}`}
                  aria-hidden="true"
                  style={{ transform: `translate(${slider.pos.x}px, ${slider.pos.y}px)`, width: slider.pos.w, height: slider.pos.h }}
                />
              )}
              {SECTIONS.map(([k, label]) => (
                <button key={k} role="tab" aria-selected={section === k && !top} className={section === k ? 'on' : ''} onClick={() => go(k)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {browse && onOpenSave && (
            <button type="button" className="sc-btn sc-navup" onClick={onOpenSave}>
              Upload save
            </button>
          )}
          {SHOW_SUPPORT && (
            <a className="sc-coffee" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M5 10h11v5.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15.5z" />
                <path d="M16 11.5h1.5a2.500 2.500 0 0 1 0 5H16" />
                <path d="M8.5 3.5c-1 1.200 1 2 0 3.200M12.500 3.500c-1 1.200 1 2 0 3.200" />
              </svg>
              <span className="sc-coffee-label">Buy me a coffee</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <Settings
            browse={browse}
            skin={skin}
            onSkin={setSkin}
            onOpenSave={onOpenSave}
            spotlightHidden={Object.keys(ctx.user.data?.hidden ?? {}).length}
            onSeeHidden={() => push({ kind: 'hidden' })}
          />
        </nav>

        <main id="main" tabIndex={-1}>
          {!browse && <ArtNotice />}
          {checkMissing && <MissingNotice ctx={ctx} onDone={missingDone} />}

          {top && (
            <div className="sc-subbar">
              <button className="sc-link back" onClick={back}>
                ← {stack.length > 1 ? 'Back' : sectionLabel}
              </button>
              <span className="sc-crumbs">
                {stack.map((e, i) => (
                  <span key={i}>{entryName(e)}</span>
                ))}
              </span>
              {top.kind !== 'plans' && top.kind !== 'hidden' && (
                <span className="sc-stepper">
                  <button onClick={() => step(-1)} aria-label="Previous">
                <Chevron dir="left" />
              </button>
                  <button onClick={() => step(1)} aria-label="Next">
                <Chevron dir="right" />
              </button>
                </span>
              )}
            </div>
          )}

          {top?.kind === 'species' && (
            <Dossier ctx={ctx} id={top.id} onSpecies={openSpecies} onPal={(p) => openPal(p, ctx.byPal.get(top.id))} onPlan={plan} />
          )}
          {top?.kind === 'plans' && (
            <SavedPlans
              ctx={ctx}
              onOpen={(p) => {
                setPlanToOpen({ species: p.species, passives: p.passives, key: Date.now() });
                go('planner');
              }}
            />
          )}
          {top?.kind === 'hidden' && <HiddenPals ctx={ctx} onPal={(p) => openPal(p, [p])} />}
          {top?.kind === 'pal' && (
            <PalSheet
              pal={top.pal}
              index={top.list.findIndex((p) => p.instanceId === top.pal.instanceId)}
              total={top.list.length}
              onStep={step}
              onSpecies={openSpecies}
              user={ctx.user}
            />
          )}

          {/* Kept mounted (just hidden) under a dossier, so filters and scroll survive Back. */}
          <div hidden={!!top}>
            {section === 'dex' && <Dex ctx={ctx} onSpecies={openSpecies} onPal={(p) => openPal(p, [p])} onUpload={browse ? onOpenSave : undefined} />}
            {section === 'box' && <Box ctx={ctx} onPal={openPal} />}
            {section === 'breeding' && <Breeding ctx={ctx} onSpecies={openSpecies} />}
            {section === 'planner' && (
              <Planner
                ctx={ctx}
                initialTarget={planTarget}
                initialPlan={planToOpen}
                onAllPlans={() => push({ kind: 'plans' })}
                onSpecies={openSpecies}
                onPal={(p) => openPal(p, [p])}
              />
            )}
          </div>
        </main>
        {footer}
      </div>
    </div>
    </BrowseContext.Provider>
  );
}
