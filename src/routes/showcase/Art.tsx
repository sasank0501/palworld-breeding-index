import { useEffect, useState } from 'react';

import { cancelArtLoad, formatBytes, loadArtFolder, removeArt, useLoadStage, type LoadStage } from '../../art/loader.ts';
import { useArtState } from '../../art/resolve.ts';
import { ensureStills, stopStills, useStillsStage, type StillsStage } from '../../art/stillsRunner.ts';

/**
 * The game art, from the player's side: the notice that asks for it while there
 * is none, and the "Game art" part of the settings panel. The 3D is required
 * (docs/WEBSITE-PLAN.md), so with no art the notice stays until there is some;
 * it is not a setting to turn on.
 *
 * Until Phase 6's extractor exists, the art comes from a folder built by
 * `npm run make-art-pack`.
 */

function Progress({ stage }: { stage: Extract<LoadStage, { kind: 'loading' }> }) {
  return (
    <div className="sc-artprog">
      <progress max={stage.totalBytes || 1} value={stage.bytes} aria-label="Adding the game art" />
      <span>
        {stage.done.toLocaleString('en')} of {stage.total.toLocaleString('en')} files · {formatBytes(stage.bytes)} of{' '}
        {formatBytes(stage.totalBytes)}
      </span>
      <button type="button" className="sc-btn ghost" onClick={cancelArtLoad}>
        Stop
      </button>
    </div>
  );
}

/**
 * Where the art folder is. Until Phase 6 it is the test pack built inside the
 * project; then it becomes the player's game folder (a Steam path, copyable like
 * the save path on the import screen).
 */
const PACK_COMMAND = 'npm run make-art-pack';

function Where() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(PACK_COMMAND)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };
  return (
    <div className="sc-artwhere">
      <p>
        <b>Where to find it:</b> the <code>art-pack</code> folder inside the project folder. If it isn't there yet, build it
        first by running this in the project folder:
      </p>
      <div className="sc-artcmd">
        <code>{PACK_COMMAND}</code>
        <button type="button" className="sc-btn ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Command copied' : ''}
        </span>
      </div>
      <p className="sc-sethint">Coming next: your Palworld game folder instead, read straight from the game.</p>
    </div>
  );
}

/** "About 2 min left", from the average so far. */
function timeLeft(s: Extract<StillsStage, { kind: 'making' }>): string {
  const sec = Math.round(((s.total - s.done) * s.msPerStill) / 1000);
  if (s.done < 3) return 'working out how long';
  return sec < 60 ? 'under a minute left' : `about ${Math.round(sec / 60)} min left`;
}

/**
 * Phase 5: while the card pictures are being made from the 3D models. Cards fill
 * in (hatching) as each batch is written, so the page is usable meanwhile.
 */
function StillsNotice() {
  const s = useStillsStage();
  if (s.kind !== 'making' && s.kind !== 'stopped' && s.kind !== 'error') return null;
  return (
    <div className="sc-missing">
      <section className="sc-missing-notice sc-artnotice" aria-labelledby="stills-h">
        <div>
          <h2 id="stills-h">{s.kind === 'making' ? 'Making the card pictures…' : s.kind === 'stopped' ? 'Card pictures paused' : 'Some card pictures failed'}</h2>
          <p className="sc-sethint">
            Each pal's picture is taken from its own 3D model, once, and kept in this browser. Cards fill in as they are made.
          </p>
        </div>
        {s.kind === 'making' && (
          <div className="sc-artprog">
            <progress max={s.total || 1} value={s.done} aria-label="Making the card pictures" />
            <span>
              {s.done} of {s.total} · {timeLeft(s)}
            </span>
            <button type="button" className="sc-btn ghost" onClick={stopStills}>
              Stop
            </button>
          </div>
        )}
        {s.kind === 'stopped' && (
          <div className="sc-artprog">
            <span>
              {s.done} of {s.total} made. The rest carry on next visit, or now:
            </span>
            <button type="button" className="sc-btn" onClick={() => void ensureStills()}>
              Resume
            </button>
          </div>
        )}
        {s.kind === 'error' && (
          <p className="sc-arterr" role="alert">
            {s.message}
          </p>
        )}
      </section>
    </div>
  );
}

/** Shown above the page while this browser has no game art (or is adding it). */
export function ArtNotice() {
  const art = useArtState();
  const stage = useLoadStage();
  // A pack whose card pictures are missing (a stopped run, or one the extractor
  // wrote without them) gets them made, here, on any visit.
  useEffect(() => {
    if (art?.kind === 'local') void ensureStills();
  }, [art]);
  if (stage.kind !== 'loading' && stage.kind !== 'error' && art?.kind !== 'none') return <StillsNotice />;
  return (
    <div className="sc-missing">
      <section className="sc-missing-notice sc-artnotice" aria-labelledby="art-h">
        <div>
          <h2 id="art-h">{stage.kind === 'loading' ? 'Adding the game art…' : 'Add the game art'}</h2>
          <p className="sc-sethint">
            Your pals appear in 3D, made from your own copy of Palworld. The art stays in this browser; nothing is uploaded.
          </p>
        </div>
        {stage.kind === 'loading' ? (
          <Progress stage={stage} />
        ) : (
          <button type="button" className="sc-btn" onClick={() => void loadArtFolder()} disabled={stage.kind === 'picking'}>
            Choose the art folder
          </button>
        )}
        {stage.kind !== 'loading' && <Where />}
        {stage.kind === 'error' && (
          <p className="sc-arterr" role="alert">
            {stage.message}
          </p>
        )}
      </section>
    </div>
  );
}

/** The "Game art" part of the settings panel. */
export function ArtSettings() {
  const art = useArtState();
  const stage = useLoadStage();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, [art]);

  let status = 'Checking…';
  if (art?.kind === 'server') status = 'This copy of the site hosts the art.';
  else if (art?.kind === 'none') status = 'No game art in this browser yet.';
  else if (art?.kind === 'local') {
    const i = art.info;
    status = `${i.models} 3D models and ${i.stills} pictures, ${formatBytes(i.bytes)}, kept in this browser.`;
    if (art.storage.kind === 'idb') status += ' This window may forget them when it closes.';
    else if (persisted === false) status += ' The browser may clear them if the disk runs low.';
  }

  return (
    <>
      <h2>Game art</h2>
      <p className="sc-sethint" role="status">
        {stage.kind === 'done' ? `Added: ${stage.info.models} 3D models.` : status}
      </p>
      {stage.kind === 'loading' ? (
        <Progress stage={stage} />
      ) : (
        <button type="button" className="sc-setitem" onClick={() => void loadArtFolder()} disabled={stage.kind === 'picking'}>
          {art?.kind === 'local' ? 'Replace the art…' : 'Add the art folder…'}
        </button>
      )}
      {art?.kind === 'local' && stage.kind !== 'loading' && (
        <button
          type="button"
          className="sc-setitem"
          onClick={() => {
            if (confirm('Remove the game art from this browser? Your pals go back to placeholders until you add it again.')) void removeArt();
          }}
        >
          Remove the art from this browser
        </button>
      )}
      {stage.kind === 'error' && (
        <p className="sc-arterr" role="alert">
          {stage.message}
        </p>
      )}
    </>
  );
}
