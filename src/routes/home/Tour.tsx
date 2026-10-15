import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { PalEgg } from '../showcase/parts.tsx';
import { CHAPTERS, type Chapter } from './chapters.ts';
import { buildReel, clamp, pageOffset, positionAt, textAt, type Reel } from './reel.ts';
import type { Skin } from '../showcase/skins.ts';
import { SHOT, shotAvif, shotUrl } from './shots.ts';

/**
 * The homepage tour: the app's five pages shown one after another while the
 * visitor scrolls. On a wide screen the description sits on the left and the app
 * on the right, both held in place (position: sticky) while the page scrolls past;
 * the app's page moves as you scroll, and each new page rides up over the last.
 * Nothing fades: every movement is the scroll position, eased after, so a wheel
 * click glides instead of jumping.
 *
 * On a phone or tablet, or for anyone who asked for less motion, there is no
 * pinning: the same five chapters are stacked, each with one picture. The text is
 * in the page either way, in reading order, so a screen reader gets it all and the
 * pictures only repeat it.
 */

/** Below this width, or under reduced motion, the chapters are simply stacked. */
const STACKED = '(max-width: 900px), (prefers-reduced-motion: reduce)';

function useStacked(): boolean {
  const [stacked, setStacked] = useState(() => matchMedia(STACKED).matches);
  useEffect(() => {
    const m = matchMedia(STACKED);
    const on = () => setStacked(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return stacked;
}

export function Tour({ skin }: { skin: Skin }) {
  return useStacked() ? <StackedTour skin={skin} /> : <PinnedTour skin={skin} />;
}

function ChapterText({ chapter, index }: { chapter: Chapter; index: number }) {
  const [before, accent, after] = chapter.title;
  return (
    <>
      <p className="home-mono">
        {index + 1} of {CHAPTERS.length} · {chapter.name}
      </p>
      <h2 id={`tour-${index}`}>
        {before}
        <em>{accent}</em>
        {after}
      </h2>
      <p className="tour-what">{chapter.text}</p>
      <ul className="tour-points">
        {chapter.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------------

function PinnedTour({ skin }: { skin: Skin }) {
  const story = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const layers = useRef<Array<HTMLImageElement | null>>([]);

  // One layer per distinct page, in tour order (neighbouring chapters share one).
  const pages = CHAPTERS.filter((c, i) => i === 0 || CHAPTERS[i - 1].page !== c.page).map((c) => c.page);

  useEffect(() => {
    const storyEl = story.current;
    const frameEl = frame.current;
    const copyEl = copy.current;
    const stripEl = strip.current;
    if (!storyEl || !frameEl || !copyEl || !stripEl) return;

    let reel: Reel = buildReel(CHAPTERS, SHOT, { w: 1, h: 1 });
    let target = 0; // where the scroll says the reel should be
    let shown = 0; // where it is drawn: glides toward `target`
    let textTarget = 0;
    let textShown = 0;
    let last = 0;
    let frameId = 0;

    const draw = () => {
      reel.pages.forEach((_, layer) => {
        const img = layers.current[layer];
        if (img) img.style.transform = `translate3d(0, ${pageOffset(reel, layer, shown).toFixed(2)}px, 0)`;
      });
      stripEl.style.transform = `translate3d(0, ${(-textShown * copyEl.clientHeight).toFixed(2)}px, 0)`;
    };

    const tick = (now: number) => {
      const ease = 1 - Math.exp(-Math.min(64, now - last) / 120);
      last = now;
      shown += (target - shown) * ease;
      textShown += (textTarget - textShown) * ease;
      if (Math.abs(target - shown) < 0.3) shown = target;
      if (Math.abs(textTarget - textShown) < 0.0005) textShown = textTarget;
      draw();
      frameId = shown !== target || textShown !== textTarget ? requestAnimationFrame(tick) : 0;
    };

    const update = (jump: boolean) => {
      const range = storyEl.offsetHeight - innerHeight;
      const progress = clamp(-storyEl.getBoundingClientRect().top / range) * CHAPTERS.length;
      target = positionAt(reel, progress);
      textTarget = textAt(CHAPTERS.length, progress);
      if (jump) {
        shown = target;
        textShown = textTarget;
        draw();
      } else if (!frameId) {
        last = performance.now();
        frameId = requestAnimationFrame(tick);
      }
    };

    const measure = () => {
      reel = buildReel(CHAPTERS, SHOT, { w: frameEl.clientWidth, h: frameEl.clientHeight });
      update(true);
    };

    const onScroll = () => update(false);
    addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(frameEl);
    measure();
    return () => {
      removeEventListener('scroll', onScroll);
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <section className="tour" ref={story} style={{ '--n': CHAPTERS.length } as CSSProperties} aria-label="A tour of PalDoc">
      <div className="tour-copy" ref={copy}>
        <div className="tour-strip" ref={strip}>
          {CHAPTERS.map((chapter, i) => (
            <article className="tour-chapter" key={chapter.name} aria-labelledby={`tour-${i}`}>
              <ChapterText chapter={chapter} index={i} />
            </article>
          ))}
        </div>
      </div>
      <div className="tour-stage" aria-hidden="true">
        <div className="tour-window">
          <div className="tour-chrome">
            <i />
            <i />
            <i />
            <span>paldoc.app</span>
          </div>
          <div className="tour-frame" ref={frame}>
            {pages.map((page, i) => {
              const url = shotUrl(page, skin);
              const avif = shotAvif(page, skin);
              return url ? (
                <picture key={page}>
                  {avif && <source type="image/avif" srcSet={avif} />}
                  <img
                    ref={(el) => {
                      layers.current[i] = el;
                    }}
                    src={url}
                    alt=""
                    draggable={false}
                    decoding="async"
                  />
                </picture>
              ) : null;
            })}
            {!shotUrl(pages[0], skin) && (
              <div className="tour-missing">
                <PalEgg size={72} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------

function StackedTour({ skin }: { skin: Skin }) {
  return (
    <section className="tour-stacked" aria-label="A tour of PalDoc">
      {CHAPTERS.map((chapter, i) => {
        const url = shotUrl(chapter.page, skin);
        const avif = shotAvif(chapter.page, skin);
        // Show the middle of the stretch of the page this chapter is about.
        const middle = (chapter.from + chapter.to) / 2;
        return (
          <article className="tour-chapter" key={chapter.name} aria-labelledby={`tour-${i}`}>
            <ChapterText chapter={chapter} index={i} />
            <figure className="tour-still">
              {url ? (
                <picture>
                  {avif && <source type="image/avif" srcSet={avif} />}
                  <img
                    src={url}
                    alt={`The ${chapter.name} view of PalDoc, with every pal as a silhouette`}
                    loading="lazy"
                    decoding="async"
                    style={{ transform: `translateY(${(-middle / SHOT.h) * 100}%)` }}
                  />
                </picture>
              ) : (
                <PalEgg size={64} />
              )}
            </figure>
          </article>
        );
      })}
    </section>
  );
}
