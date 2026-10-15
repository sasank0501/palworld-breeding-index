/**
 * Take the screenshots the homepage tour shows (src/routes/home/): four pages of the app on
 * the sample roster (public/demo-roster.json), in each of the four skins, with every pal drawn
 * as a silhouette. Run it again whenever the app's look changes.
 *
 *   npm run dev -- --port 5174 --strictPort      # in another terminal
 *   npm run capture-tour
 *
 * Needs the game art on this machine (`npm run build-portraits`): the silhouettes are the
 * pals' own pictures with a CSS filter that turns them black. The output is committed: the
 * landing page showing silhouettes is the one exception to "the public repo ships no game
 * art" (owner's decision, 2026-10-12). Never capture the pals in colour for it.
 *
 * Each skin gets its own set (owner, 2026-10-14: Sakurajima and Feybreak showed Palpagos and
 * Mount Obsidian pictures), named <page>-<skin>.webp, which shotUrl in src/routes/home/shots.ts reads.
 * The pages show the app in use, not empty: the Breeding page with a pair worked out in its
 * calculator, the Planner with a finished plan.
 *
 * The window is 1360 x 1700 CSS pixels, captured at 2x (2720 x 3400), which is what SHOT in
 * src/routes/home/shots.ts says. If you change one, change the other. 2x because the tour draws a
 * screenshot up to about 2600 device pixels wide (a 4K screen at 100%, 1080p at 200%); at 1.5x it was
 * stretched there and looked pixelated (owner, 2026-10-14). Each is written twice: AVIF (4:4:4 colour,
 * so small text keeps clean edges; about 200 KB) and WebP for browsers without AVIF.
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
const SCALE = 2;
/** Each skin, and whether it is one of the two dark ones (their silhouettes are light ink). */
const SKINS = [
  ['pal', false],
  ['obsidian', true],
  ['sakura', false],
  ['feybreak', true],
];
const only = process.argv.slice(2);

const demo = fs.readFileSync(path.join(ROOT, 'public', 'demo-roster.json'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

// The pals' pictures (2D stills, and the 3D viewer in the spotlight) as flat silhouettes: dark ink on the
// light skins, light ink on the dark ones.
const silhouettes = (dark) => `
  img[src*="pal-portraits"], img[src*="/pals/"], model-viewer { filter: brightness(0) ${dark ? 'invert(1) opacity(0.85)' : 'opacity(0.82)'} !important; }
  ::-webkit-scrollbar { display: none; }
`;

const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [skin, dark] of SKINS) {
  if (only.length && !only.includes(skin)) continue;
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
  await ctx.addInitScript((s) => localStorage.setItem('palworld-sc-skin', s), skin);
  // The dev server would hand over the personal roster: the sample one stands in for it.
  await ctx.route('**/roster.json', (r) => r.fulfill({ contentType: 'application/json', body: demo }));
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: silhouettes(dark) });
  await page.getByRole('button', { name: 'Got it' }).click().catch(() => {});

  const snap = async (name) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
    const png = await page.screenshot();
    const base = path.join(OUT, `${name}-${skin}`);
    await sharp(png).avif({ quality: 60, chromaSubsampling: '4:4:4', effort: 6 }).toFile(`${base}.avif`);
    await sharp(png).webp({ quality: 85, smartSubsample: true, effort: 6 }).toFile(`${base}.webp`);
    const kb = (ext) => `${Math.round(fs.statSync(`${base}.${ext}`).size / 1024)} KB`;
    console.log(`${name}-${skin}`.padEnd(22), 'avif', kb('avif').padEnd(8), 'webp', kb('webp'));
  };
  const pickSpecies = async (field, name) => {
    await field.fill(name);
    await page.waitForTimeout(400);
    await field.press('Enter');
    await page.waitForTimeout(400);
  };

  await snap('home');
  for (const [tab, name] of [['My Pals', 'mypals'], ['Breeding', 'breeding'], ['Planner', 'planner']]) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(600);
    if (name === 'breeding') {
      // The pair calculator in use: two parents and the pal they breed.
      await pickSpecies(page.getByLabel('First parent: search species'), 'Anubis').catch(() => console.log('breeding: no first parent box'));
      await pickSpecies(page.getByLabel('Second parent: search species'), 'Direhowl').catch(() => console.log('breeding: no second parent box'));
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await page.evaluate(() => document.querySelector('.sc-page')?.scrollTo({ top: 0 }));
    }
    if (name === 'planner') {
      // A finished plan reads better than the empty form: Anubis with the Combat preset. Once it is
      // found, the setup folds into the summary row and the plan takes the full width.
      await pickSpecies(page.getByPlaceholder(/Search 289 species/), 'Anubis').catch(() => console.log('planner: could not pick a species'));
      await page.getByRole('button', { name: 'Combat', exact: true }).first().click({ timeout: 3000 }).catch(() => console.log('planner: no Combat preset'));
      await page.getByRole('button', { name: 'Find the lineage' }).first().click({ timeout: 3000 }).catch(() => console.log('planner: no Find button'));
      await page.waitForSelector('.sc-result', { timeout: 60000 }).catch(() => console.log('planner: no plan'));
      await page.waitForTimeout(1500);
      await page.evaluate(() => document.querySelector('.sc-page')?.scrollTo({ top: 0 }));
    }
    await snap(name);
  }
  await ctx.close();
}
await browser.close();
