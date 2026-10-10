import { useEffect, useRef, useState } from 'react';

import { cancelArtLoad, formatBytes, loadArtFolder, removeArt, useLoadStage, type LoadStage } from '../../art/loader.ts';
import { useArtState } from '../../art/resolve.ts';
import { ensureStills, stopStills, useStillsStage, type StillsStage } from '../../art/stillsRunner.ts';
import GameFilePicker from '../../components/GameFilePicker.tsx';
import {
  dismissExtraction,
  giveMappingsFile,
  isExtracting,
  palName,
  startExtraction,
  stopExtraction,
  useExtractStage,
  type ExtractStage,
} from '../../extract/extractRunner.ts';
import { checkPak, pickPak } from '../../extract/pickPak.ts';

/**
 * The game art, from the player's side: the notice that asks for it while there
 * is none, and the "Game art" part of the settings panel. The 3D is required
 * (docs/WEBSITE-PLAN.md), so with no art the notice stays until there is some;
 * it is not a setting to turn on.
 *
 * The art comes from the player's own game (Phase 6's extractor, read in the
 * browser), or from a pack folder built by `npm run make-art-pack`.
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
 * Where an art pack folder comes from: the pack built inside the project. The
 * secondary route, for developers and for a pack made on another computer.
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
    </div>
  );
}

/** "about 4 min left", from the pals built so far in this run. */
function palsLeft(s: Extract<ExtractStage, { kind: 'running' }>): string {
  const { done, total } = s.progress;
  if (s.msPerPal === null) return 'working out how long';
  const sec = Math.round(((total - done) * s.msPerPal) / 1000);
  return sec < 60 ? 'under a minute left' : `about ${Math.round(sec / 60)} min left`;
}

/** What screen readers hear: the phase, then every tenth of the pals, not every pal. */
function milestone(s: Extract<ExtractStage, { kind: 'running' }>): string {
  const p = s.progress;
  if (p.phase === 'icons') return 'Reading the pal icons.';
  if (p.phase === 'finishing') return 'Finishing.';
  const tenth = p.total ? Math.floor((p.done / p.total) * 10) : 0;
  return `${tenth * 10}% of the pals are in.`;
}

/** The run itself: its steps, its progress, and the way to stop it. */
function ExtractProgress({ stage }: { stage: ExtractStage }) {
  if (stage.kind === 'starting') {
    return (
      <div className="sc-artprog">
        <span role="status">{stage.step}</span>
        <button type="button" className="sc-btn ghost" onClick={stopExtraction}>
          Stop
        </button>
      </div>
    );
  }
  if (stage.kind !== 'running') return null;
  const p = stage.progress;
  return (
    <div className="sc-artprog">
      <progress max={p.total || 1} value={p.phase === 'icons' ? 0 : p.done} aria-label="Adding the game art" />
      <span>
        {p.phase === 'icons'
          ? `Icons: ${p.icons} so far`
          : `${p.done} of ${p.total} pals${p.current && palName(p.current) ? ` · ${palName(p.current)}` : ''} · ${palsLeft(stage)}${p.failed.length ? ` · ${p.failed.length} couldn’t be read` : ''}`}
      </span>
      <span className="sr-only" aria-live="polite">
        {milestone(stage)}
      </span>
      <button type="button" className="sc-btn ghost" onClick={stopExtraction}>
        Stop
      </button>
    </div>
  );
}

/** No field list worked for this game version: the player can give one. */
function NeedMappings({ stage }: { stage: Extract<ExtractStage, { kind: 'needMappings' }> }) {
  // Nothing could even be downloaded: offline, or the sources are blocked here. Say that, not "wrong version".
  const offline = stage.attempts.length > 0 && stage.attempts.every((a) => a.problem?.startsWith("Couldn't download"));
  return (
    <div className="sc-artwhere">
      <p>
        <b>One more file is needed.</b> Palworld’s files leave out the names of their fields, so PalDoc reads them with a list
        the modding community makes (a <code>.usmap</code> file).{' '}
        {offline
          ? 'PalDoc couldn’t download one: this computer may be offline, or GitHub may be blocked on this network. Stop and try again later, or get the file another way.'
          : 'None of the copies it found works with your game version, which usually means the game was patched in the last few days.'}
      </p>
      <p>
        Download <code>Mappings.usmap</code> from{' '}
        <a href="https://github.com/PalworldModding/UsefulFiles" target="_blank" rel="noreferrer">
          PalworldModding/UsefulFiles on GitHub
        </a>{' '}
        once it has been updated, then choose it here:
      </p>
      <div className="sc-artcmd">
        <label className="sc-btn" aria-disabled={stage.checking}>
          {stage.checking ? 'Checking the file…' : 'Choose the .usmap file…'}
          <input
            type="file"
            accept=".usmap"
            className="sr-only"
            disabled={stage.checking}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) giveMappingsFile(f);
            }}
          />
        </label>
        <button type="button" className="sc-btn ghost" onClick={stopExtraction}>
          Stop
        </button>
      </div>
      {stage.problem && (
        <p className="sc-arterr" role="alert">
          That file didn’t work: {stage.problem}
        </p>
      )}
      <details>
        <summary>What was tried</summary>
        <ul>
          {stage.attempts.map((a, i) => (
            <li key={i}>
              {a.label}: {a.problem ?? 'worked'}
            </li>
          ))}
        </ul>
      </details>
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

/** Shown above the page while this browser has no game art, is adding it, or has a half-made pack. */
export function ArtNotice() {
  const art = useArtState();
  const stage = useLoadStage();
  const run = useExtractStage();
  const running = isExtracting(run);
  const partial = art?.kind === 'local' && !art.info.complete;
  // Card pictures are made from the models once the pack is whole (a stopped
  // run's wait for it to finish), here, on any visit.
  useEffect(() => {
    if (art?.kind === 'local' && art.info.complete && !running) void ensureStills();
  }, [art, running]);

  // Each stage swaps the notice's controls (Choose → Stop → Choose again), and the button
  // just pressed is gone, which drops keyboard focus onto <body>. After a change of stage,
  // a lost focus goes to the notice's heading, or to the page when the notice has gone.
  const lastKinds = useRef(`${run.kind}|${stage.kind}`);
  useEffect(() => {
    const kinds = `${run.kind}|${stage.kind}`;
    if (kinds === lastKinds.current) return;
    lastKinds.current = kinds;
    if (document.activeElement && document.activeElement !== document.body) return;
    const to = document.getElementById('art-h') ?? document.getElementById('main');
    to?.focus({ preventScroll: true });
  }, [run.kind, stage.kind]);

  const folderBusy = stage.kind === 'loading' || stage.kind === 'error';
  const runNote = run.kind === 'stopped' || run.kind === 'error' || (run.kind === 'done' && run.failed.length > 0);
  if (!folderBusy && !running && !partial && !runNote && art?.kind !== 'none') return <StillsNotice />;

  const heading = stage.kind === 'loading' || running ? 'Adding the game art…' : partial ? 'Finish adding the game art' : 'Add the game art';
  return (
    <div className="sc-missing">
      <section className="sc-missing-notice sc-artnotice" aria-labelledby="art-h">
        <div>
          <h2 id="art-h" tabIndex={-1}>
            {heading}
          </h2>
          <p className="sc-sethint">
            {running
              ? 'Keep this tab open; you can use PalDoc meanwhile. Pals fill in as they arrive.'
              : partial && art?.kind === 'local'
                ? `${art.info.models} pals are in already. Choose the game file again and it carries on where it stopped.`
                : 'Your pals appear in 3D, made from your own copy of Palworld: choose the game’s file, Pal-Windows.pak. It’s read here in your browser, only the parts with pal art; nothing is uploaded or changed.'}
          </p>
        </div>
        {stage.kind === 'loading' ? (
          <Progress stage={stage} />
        ) : running ? (
          run.kind === 'needMappings' ? (
            <NeedMappings stage={run} />
          ) : (
            <ExtractProgress stage={run} />
          )
        ) : (
          <>
            {run.kind === 'stopped' && (
              <p className="sc-sethint sc-artfull" role="status">
                Stopped at {run.done} of {run.total} pals. What was made is kept.
              </p>
            )}
            {run.kind === 'done' && run.failed.length > 0 && (
              <p className="sc-arterr" role="alert">
                {run.failed.length} {run.failed.length === 1 ? 'pal' : 'pals'} couldn’t be read: {run.failed.map((f) => f.name).join(', ')}. The
                rest are in.{' '}
                <button type="button" className="sc-btn ghost" onClick={dismissExtraction}>
                  OK
                </button>
              </p>
            )}
            {run.kind === 'error' && (
              <p className="sc-arterr" role="alert">
                {run.message}
              </p>
            )}
            <GameFilePicker intro={false} onPak={(pak) => void startExtraction(pak)} />
            <details className="sc-artalt">
              <summary>Already have an art pack folder?</summary>
              <button type="button" className="sc-btn" onClick={() => void loadArtFolder()} disabled={stage.kind === 'picking'}>
                Choose the art folder
              </button>
              <Where />
            </details>
          </>
        )}
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
  const run = useExtractStage();
  const [pakProblem, setPakProblem] = useState<string | null>(null);
  const fromGame = async () => {
    setPakProblem(null);
    const pak = await pickPak();
    if (!pak) return;
    const check = await checkPak(pak);
    if (check.ok) void startExtraction(pak);
    else setPakProblem(check.problem);
  };
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
    if (!i.complete) status += ' Not finished: add the art from your game again to carry on.';
    if (art.storage.kind === 'idb') status += ' This window may forget them when it closes.';
    else if (persisted === false) status += ' The browser may clear them if the disk runs low.';
  }

  return (
    <>
      <h2>Game art</h2>
      <p className="sc-sethint" role="status">
        {stage.kind === 'done'
          ? `Added: ${stage.info.models} 3D models.`
          : run.kind === 'done'
            ? `Made from your game: ${run.models} 3D models in ${Math.max(1, Math.round(run.seconds / 60))} min.`
            : status}
      </p>
      {stage.kind === 'loading' ? (
        <Progress stage={stage} />
      ) : isExtracting(run) ? (
        <ExtractProgress stage={run} />
      ) : (
        <>
          <button type="button" className="sc-setitem" onClick={() => void fromGame()}>
            {art?.kind === 'local' ? 'Make the art again from your game…' : 'Add the art from your game…'}
          </button>
          <button type="button" className="sc-setitem" onClick={() => void loadArtFolder()} disabled={stage.kind === 'picking'}>
            {art?.kind === 'local' ? 'Replace it with an art pack folder…' : 'Add an art pack folder…'}
          </button>
        </>
      )}
      {pakProblem && (
        <p className="sc-arterr" role="alert">
          {pakProblem}
        </p>
      )}
      {art?.kind === 'local' && stage.kind !== 'loading' && !isExtracting(run) && (
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
