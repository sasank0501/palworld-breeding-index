import { useEffect, useState, type CSSProperties } from 'react';

import { artUrl, useArtState } from '../art/resolve.ts';
import { DEX } from './showcase/shared.tsx';

/**
 * Pals drifting behind the import screen: rows that fill the window, as many as
 * its height allows (a phone gets about 8, a large monitor 11 or more), each
 * moving the opposite way to the one above. Before any art is in this browser
 * they are eggs tinted by element, our own drawing; once there is art, they are
 * silhouettes of real pals from it.
 *
 * Decorative, so hidden from screen readers. Motion that runs on its own for more
 * than 5 seconds needs a way to stop it (WCAG 2.2.2): the Pause button, remembered
 * in this browser. Under reduced motion the rows stand still and the button is not
 * needed. Each row moves as one strip (transform only), so 11 rows are 11 moving
 * things, not hundreds.
 */

const ROW = 104;
const ITEM = 112;
const ELEMENTS = ['water', 'fire', 'grass', 'electric', 'ice', 'ground', 'dark', 'dragon', 'neutral'];
const PAUSED_KEY = 'palworld-backdrop-paused';
/** Which species give their silhouettes: every 12th, so the shapes vary. */
const ICONS = Object.values(DEX)
  .filter((d, i) => d.img && i % 12 === 0)
  .map((d) => d.img as string);

function useViewport(): { w: number; h: number } {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSize(read()));
    };
    window.addEventListener('resize', on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', on);
    };
  }, []);
  return size;
}

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Silhouette URLs once the art is in this browser (or on the server); none before. */
function useSilhouettes(): string[] {
  const art = useArtState();
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    if (art?.kind !== 'local' && art?.kind !== 'server') {
      setUrls([]);
      return;
    }
    void Promise.all(ICONS.map((p) => artUrl(p))).then((all) => live && setUrls(all.filter((u): u is string => !!u)));
    return () => {
      live = false;
    };
  }, [art]);
  return urls;
}

function Egg({ element }: { element: string }) {
  return (
    <svg className={`imp-egg e-${element}`} viewBox="0 0 40 40" width="64" height="64">
      <path className="egg-shell" d="M20 3C12 3 6.5 15 6.5 24.5 6.5 32 12.5 37 20 37s13.5-5 13.5-12.5C33.5 15 28 3 20 3z" />
      <path className="egg-band" d="M7.2 21.5l4.3 3.2 4.3-3.4 4.2 3.4 4.3-3.4 4.3 3.4 4.2-3.2" />
    </svg>
  );
}

export function ImportBackdrop() {
  const { w, h } = useViewport();
  const reduced = useReducedMotion();
  const silhouettes = useSilhouettes();
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(PAUSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const togglePause = () => {
    setPaused((p) => {
      try {
        localStorage.setItem(PAUSED_KEY, p ? '0' : '1');
      } catch {
        /* a convenience only */
      }
      return !p;
    });
  };

  const rows = Math.max(1, Math.floor(h / ROW));
  const per = Math.ceil(w / ITEM) + 1;
  // Wider screens get longer strips; scaling the duration keeps the drift speed the same.
  const scale = Math.max(0.5, w / 1280);

  return (
    <>
      <div className={`imp-backdrop${paused ? ' is-paused' : ''}`} aria-hidden="true">
        {Array.from({ length: rows }, (_, r) => {
          // Two identical copies side by side: the strip slides by half its width and loops without a seam.
          const strip = (copy: string) =>
            Array.from({ length: per }, (_, i) => {
              const k = (r * 5 + i * 3) % 997;
              const key = `${copy}${i}`;
              if (silhouettes.length) return <img key={key} className="imp-sil" src={silhouettes[k % silhouettes.length]} alt="" />;
              return <Egg key={key} element={ELEMENTS[k % ELEMENTS.length]} />;
            });
          const style = { '--dur': `${(50 + ((r * 7) % 4) * 8) * scale}s`, '--delay': `-${(r * 11) % 37}s` } as CSSProperties;
          return (
            <div key={r} className={`imp-row${r % 2 ? ' rev' : ''}`}>
              <div className="imp-track" style={style}>
                {strip('a')}
                {strip('b')}
              </div>
            </div>
          );
        })}
      </div>
      {!reduced && (
        <button type="button" className="imp-pause" aria-pressed={paused} onClick={togglePause}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            {paused ? <path d="M3 2 L12 7 L3 12 Z" /> : <path d="M2 2h3.5v10H2zM8.5 2H12v10H8.5z" />}
          </svg>
          {paused ? 'Play background' : 'Pause background'}
        </button>
      )}
    </>
  );
}
