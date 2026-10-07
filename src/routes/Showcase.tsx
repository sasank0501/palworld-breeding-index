import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { SiteNotice } from '../components/SiteNotice.tsx';

import type { Roster, RosterPal } from '../types.ts';
import { nameOf, Chevron } from './showcase/shared.tsx';
import { Box } from './showcase/Box.tsx';
import { Breeding } from './showcase/Breeding.tsx';
import { Dex } from './showcase/Dex.tsx';
import { Dossier } from './showcase/Dossier.tsx';
import { PalSheet } from './showcase/PalSheet.tsx';
import { ArtNotice } from './showcase/Art.tsx';
import { MissingNotice } from './showcase/Missing.tsx';
import { Planner } from './showcase/Planner.tsx';
import { SavedPlans } from './showcase/SavedPlans.tsx';
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
 */
type Section = 'dex' | 'box' | 'breeding' | 'planner';
const SECTIONS: Array<[Section, string]> = [
  ['dex', 'Paldex'],
  ['box', 'My Pals'],
  ['breeding', 'Breeding'],
  ['planner', 'Planner'],
];

type Entry = { kind: 'species'; id: string } | { kind: 'pal'; pal: RosterPal; list: RosterPal[] } | { kind: 'plans' } | { kind: 'hidden' };

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
}: {
  roster: Roster;
  onOpenSave?: () => void;
  /** True right after an import, to check for marked pals that left the save. */
  justImported?: boolean;
  /** The disclaimer, shown as a card on each visit until dismissed into the footer. */
  notice?: ReactNode;
  /** The site footer (id "site-footer"), placed at the end of the scrolling page. */
  footer?: ReactNode;
}) {
  const [skin, setSkin] = useSkin();
  const ctx = useCtx(roster);
  const [section, setSection] = useState<Section>('dex');
  const [stack, setStack] = useState<Entry[]>([]);
  const [planTarget, setPlanTarget] = useState('');
  const [checkMissing, setCheckMissing] = useState(justImported);
  useEffect(() => setCheckMissing(justImported), [justImported, roster]);
  const missingDone = useCallback(() => setCheckMissing(false), []);
  const [planToOpen, setPlanToOpen] = useState<{ species: string; passives: string[]; key: number } | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);

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
    setStack((s) => {
      if (s.length === 0) savedScroll.current = page.current?.scrollTop ?? 0;
      return [...s, e];
    });
    page.current?.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    setStack((s) => s.slice(0, -1));
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
    setSection(s);
    openers.current = [];
    depth.current = 0;
    setStack([]);
    savedScroll.current = 0;
    page.current?.scrollTo({ top: 0 });
  };

  const plan = (id: string): void => {
    setPlanTarget(id);
    go('planner');
  };

  /** Previous / next within what you opened it from: the pal list, or dex order. */
  const step = useCallback((delta: number) => {
    setStack((s) => {
      const t = s[s.length - 1];
      if (!t || t.kind === 'plans' || t.kind === 'hidden') return s;
      if (t.kind === 'pal') {
        const i = t.list.findIndex((p) => p.instanceId === t.pal.instanceId);
        const next = t.list[i + delta];
        return next ? [...s.slice(0, -1), { ...t, pal: next }] : s;
      }
      const i = DEX_ORDER.findIndex((d) => d.id === t.id);
      const next = DEX_ORDER[i + delta];
      return next ? [...s.slice(0, -1), { kind: 'species', id: next.id }] : s;
    });
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

  return (
    <div className="sc-shell" data-skin={skin} ref={shell}>
      <div className="sc-fx" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <div className="sc-page" ref={page}>
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
            Paldex
          </span>
          <div className="sc-tabs" role="tablist">
            {SECTIONS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={section === k && !top} className={section === k ? 'on' : ''} onClick={() => go(k)}>
                {label}
              </button>
            ))}
          </div>
          <Settings
            skin={skin}
            onSkin={setSkin}
            onOpenSave={onOpenSave}
            spotlightHidden={Object.keys(ctx.user.data?.hidden ?? {}).length}
            onSeeHidden={() => push({ kind: 'hidden' })}
          />
        </nav>

        <main id="main" tabIndex={-1}>
          <ArtNotice />
          {checkMissing && <MissingNotice ctx={ctx} onDone={missingDone} />}

          {top && (
            <div className="sc-subbar">
              <button className="sc-link back" onClick={back}>
                ← {stack.length > 1 ? 'Back' : sectionLabel}
              </button>
              <span className="sc-crumbs">
                {stack.map((e, i) => (
                  <span key={i}>{e.kind === 'plans' ? 'Saved plans' : e.kind === 'hidden' ? 'Hidden from the spotlight' : e.kind === 'species' ? nameOf(e.id) : e.pal.nickname ?? nameOf(e.pal.palId ?? '')}</span>
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
            {section === 'dex' && <Dex ctx={ctx} onSpecies={openSpecies} onPal={(p) => openPal(p, [p])} />}
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
  );
}
