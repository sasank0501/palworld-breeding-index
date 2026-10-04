import { useEffect, useRef, useState, type ReactNode } from 'react';

import { stripBoss } from '../save/species.ts';
import { fitStage, type Viewer } from './stageFraming.ts';

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
        /** Which clip to play; without it, the first. */
        'animation-name'?: string;
        'animation-crossfade-duration'?: string;
        'disable-zoom'?: string;
        'disable-pan'?: string;
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
  /** False in the lite set the portfolio build hosts: there is no normal model to toggle to. */
  normal?: boolean;
  /** Set for Blueprint-only pals: the model they borrow (LilyQueen_Dark -> LilyQueen_Ice). */
  file?: string;
  /** The chibi's clips in play order (Rest, Idle, Walk, Sleep, Petting — whichever exist). */
  clips?: string[];
  /** The normal model's clips; absent in the lite set, which has no normal model. */
  normalClips?: string[];
}

const BASE = `${import.meta.env.BASE_URL}pal-models/`;

/** Blend time between clips; framing waits for it. */
const CROSSFADE_MS = 350;

/**
 * The lite set the portfolio build hosts is meshopt-compressed. model-viewer
 * bundles a meshopt decoder but only switches it on once a decoder location is
 * set, and it only waits for that script to load — the bundled decoder is what
 * decodes. So any loadable script will do, and no CDN is needed. Without this a
 * compressed model fails with "setMeshoptDecoder must be called".
 */
function enableMeshopt(viewer: { meshoptDecoderLocation: string }): void {
  if (!viewer.meshoptDecoderLocation) viewer.meshoptDecoderLocation = 'data:text/javascript,';
}

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

/**
 * A pal's 3D model, or `fallback` when this build has none. With `picker`, a row
 * of buttons plays each of the model's clips (from the manifest, so the row is
 * there before the file has downloaded); without it, the first clip loops.
 */
export function PalModel({
  characterId,
  name,
  fallback,
  picker = false,
}: {
  characterId: string;
  name: string;
  fallback: ReactNode;
  picker?: boolean;
}) {
  const [state, setState] = useState<State>('probing');
  const [entry, setEntry] = useState<ModelEntry | null>(null);
  // Chibi first: it is the look the cards' stills use. Normal stays one click
  // away until the chibi builds are fully tuned.
  const [chibi, setChibi] = useState(true);
  const [clip, setClip] = useState<string | null>(null);
  const viewer = useRef<HTMLElement>(null);
  const model = modelName(characterId);

  useEffect(() => {
    let cancelled = false;
    setState('probing');
    setChibi(true);
    setClip(null);
    framedClip.current = null;
    loadManifest()
      .then(async (manifest) => {
        const found = manifest[model] ?? null;
        if (found) enableMeshopt((await import('@google/model-viewer')).ModelViewerElement);
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

  const clips = (chibi ? entry?.clips : entry?.normalClips) ?? [];
  // A clip picked on the chibi carries over to the normal model if it has it too.
  const playing = clip && clips.includes(clip) ? clip : (clips[0] ?? null);

  // A file that exists but fails to parse should still leave the portrait up.
  // On load, frame the camera from the clip that is playing (see stageFraming):
  // two frames in, so autoplay has started the clip, and without the camera's
  // glide, so the first thing shown is already framed.
  useEffect(() => {
    const el = viewer.current as Viewer | null;
    if (state !== 'ready' || !el) return;
    let raf = 0;
    const onError = (): void => setState('none');
    const onLoad = (): void => {
      raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => fitStage(el, true))));
    };
    el.addEventListener('error', onError);
    el.addEventListener('load', onLoad);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('error', onError);
      el.removeEventListener('load', onLoad);
    };
  }, [state]);

  // A new clip reframes once the crossfade into it has settled; the camera glides.
  const framedClip = useRef<string | null>(null);
  useEffect(() => {
    const el = viewer.current as Viewer | null;
    if (state !== 'ready' || !el || !playing) return;
    if (framedClip.current === null) {
      framedClip.current = playing; // the load handler frames the first clip
      return;
    }
    if (framedClip.current === playing) return;
    framedClip.current = playing;
    const timer = window.setTimeout(() => fitStage(el), CROSSFADE_MS + 100);
    return () => window.clearTimeout(timer);
  }, [state, playing]);

  if (state !== 'ready' || !entry) return <>{fallback}</>;

  return (
    <>
      <model-viewer
        ref={viewer}
        class="dl-model"
        src={modelUrl(model, entry, chibi)}
        alt={`3D model of ${name}${chibi ? ', chibi style' : ''}`}
        camera-controls=""
        disable-zoom=""
        disable-pan=""
        auto-rotate=""
        autoplay=""
        rotation-per-second="18deg"
        interaction-prompt="none"
        shadow-intensity="1"
        exposure="1"
        animation-name={playing ?? undefined}
        animation-crossfade-duration={String(CROSSFADE_MS)}
      />
      {picker && clips.length > 1 && (
        <div className="dl-anims" role="group" aria-label="Animation">
          {clips.map((c) => (
            <button key={c} type="button" className={c === playing ? 'on' : ''} aria-pressed={c === playing} onClick={() => setClip(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {entry.chibi && entry.normal !== false && (
        <button type="button" className="dl-model-toggle" aria-pressed={chibi} onClick={() => setChibi((c) => !c)}>
          {chibi ? 'Normal' : 'Chibi'}
        </button>
      )}
    </>
  );
}
