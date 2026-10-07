import { useRef, useState, type ReactNode } from 'react';

const SEEN = 'palworld-notice-seen';

/**
 * The site's disclaimer as a card at the bottom of the screen, once per visit (a tab's
 * session). “Got it” sends it into the footer at the end of the page, where the same
 * words stay: when the footer is on screen the card shrinks into it, otherwise it slides
 * down toward it. With reduced motion it simply goes.
 *
 * Not a dialog: nothing behind it is blocked, and it takes no focus on its own. It sits
 * early in the page so keyboard users reach “Got it” before the content it covers.
 */
export function SiteNotice({ children, footerId }: { children: ReactNode; footerId: string }) {
  const [shown, setShown] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN) !== '1';
    } catch {
      return true; // no storage: show it on every load rather than never
    }
  });
  const card = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  if (!shown) return null;

  const dismiss = (): void => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      sessionStorage.setItem(SEEN, '1');
    } catch {
      /* it will show again next load */
    }
    // The button is about to go: keep keyboard focus in the page, not on <body>.
    document.getElementById('main')?.focus({ preventScroll: true });

    const el = card.current;
    const footer = document.getElementById(footerId);
    if (!el || !el.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(false);
      return;
    }
    const from = el.getBoundingClientRect();
    const to = footer?.getBoundingClientRect();
    const onScreen = to && to.top < window.innerHeight && to.bottom > 0;
    const frames: Keyframe[] = onScreen
      ? [
          { transform: 'none', opacity: 1 },
          {
            transform: `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(${to.width / from.width}, ${to.height / from.height})`,
            opacity: 0,
          },
        ]
      : [
          { transform: 'none', opacity: 1 },
          { transform: `translateY(${window.innerHeight - from.top}px) scale(0.92)`, opacity: 0.4 },
        ];
    el.animate(frames, { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }).finished.then(() => {
      setShown(false);
      // Where the words went: the footer glows once, if it is on screen.
      if (onScreen) footer?.animate([{ backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)' }, { backgroundColor: 'transparent' }], { duration: 700, easing: 'ease-out' });
    });
  };

  return (
    <div ref={card} className="sc-notice" role="region" aria-label="About this site">
      <p>{children}</p>
      <button type="button" className="sc-btn" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
