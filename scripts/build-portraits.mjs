/**
 * Build the pal portraits, 3D models and game icons on this machine, from a copy
 * of Palworld you own. One command over the pipeline the scripts below make up:
 *
 *   1. extract   scripts/pal-textures  (dotnet, CUE4Parse)  meshes, textures, animations
 *   2. models    scripts/build-pal-models.mjs                .glb per pal, plus a manifest; each carries
 *                                                               the clips in scripts/anim-roles.json
 *   3. portraits scripts/render-portraits.mjs                chibi stills, via headless Edge/Chrome
 *   4. icons     scripts/fetch-work-icons.mjs                work-suitability and element icons
 *
 *   npm run build-portraits
 *   npm run build-portraits -- --only Alpaca KingBahamut   a couple of pals, to try it
 *   npm run build-portraits -- --skip-extract              reuse an earlier extraction
 *   npm run build-portraits -- --lite                      also build the small model set
 *                                                          the portfolio build hosts
 *   npm run build-portraits -- --check                     look for everything, change nothing
 *
 *   --paks <dir>      the game's Pal/Content/Paks folder (else PALWORLD_PAKS, else Steam)
 *   --usmap <file>    type mappings for your game version (else PALWORLD_USMAP, else
 *                     scripts/pal-textures/mappings/*.usmap)
 *   --browser <exe>   Edge or Chrome (else EDGE, else the usual install paths)
 *   --size <px>       texture edge for the models (default 1024)
 *
 * Everything is written to gitignored folders (public/pal-models, public/pal-portraits,
 * public/work-icons, public/element-icons, scripts/pal-textures/out). Nothing leaves this machine.
 * The extraction is resumable, so an interrupted run picks up where it stopped.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'scripts', 'pal-textures');
const log = (s = '') => console.log(s);

const NOTICE = `
  Palworld Breeding Index · build-portraits

  This reads the Palworld you have installed and writes pal models, portraits and
  icons to gitignored folders on THIS machine. Palworld, its characters and its
  artwork belong to Pocketpair, Inc. This project is an unofficial fan tool, not
  affiliated with or endorsed by Pocketpair. Do not commit or redistribute the
  output, and follow Pocketpair's terms for the game.
`;

// ---- arguments -------------------------------------------------------------

function parseArgs(argv) {
  const out = { only: [], skipExtract: false, lite: false, check: false, paks: null, usmap: null, browser: null, size: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) fail([`${a} needs a value.`]);
      return v;
    };
    if (a === '--help' || a === '-h') {
      log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*\n|^ \* ?/gm, ''));
      process.exit(0);
    } else if (a === '--skip-extract') out.skipExtract = true;
    else if (a === '--lite') out.lite = true;
    else if (a === '--check') out.check = true;
    else if (a === '--paks') out.paks = value();
    else if (a === '--usmap') out.usmap = value();
    else if (a === '--browser') out.browser = value();
    else if (a === '--size') out.size = value();
    else if (a === '--only') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) out.only.push(argv[++i]);
      if (!out.only.length) fail(['--only needs at least one pal name, e.g. --only Alpaca KingBahamut.']);
    } else fail([`Unknown option ${a}. Try --help.`]);
  }
  return out;
}

function fail(problems) {
  log('\nCannot start:\n');
  for (const p of problems) log(`  - ${p.replace(/\n/g, '\n    ')}`);
  log();
  process.exit(1);
}

// ---- preflight: find everything before doing anything slow ----------------------

const exists = (p) => p && fs.existsSync(p);

/** Node reads the .ts species table directly, which is on by default from 22.18. */
function nodeFlags() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 18)) return [];
  if (major === 22 && minor >= 6) return ['--experimental-strip-types'];
  fail([`Node ${process.versions.node} is too old; this needs Node 22.6 or newer.`]);
  return [];
}

function checkDotnet() {
  const csproj = fs.readFileSync(path.join(TOOL, 'pal-textures.csproj'), 'utf8');
  const need = Number(/<TargetFramework>net(\d+)/.exec(csproj)?.[1] ?? 8);
  const r = spawnSync('dotnet', ['--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    return `The .NET ${need} SDK was not found on PATH. Install it from https://dotnet.microsoft.com/download and reopen the terminal.`;
  }
  const have = Number(r.stdout.split('.')[0]);
  return have < need ? `The extractor targets .NET ${need}; found SDK ${r.stdout.trim()}. Install the .NET ${need} SDK.` : null;
}

/** Steam library folders, from libraryfolders.vdf, plus the Steam install itself. */
function steamLibraries() {
  const home = os.homedir();
  const roots = [
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Steam'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Steam'),
    path.join(home, '.steam', 'steam'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, 'Library', 'Application Support', 'Steam'),
  ].filter(Boolean);

  const libs = new Set(roots);
  for (const root of roots) {
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    if (!exists(vdf)) continue;
    // "path"		"D:\\SteamLibrary" — backslashes are doubled in the file.
    for (const m of fs.readFileSync(vdf, 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  }
  return [...libs];
}

const hasPaks = (dir) => exists(dir) && fs.statSync(dir).isDirectory() && fs.readdirSync(dir).some((f) => f.endsWith('.pak'));

function findPaks(flag) {
  const given = flag ?? process.env.PALWORLD_PAKS;
  if (given) return hasPaks(given) ? { dir: given } : { error: `No .pak files in ${given}. Point --paks at the game's Pal/Content/Paks folder.` };
  for (const lib of steamLibraries()) {
    const dir = path.join(lib, 'steamapps', 'common', 'Palworld', 'Pal', 'Content', 'Paks');
    if (hasPaks(dir)) return { dir };
  }
  return {
    error:
      'Could not find an installed Palworld in your Steam libraries.\n' +
      "Pass the game's Pal/Content/Paks folder with --paks <dir> (or set PALWORLD_PAKS).",
  };
}

function findUsmap(flag) {
  const given = flag ?? process.env.PALWORLD_USMAP;
  if (given) return exists(given) ? { file: path.resolve(given) } : { error: `Mappings file not found: ${given}` };
  const dir = path.join(TOOL, 'mappings');
  const found = exists(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.usmap'))
        .map((f) => path.join(dir, f))
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]
    : null;
  if (found) return { file: found };
  return {
    error:
      'No .usmap type-mappings file found. Unreal stores Palworld data without field names, so reading it needs\n' +
      'a mappings file that matches your installed game version (the community publishes one per game update).\n' +
      `Put it in ${path.relative(ROOT, dir)}/ , or pass --usmap <file> (or set PALWORLD_USMAP).`,
  };
}

function findBrowser(flag) {
  const given = flag ?? process.env.EDGE ?? process.env.BROWSER;
  if (given) return exists(given) ? { exe: given } : { error: `Browser not found: ${given}` };
  const pf = process.env.ProgramFiles;
  const pf86 = process.env['ProgramFiles(x86)'];
  const local = process.env.LOCALAPPDATA;
  const candidates = [
    pf86 && path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    pf && path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    pf && path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    pf86 && path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const exe = candidates.find(exists);
  return exe ? { exe } : { error: 'No Edge or Chrome found for rendering the portraits. Pass --browser <exe> (or set EDGE).' };
}

// ---- running steps -----------------------------------------------------------

const children = new Set();
function run(cmd, args, { cwd = ROOT, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
    children.add(child);
    child.on('error', reject);
    child.on('exit', (code) => {
      children.delete(child);
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

/** Start Vite (the portrait harness is served by it) and wait until it answers. */
async function startVite() {
  const port = await freePort();
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  children.add(child);
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error('Vite exited before it was ready');
    try {
      if ((await fetch(url)).ok) return { child, url };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error('Vite did not start within 60 seconds');
}

function stopAll() {
  for (const c of children) c.kill();
}
process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});

// ---- main --------------------------------------------------------------------

const opts = parseArgs(process.argv.slice(2));
log(NOTICE);

const problems = [];
const flags = nodeFlags();
const dotnetProblem = opts.skipExtract ? null : checkDotnet();
if (dotnetProblem) problems.push(dotnetProblem);
const paks = opts.skipExtract ? { dir: '' } : findPaks(opts.paks);
if (paks.error) problems.push(paks.error);
const usmap = opts.skipExtract ? { file: '' } : findUsmap(opts.usmap);
if (usmap.error) problems.push(usmap.error);
const browser = findBrowser(opts.browser);
if (browser.error) problems.push(browser.error);
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) problems.push('Run `npm install` first.');
if (opts.skipExtract && !exists(path.join(TOOL, 'out'))) problems.push('--skip-extract needs an earlier extraction in scripts/pal-textures/out.');
if (problems.length) fail(problems);

if (!opts.skipExtract) log(`  game files   ${paks.dir}\n  mappings     ${path.basename(usmap.file)}`);
log(`  browser      ${browser.exe}`);
log(`  pals         ${opts.only.length ? opts.only.join(', ') : 'all'}\n`);
if (opts.check) {
  log('Everything needed was found. Nothing was changed.');
  process.exit(0);
}

const steps = opts.skipExtract ? 3 : 4;
let n = 0;
const step = (title) => log(`\n[${++n}/${steps + (opts.lite ? 1 : 0)}] ${title}\n`);
const started = Date.now();

try {
  if (!opts.skipExtract) {
    step('Extracting meshes, textures and animations from the game files (resumable)');
    const batch = ['run', '--', '--batch', ...(opts.only.length ? [opts.only.join(',')] : [])];
    await run('dotnet', batch, { cwd: TOOL, env: { PALWORLD_PAKS: paks.dir, ...(opts.usmap || process.env.PALWORLD_USMAP ? { PALWORLD_USMAP: usmap.file } : {}) } });
  }

  // build-pal-models takes one pal name at a time (or none, for all of them).
  const buildModels = async (extra = []) => {
    for (const name of opts.only.length ? opts.only : [null]) {
      const size = opts.size ? ['--size', opts.size] : [];
      await run(process.execPath, [...flags, 'scripts/build-pal-models.mjs', ...extra, ...(name ? [name] : []), ...size]);
    }
  };

  step('Building .glb models');
  await buildModels();

  step('Rendering chibi portraits');
  const vite = await startVite();
  try {
    await run(process.execPath, [...flags, 'scripts/render-portraits.mjs', ...opts.only], {
      env: { DEV_URL: vite.url, EDGE: browser.exe },
    });
  } finally {
    vite.child.kill();
  }

  step('Fetching work-suitability and element icons');
  await run(process.execPath, ['scripts/fetch-work-icons.mjs']);

  if (opts.lite) {
    step('Building the lite model set for the portfolio build');
    await buildModels(['--lite']);
  }
} catch (err) {
  stopAll();
  log(`\nStopped: ${err.message}`);
  log('Re-run the same command to continue; the extraction resumes where it left off.');
  process.exit(1);
}

// ---- summary -----------------------------------------------------------------

const count = (dir, ext) => (exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length : 0);
const reportFile = path.join(TOOL, 'out', 'batch-report.json');
const failed = exists(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')).filter((r) => r.error) : [];
const mins = Math.max(1, Math.round((Date.now() - started) / 60000));

log(`\nDone in about ${mins} min.`);
log(`  models     ${count(path.join(ROOT, 'public', 'pal-models'), '.chibi.glb')} chibi .glb   (public/pal-models)`);
log(`  portraits  ${count(path.join(ROOT, 'public', 'pal-portraits'), '.webp')} stills        (public/pal-portraits)`);
log(`  icons      ${count(path.join(ROOT, 'public', 'work-icons'), '.webp')} work, ${count(path.join(ROOT, 'public', 'element-icons'), '.webp')} element   (public/work-icons, public/element-icons)`);
if (failed.length) log(`  ${failed.length} pal(s) failed to extract; see scripts/pal-textures/out/batch-report.json`);
log('\nRun `npm run dev` to see them. These files stay on this machine; they are gitignored.');
