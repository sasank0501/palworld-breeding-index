/**
 * Take the screenshots the homepage tour shows (src/routes/home/): four pages of the app on
 * the sample roster (public/demo-roster.json), light and dark, with every pal drawn as a
 * silhouette. Run it again whenever the app's look changes.
 *
 *   npm run dev -- --port 5174 --strictPort      # in another terminal
 *   npm run capture-tour
 *
 * Needs the game art on this machine (`npm run build-portraits`): the silhouettes are the
 * pals' own pictures with a CSS filter that turns them black. The output is committed: the
 * landing page showing silhouettes is the one exception to "the public repo ships no game
 * art" (owner's decision, 2026-10-12). Never capture the pals in colour for it.
 *
 * The window is 1360 x 1700 CSS pixels, captured at 1.5x (2040 x 2550), which is what
 * SHOT in src/routes/home/shots.ts says. If you change one, change the other.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.APP ?? 'http://localhost:5174/';
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = path.join(ROOT, 'src', 'design', 'tour');
const WIDTH = 1360;
const HEIGHT = 1700;
const SCALE = 1.5;

const demo = fs.readFileSync(path.join(ROOT, 'public', 'demo-roster.json'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

// The pals' pictures (2D stills, and the 3D viewer in the spotlight) as flat silhouettes: dark ink on the
// light skin, light ink on Mount Obsidian.
const SILHOUETTES = `
  img[src*="pal-portraits"], img[src*="/pals/"], model-viewer { filter: brightness(0) opacity(0.82) !important; }
  .sc-shell[data-skin='obsidian'] img[src*="pal-portraits"], .sc-shell[data-skin='obsidian'] img[src*="/pals/"],
  .sc-shell[data-skin='obsidian'] model-viewer { filter: brightness(0) invert(1) opacity(0.85) !important; }
  ::-webkit-scrollbar { display: none; }
`;

const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE, colorScheme: scheme, reducedMotion: 'reduce' });
  // The dev server would hand over the personal roster: the sample one stands in for it.
  await ctx.route('**/roster.json', (r) => r.fulfill({ contentType: 'application/json', body: demo }));
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: SILHOUETTES });
  await page.getByRole('button', { name: 'Got it' }).click().catch(() => {});

  const snap = async (name) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const file = path.join(OUT, `${name}-${scheme}.webp`);
    await sharp(await page.screenshot()).webp({ quality: 78 }).toFile(file);
    console.log(`${name}-${scheme}.webp`.padEnd(24), `${Math.round(fs.statSync(file).size / 1024)} KB`);
  };

  await snap('home');
  for (const [tab, name] of [['My Pals', 'mypals'], ['Breeding', 'breeding'], ['Planner', 'planner']]) {
    await page.getByRole('tab', { name: tab }).click();
    if (name === 'planner') {
      // A finished plan reads better than the empty form: Anubis with the Combat preset.
      await page.getByPlaceholder(/Search 289 species/).fill('Anubis');
      await page.waitForTimeout(600);
      await page.getByRole('option', { name: /Anubis/ }).first().click({ timeout: 3000 }).catch(() =>
        page.getByRole('button', { name: /Anubis/ }).first().click({ timeout: 3000 }).catch(() => console.log('planner: could not pick a species')));
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Combat', exact: true }).click({ timeout: 3000 }).catch(() => console.log('planner: no Combat preset'));
      await page.getByRole('button', { name: 'Find the lineage' }).click({ timeout: 3000 }).catch(() => console.log('planner: no Find button'));
      await page.waitForTimeout(6000);
    }
    await snap(name);
  }
  await ctx.close();
}
await browser.close();
