import { useEffect, useRef, useState, type ReactNode } from 'react';

import { stripBoss } from '../save/species.ts';

/**
 * A pal's in-game 3D model, rotatable, when one has been built locally — else
 * whatever `fallback` is (the flat portrait).
 *
 * Models come from scripts/build-pal-models.mjs and are gitignored, so most
 * machines have none and many pals may be missing even where some exist. The
 * build writes pal-models/index.json listing what exists; model-viewer (three.js,
 * ~1 MB) is only imported once a model is known to exist, and a pal without one
 * never pays for it.
 *
 * Every model URL carries the manifest's version stamp. model-viewer caches
 * parsed models in memory by URL for the life of the tab, so a model rebuilt
 * while the page is open would otherwise keep showing the old one — which is
 * how a freshly animated model still appeared in its T-pose.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        /** React 18 passes custom-element props through as attributes verbatim, so
         *  `className` would land as a literal "classname" attribute. */
        class?: string;
        src?: string;
        alt?: string;
        'camera-controls'?: string;
        'auto-rotate'?: string;
        /** Plays the model's first animation — the idle or rest loop, when built with one. */
        autoplay?: string;
        'rotation-per-second'?: string;
        'interaction-prompt'?: string;
        'shadow-intensity'?: string;
        exposure?: string;
        'camera-orbit'?: string;
      };
    }
  }
}

type State = 'probing' | 'ready' | 'none';

/** One entry of pal-models/index.json. */
interface ModelEntry {
  /** Build time; changes on every rebuild. */
  v: number;
  chibi: boolean;
  /** Set for Blueprint-only pals: the model they borrow (LilyQueen_Dark -> LilyQueen_Ice). */
  file?: string;
}

const BASE = `${import.meta.env.BASE_URL}pal-models/`;

/** Boss and normal variants share one mesh; the file is keyed by the base codename. */
const modelName = (characterId: string): string => stripBoss(characterId).base;

const modelUrl = (name: string, entry: ModelEntry, chibi: boolean): string =>
  `${BASE}${entry.file ?? name}${chibi ? '.chibi' : ''}.glb?v=${entry.v}`;

/**
 * Read fresh on every page open (it is a few hundred bytes), so a rebuild is
 * picked up without a reload. Missing manifest = no models; the dev server
 * answers a missing file with index.html, which fails to parse and lands there.
 */
async function loadManifest(): Promise<Record<string, ModelEntry>> {
  try {
    const res = await fetch(`${BASE}index.json`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as Record<string, ModelEntry>) : {};
  } catch {
    return {};
  }
}

export function PalModel({ characterId, name, fallback }: { characterId: string; name: string; fallback: ReactNode }) {
  const [state, setState] = useState<State>('probing');
  const [entry, setEntry] = useState<ModelEntry | null>(null);
  // Chibi first: it is the look the cards' stills use. Normal stays one click
  // away until the chibi builds are fully tuned.
  const [chibi, setChibi] = useState(true);
  const viewer = useRef<HTMLElement>(null);
  const model = modelName(characterId);

  useEffect(() => {
    let cancelled = false;
    setState('probing');
    setChibi(true);
    loadManifest()
      .then(async (manifest) => {
        const found = manifest[model] ?? null;
        if (found) await import('@google/model-viewer');
        if (cancelled) return;
        setEntry(found);
        if (found && !found.chibi) setChibi(false);
        setState(found ? 'ready' : 'none');
      })
      .catch(() => {
        if (!cancelled) setState('none');
      });
    return () => {
      cancelled = true;
    };
  }, [model]);

  // A file that exists but fails to parse should still leave the portrait up.
  // On load, re-frame once the loop has started: the initial framing measures
  // the bind (T-)pose, and a pal that sits, coils or lies down in its rest
  // animation ends up half out of shot.
  useEffect(() => {
    const el = viewer.current as (HTMLElement & { updateFraming?: () => Promise<void> }) | null;
    if (state !== 'ready' || !el) return;
    let timer = 0;
    const onError = (): void => setState('none');
    const onLoad = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void el.updateFraming?.(), 400);
    };
    el.addEventListener('error', onError);
    el.addEventListener('load', onLoad);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('error', onError);
      el.removeEventListener('load', onLoad);
    };
  }, [state]);

  if (state !== 'ready' || !entry) return <>{fallback}</>;

  return (
    <>
      <model-viewer
        ref={viewer}
        class="dl-model"
        src={modelUrl(model, entry, chibi)}
        alt={`3D model of ${name}${chibi ? ', chibi style' : ''}`}
        camera-controls=""
        auto-rotate=""
        autoplay=""
        rotation-per-second="18deg"
        interaction-prompt="none"
        shadow-intensity="1"
        exposure="1"
      />
      {entry.chibi && (
        <button type="button" className="dl-model-toggle" aria-pressed={chibi} onClick={() => setChibi((c) => !c)}>
          {chibi ? 'Normal' : 'Chibi'}
        </button>
      )}
    </>
  );
}
