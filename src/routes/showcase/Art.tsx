import { useEffect, useId, useRef, useState } from 'react';

import { markOffered, saveArtCopy, wasOffered, type CopyResult } from '../../art/copy.ts';
import { cancelArtLoad, formatBytes, loadArtFile, loadArtFolder, removeArt, useLoadStage, type LoadStage } from '../../art/loader.ts';
import { useArtState } from '../../art/resolve.ts';
import { ensureStills, stopStills, useStillsStage, type StillsStage } from '../../art/stillsRunner.ts';
import GameFilePicker from '../../components/GameFilePicker.tsx';
import {
  dismissExtraction,
  giveMappingsFile,
  isExtracting,
  palName,
  runStartTime,
  startExtraction,
  stopExtraction,
  useExtractStage,
  type ExtractStage,
} from '../../extract/extractRunner.ts';
import { checkPak, pickPak } from '../../extract/pickPak.ts';
import { EXTRACTOR_FACTS, chooseExtractors, chosenExtractors, extractorChoices, extractorCount, extractorsToUse } from '../../extract/pool.ts';
import { formatDuration } from '../../lib/duration.ts';

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

/**
 * Time since the run began, ticking every second. Plain text, not a live region: a screen reader
 * would otherwise announce every tick.
 */
function Elapsed() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{formatDuration((performance.now() - runStartTime()) / 1000)} elapsed</span>;
}

/** What a run costs the computer, said before it starts and while it runs. */
const CPU_WARNING =
  'This uses most of your computer’s processor for a few minutes (about 2 to 4 minutes on a recent computer; a slower one can take 10 or more). Other programs and this page may feel slow, and a laptop’s fans may spin up. Plug a laptop in, and close heavy programs first.';

/**
 * Loading the art from a folder (`npm run make-art-pack`) is a developer's route: a player has no
 * such folder, since an extraction goes into the browser's storage, not onto the disk. So it is
 * offered on the dev server only, and a built site shows the game file alone.
 */
const PACK_FOLDER = import.meta.env.DEV;

/**
 * How hard the run works: how many readers go at once. More is faster and takes more memory and
 * processor; the figures beside each are from one 8-core test computer, so they are a guide.
 * "Let PalDoc decide" is the rule in src/extract/pool.ts, and stays the default.
 */
function ExtractorChoice() {
  const choices = extractorChoices();
  const auto = extractorCount();
  const [picked, setPicked] = useState<number | null>(() => (chosenExtractors() !== null ? extractorsToUse() : null));
  const pick = (n: number | null) => {
    chooseExtractors(n);
    setPicked(n);
  };
  if (choices.length < 2) return null;
  const memoryKnown = (navigator as { deviceMemory?: number }).deviceMemory !== undefined;
  return (
    <details className="sc-artalt sc-artchoice">
      <summary>
        Speed and memory: {picked === null ? `PalDoc decides (${auto} at once)` : `${picked} at once`}
      </summary>
      <fieldset>
        <legend>How many readers run at once</legend>
        <label className={picked === null ? 'on' : ''}>
          <input type="radio" name="sc-extractors" checked={picked === null} onChange={() => pick(null)} />
          <span>
            <b>Let PalDoc decide</b>
            <small>
              It picks {auto} for this computer, from its processor
              {memoryKnown ? ' and memory.' : '. This browser doesn’t say how much memory there is, so it stays at two or fewer.'}
            </small>
          </span>
        </label>
        {choices.map((n) => {
          const f = EXTRACTOR_FACTS[n];
          return (
            <label key={n} className={picked === n ? 'on' : ''}>
              <input type="radio" name="sc-extractors" checked={picked === n} onChange={() => pick(n)} />
              <span>
                <b>
                  {n} at once · about {formatDuration(f.seconds)} · about {f.memoryGb.toFixed(1)} GB of memory
                </b>
                <small>{f.tradeoff}</small>
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="sc-sethint">
        Times and memory were measured on one 8-core computer, so treat them as a guide: yours may be faster or slower, and a first
        run is slower than a repeat. If the computer runs short of memory, a reader that can’t start is left out and the run carries
        on with fewer.
      </p>
    </details>
  );
}

/** The run itself: its steps, its progress, and the way to stop it. */
function ExtractProgress({ stage }: { stage: ExtractStage }) {
  if (stage.kind === 'starting') {
    return (
      <div className="sc-artprog">
        <div className="sc-artprog-line">
          <span role="status">{stage.step}</span>
          <Elapsed />
        </div>
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
      <div className="sc-artprog-line">
        <span>
          {p.phase === 'icons'
            ? `Icons: ${p.icons} so far`
            : `${p.done} of ${p.total} pals${p.current && palName(p.current) ? ` · ${palName(p.current)}` : ''} · ${palsLeft(stage)}${p.failed.length ? ` · ${p.failed.length} couldn’t be read` : ''}`}
        </span>
        <Elapsed />
      </div>
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
          {stage.checking ? 'Checking the file…' : 'Choose the .usmap file'}
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

/**
 * Once the art made from the game is whole (models and card pictures), offer to save a copy of it
 * to a file, once per pack. A browser can clear a site's storage, and a new browser or computer
 * starts empty; with the file, getting the art back is seconds and not another extraction. A
 * browser won't write a file by itself, so this is one click and not automatic.
 */
function CopyOffer() {
  const art = useArtState();
  const stills = useStillsStage();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CopyResult | null>(null);
  const [gone, setGone] = useState(false);
  if (art?.kind !== 'local') return null;
  const info = art.info;
  const ready = info.complete && info.source === 'extractor' && info.stills > 0 && stills.kind !== 'making';
  if (!result && (gone || !ready || wasOffered(info.id))) return null;
  if (gone) return null;
  const save = async () => {
    setBusy(true);
    setResult(await saveArtCopy());
    setBusy(false);
  };
  const dismiss = () => {
    markOffered(info.id);
    setGone(true);
  };
  return (
    <div className="sc-missing">
      <section className="sc-missing-notice sc-artnotice" aria-labelledby="copy-h">
        <div>
          <h2 id="copy-h" tabIndex={-1}>
            {result?.ok ? 'Copy saved' : 'Save a copy of the art'}
          </h2>
          <p className="sc-sethint" role="status">
            {result?.ok
              ? `“${result.name}” (${formatBytes(result.bytes)}) is in your downloads. Keep it somewhere safe. If this browser ever forgets the art, or you move to another one, choose “Load a saved copy” and it is back in seconds.`
              : `Your pals’ art is ready: ${info.models} models and ${info.stills} pictures, ${formatBytes(info.bytes)}. Save it to a file, so a cleared browser or a new computer doesn’t mean reading the game again.`}
          </p>
        </div>
        <div className="sc-artprog-line">
          {!result?.ok && (
            <button type="button" className="sc-btn" onClick={() => void save()} disabled={busy}>
              {busy ? 'Preparing the file…' : 'Save a copy'}
            </button>
          )}
          <button type="button" className="sc-btn ghost" onClick={dismiss}>
            {result?.ok ? 'Done' : 'Not now'}
          </button>
        </div>
        {result && !result.ok && (
          <p className="sc-arterr" role="alert">
            {result.problem}
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
  if (!folderBusy && !running && !partial && !runNote && art?.kind !== 'none') {
    return (
      <>
        <StillsNotice />
        <CopyOffer />
      </>
    );
  }

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
        {/* One place for what a run costs, beside the heading, so nothing below shifts when it changes. */}
        {stage.kind !== 'loading' && run.kind !== 'needMappings' && (
          <p className="sc-sethint sc-artcpu">
            {running ? (
              'Using most of your processor: the computer may feel slow until this finishes.'
            ) : (
              <>
                <b>Before you start:</b> {CPU_WARNING}
              </>
            )}
          </p>
        )}
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
                rest are in (the run took {formatDuration(run.seconds)}).{' '}
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
            <ExtractorChoice />
            <div className="sc-artcopy">
              <p className="sc-sethint">
                <b>Saved a copy of the art before?</b> Load that file and skip reading the game: it takes seconds.
              </p>
              <button type="button" className="sc-btn ghost" onClick={() => void loadArtFile()} disabled={stage.kind === 'picking'}>
                Load a saved copy
              </button>
            </div>
            {PACK_FOLDER && (
              <details className="sc-artalt">
                <summary>Developers: load an art pack folder</summary>
                <button type="button" className="sc-btn" onClick={() => void loadArtFolder()} disabled={stage.kind === 'picking'}>
                  Choose the art folder
                </button>
                <Where />
              </details>
            )}
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

/** The "Game art" row of the settings panel's Files block: a short status, then its actions as small buttons. */
export function ArtSettings() {
  const art = useArtState();
  const stage = useLoadStage();
  const run = useExtractStage();
  const [pakProblem, setPakProblem] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copy, setCopy] = useState<CopyResult | null>(null);
  const titleId = useId();
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

  // The row's short status, and a warning only when there is something to warn about.
  let status = 'Checking…';
  let warning: string | null = null;
  if (art?.kind === 'server') status = 'Hosted by this site';
  else if (art?.kind === 'none') status = 'None yet';
  else if (art?.kind === 'local') {
    const i = art.info;
    status = `${i.models} models · ${formatBytes(i.bytes)}`;
    if (!i.complete) warning = 'Not finished: add the art from your game again to carry on.';
    else if (art.storage.kind === 'idb') warning = 'This window may forget the art when it closes.';
    else if (persisted === false) warning = 'The browser may clear the art if the disk runs low.';
  }
  const busy = stage.kind === 'loading' || isExtracting(run);

  return (
    <div className="sc-frow" role="group" aria-labelledby={titleId}>
      <header>
        <b id={titleId}>Game art</b>
        <small role="status">
          {stage.kind === 'done'
            ? `Added: ${stage.info.models} models`
            : run.kind === 'done'
              ? `Made: ${run.models} models in ${formatDuration(run.seconds)}`
              : status}
        </small>
      </header>
      {warning && !busy && <p className="sc-sethint">{warning}</p>}
      {stage.kind === 'loading' ? (
        <Progress stage={stage} />
      ) : isExtracting(run) ? (
        <ExtractProgress stage={run} />
      ) : (
        <div className="sc-acts">
          <button type="button" className="sc-mini main" onClick={() => void fromGame()}>
            {art?.kind === 'local' ? 'Make the art again' : 'Add the art from your game'}
          </button>
          {art?.kind === 'local' && art.info.complete && (
            <button
              type="button"
              className="sc-mini"
              disabled={copying}
              onClick={async () => {
                setCopying(true);
                setCopy(await saveArtCopy());
                setCopying(false);
              }}
            >
              {copying ? 'Preparing the file…' : 'Save art to a file'}
            </button>
          )}
          <button type="button" className="sc-mini" onClick={() => void loadArtFile()} disabled={stage.kind === 'picking'}>
            Load art from a file
          </button>
          {PACK_FOLDER && (
            <button type="button" className="sc-mini" onClick={() => void loadArtFolder()} disabled={stage.kind === 'picking'}>
              {art?.kind === 'local' ? 'Replace with a folder' : 'Add a folder'}
            </button>
          )}
          {art?.kind === 'local' && (
            <button
              type="button"
              className="sc-mini danger"
              onClick={() => {
                if (confirm('Remove the game art from this browser? Your pals go back to placeholders until you add it again.')) void removeArt();
              }}
            >
              Remove the art
            </button>
          )}
        </div>
      )}
      {pakProblem && (
        <p className="sc-arterr" role="alert">
          {pakProblem}
        </p>
      )}
      {copy && (
        <p className={copy.ok ? 'sc-sethint' : 'sc-arterr'} role={copy.ok ? 'status' : 'alert'}>
          {copy.ok ? `Saved “${copy.name}” (${formatBytes(copy.bytes)}) to your downloads.` : copy.problem}
        </p>
      )}
      {stage.kind === 'error' && (
        <p className="sc-arterr" role="alert">
          {stage.message}
        </p>
      )}
    </div>
  );
}
