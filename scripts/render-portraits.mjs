/**
 * Render a still portrait of every chibi model for the list cards.
 *
 *   npm run dev                       # in another terminal — the harness is served by Vite
 *   npm run render-portraits          # all models
 *   npm run render-portraits -- KingBahamut SheepBall   # just these
 *   npm run render-portraits -- --sheet                 # also stitch a contact sheet
 *
 * For each model in public/pal-models/index.json that has a chibi build, headless
 * Edge loads it in scripts/portrait-harness.html in its bind pose (no animation,
 * so every pal faces the camera the same way; POSE=loop holds a frame of the
 * chibi loop instead), frames it from just off front and saves a PNG.
 * sharp then trims the transparent margin and re-pads every pal onto the same
 * square so they all fill the card the same way, whatever model-viewer's framing
 * left around them.
 *
 * Writes public/pal-portraits/<Name>.webp plus index.json (name -> file, with the
 * same aliasing as the model manifest). Re-run after `npm run build-models`.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildSpeciesIndex } from '../src/save/species.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'public', 'pal-models');
const OUT = path.join(ROOT, 'public', 'pal-portraits');
const DEV = process.env.DEV_URL ?? 'http://localhost:5173';
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const SIZE = 512; // output square
const FILL = 0.88; // share of the square the pal's longer side takes
/** Width over height beyond which a still is cropped to its middle. */
const MAX_ASPECT = 1.5;
/** 'idle' (first frame of the standing Idle), 'bind' (T/A-pose, no animation) or 'loop' (the autoplayed rest). */
const POSE = process.env.POSE ?? 'idle';

const args = process.argv.slice(2);
const wantSheet = args.includes('--sheet');
const only = new Set(args.filter((a) => !a.startsWith('--')));

const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'index.json'), 'utf8'));
// Per-pal pose, from the same file as the head-size fixes: { "WizardOwl": { "pose": "bind" } }
// for a pal whose Idle tips its face out of shot.
const overridesFile = path.join(ROOT, 'scripts', 'chibi-overrides.json');
const OVERRIDES = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')) : {};
// Only dex species — the manifest also holds gym/boss-rush copies, skins and
// weapon props. Render each distinct file once; aliases point at it.
const species = buildSpeciesIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'pals.json'), 'utf8')));
const files = new Map();
for (const [name, e] of Object.entries(manifest)) {
  if (!e.chibi || !species.lookup(name)) continue;
  const file = e.file ?? name;
  if (!files.has(file)) files.set(file, e.v);
}
const todo = [...files].filter(([file]) => !only.size || only.has(file));
fs.mkdirSync(OUT, { recursive: true });

// ---- headless Edge over CDP ---------------------------------------------------
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'portraits-edge-'));
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--enable-unsafe-swiftshader',
  '--window-size=900,900',
  'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(250);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  } catch {}
}
if (!target) throw new Error('Edge did not start');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++seq, r);
    ws.send(JSON.stringify({ id: seq, method, params }));
  });
async function evaluate(expression) {
  const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? 'eval failed');
  return m.result?.result?.value;
}

const cleanup = () => {
  try {
    ws.close();
  } catch {}
  edge.kill();
};
process.on('exit', cleanup);

await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
// The page is served by Vite; its logic is imported with a fresh query so Vite
// reads portrait-harness.js from disk every run (see the note in that file).
async function openHarness() {
  await send('Page.navigate', { url: `${DEV}/scripts/portrait-harness.html` });
  await sleep(500);
  await evaluate(`import('/scripts/portrait-harness.js?run=${Date.now()}')`);
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      if (await evaluate('window.harnessReady')) return;
    } catch {}
  }
  throw new Error('harness did not start');
}
await openHarness();

// ---- render -------------------------------------------------------------------
const done = [];
const failed = [];
const fellBack = [];
const t0 = Date.now();
for (const [i, [file, v]] of todo.entries()) {
  try {
    const url = `/pal-models/${file}.chibi.glb?v=${v}`;
    // A model that never fires load (BirdDragon_Ice did) would hang the run:
    // give each one 20 s, then reload the harness and move on.
    const dataUrl = await Promise.race([
      evaluate(`window.renderPortrait(${JSON.stringify(url)}, { pose: ${JSON.stringify(OVERRIDES[file]?.pose ?? POSE)} })`),
      sleep(20000).then(() => {
        throw new Error('timed out');
      }),
    ]).catch(async (err) => {
      if (err.message === 'timed out') await openHarness();
      throw err;
    });
    let png = Buffer.from(dataUrl.split(',')[1], 'base64');
    // A pose can leave nothing in shot (FairyDragon's flying Idle carries it out
    // of frame). An empty still falls back to the bind pose, which never moves.
    if ((await sharp(png).stats()).channels[3].max < 10) {
      const retry = await Promise.race([
        // A distinct URL forces a fresh load: stopping the loop on the model
        // already in the viewer did not always restore the bind pose.
        evaluate(`window.renderPortrait(${JSON.stringify(`${url}&pose=bind`)}, { pose: 'bind' })`),
        sleep(20000).then(() => {
          throw new Error('timed out (bind retry)');
        }),
      ]);
      png = Buffer.from(retry.split(',')[1], 'base64');
      fellBack.push(file);
    }
    // Trim the transparent border, then fit the pal to FILL of the square.
    let trimmed = await sharp(png).trim({ threshold: 1 }).toBuffer();
    // A T-posed wingspan or a long fish is several times wider than tall and
    // would shrink to a sliver once fitted, so crop to the middle first (spans
    // are symmetric about the body). Tall pals are left whole: cropping to the
    // top kept raised weapons, horns and ear tips instead of faces.
    const tm = await sharp(trimmed).metadata();
    if (tm.width / tm.height > MAX_ASPECT) {
      const w = Math.round(tm.height * MAX_ASPECT);
      trimmed = await sharp(trimmed).extract({ left: Math.round((tm.width - w) / 2), top: 0, width: w, height: tm.height }).toBuffer();
    }
    const inner = Math.round(SIZE * FILL);
    const fitted = await sharp(trimmed).resize(inner, inner, { fit: 'inside' }).toBuffer();
    const meta = await sharp(fitted).metadata();
    const left = Math.round((SIZE - meta.width) / 2);
    // Sit the pal slightly low, the way a portrait is framed, rather than dead centre.
    const top = Math.round((SIZE - meta.height) * 0.62);
    await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: fitted, left, top }])
      .webp({ quality: 86, alphaQuality: 90 })
      .toFile(path.join(OUT, `${file}.webp`));
    done.push(file);
  } catch (err) {
    failed.push(`${file}: ${err.message.split('\n')[0]}`);
  }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${todo.length}  (${Math.round((Date.now() - t0) / 1000)}s)`);
}

// ---- manifest -------------------------------------------------------------------
// Merge into the existing index so a partial run (named pals) keeps the rest.
const indexFile = path.join(OUT, 'index.json');
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
const stamp = Date.now();
for (const [name, e] of Object.entries(manifest)) {
  const file = e.file ?? name;
  if (done.includes(file)) index[name] = { file, v: stamp };
}
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
console.log(`rendered ${done.length}/${todo.length} in ${Math.round((Date.now() - t0) / 1000)}s -> ${path.relative(ROOT, OUT)}`);
if (failed.length) console.log(`  failed:\n    ${failed.join('\n    ')}`);

// ---- contact sheet ----------------------------------------------------------------
if (wantSheet && done.length) {
  const CELL = 128;
  const COLS = 16;
  const rows = Math.ceil(done.length / COLS);
  const tiles = await Promise.all(
    done.map(async (file, i) => ({
      input: await sharp(path.join(OUT, `${file}.webp`)).resize(CELL, CELL).toBuffer(),
      left: (i % COLS) * CELL,
      top: Math.floor(i / COLS) * CELL,
    })),
  );
  const sheet = path.join(ROOT, 'scripts', '.cache', 'portrait-sheet.png');
  fs.mkdirSync(path.dirname(sheet), { recursive: true });
  await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: '#1f1e25' } })
    .composite(tiles)
    .png()
    .toFile(sheet);
  console.log(`contact sheet -> ${path.relative(ROOT, sheet)}`);
}

cleanup();
// Edge can hold its profile a moment after being killed; a leftover temp dir is harmless.
await sleep(500);
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {}
process.exit(0);
