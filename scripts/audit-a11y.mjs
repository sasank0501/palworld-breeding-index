/**
 * Accessibility audit of the running app: axe-core (WCAG 2.0-2.2 A/AA plus best
 * practices) on every screen in all four skins, under both colour schemes, then a
 * keyboard pass (tab order, focus after opening a species and after Back), what
 * keeps moving under prefers-reduced-motion, and the layout at phone width.
 *
 *   npm run dev                      (in another terminal)
 *   npm run audit-a11y
 *
 *   APP=<url>   the page to audit (default http://localhost:5173/)
 *   EDGE=<exe>  the browser (default Edge's usual install path)
 *
 * Prints violations grouped by rule, most severe first. The full results and a
 * screenshot per screen go to scripts/.cache/a11y/ (gitignored). docs/A11Y.md
 * holds the findings and the checklist this feeds.
 */
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP ?? 'http://localhost:5173/';
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SKINS = ['pal', 'obsidian', 'sakura', 'feybreak'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache', 'a11y');
const out = (file) => path.join(OUT, file);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const results = []; // { skin, scheme, scene, violations }
const notes = {};

async function fresh(opts = {}, skin) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  // The skin is a stored preference (src/routes/showcase/skins.ts); set it before the first paint.
  if (skin) await ctx.addInitScript((s) => localStorage.setItem('palworld-sc-skin', s), skin);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => (notes.pageErrors ??= []).push(String(e)));
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sc-shell', { timeout: 60000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

async function checkSkin(page, skin) {
  const got = await page.evaluate(() => document.querySelector('.sc-shell')?.getAttribute('data-skin'));
  if (got !== skin) throw new Error(`asked for skin ${skin}, the page shows ${got}`);
}

async function tab(page, label) {
  await page.getByRole('tab', { name: label }).click();
  await page.waitForTimeout(1200);
}

async function scan(page, meta) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  results.push({ ...meta, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary, html: n.html.slice(0, 200) })) })) });
  await page.screenshot({ path: out(`${meta.skin}-${meta.scheme}-${meta.scene}.png`) });
}

for (const scheme of ['dark', 'light']) {
  for (const skin of SKINS) {
    const { ctx, page } = await fresh({ colorScheme: scheme }, skin);
    await checkSkin(page, skin);
    const m = (scene) => ({ skin, scheme, scene });
    await scan(page, m('dex'));
    await page.locator('.sc-dex').first().click();
    await page.waitForTimeout(1500);
    await scan(page, m('species'));
    await page.keyboard.press('Escape');
    await tab(page, 'My Pals');
    await scan(page, m('box'));
    await page.locator('.sc-pal').first().click();
    await page.waitForTimeout(1500);
    await scan(page, m('pal'));
    await page.keyboard.press('Escape');
    await tab(page, 'Breeding');
    await scan(page, m('breeding'));
    await tab(page, 'Planner');
    await scan(page, m('planner'));
    await ctx.close();
  }
}

// ---- keyboard: focus order, focus visibility, focus after open / back -------
{
  const { ctx, page } = await fresh();
  const describe = () => {
    const a = document.activeElement;
    if (!a || a === document.body) return { el: 'body' };
    const cs = getComputedStyle(a);
    const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
    return { el: `${a.tagName.toLowerCase()}.${[...a.classList].join('.')}`, name: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40), focusVisible: visible };
  };
  const order = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(describe);
    order.push(d);
    if (d.el.startsWith('button.sc-dex')) break;
  }
  notes.tabsToFirstTile = order.length;
  notes.tabOrder = order;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  notes.focusAfterOpenSpecies = await page.evaluate(describe);
  notes.headingAfterOpen = await page.evaluate(() => document.querySelector('h1,h2')?.textContent?.trim().slice(0, 60));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  notes.focusAfterBack = await page.evaluate(describe);
  notes.pageTitle = await page.title();
  notes.lang = await page.evaluate(() => document.documentElement.lang);
  notes.landmarks = await page.evaluate(() => ({ main: document.querySelectorAll('main,[role=main]').length, nav: document.querySelectorAll('nav').length, h1: document.querySelectorAll('h1').length, skipLink: !!document.querySelector('a[href^="#"]') }));
  await ctx.close();
}

// ---- reduced motion: what keeps animating ----------------------------------
{
  const { ctx, page } = await fresh({ reducedMotion: 'reduce' });
  await page.waitForTimeout(2500);
  notes.reducedMotion = await page.evaluate(() => {
    const running = document.getAnimations().filter((a) => a.playState === 'running');
    const by = {};
    for (const a of running) {
      const t = a.effect?.target;
      const k = `${a.animationName ?? a.constructor.name} on ${t?.tagName?.toLowerCase()}.${[...(t?.classList ?? [])].join('.')}`;
      by[k] = (by[k] ?? 0) + 1;
    }
    const mv = [...document.querySelectorAll('model-viewer')].map((m) => ({ autoRotate: m.hasAttribute('auto-rotate'), autoplay: m.hasAttribute('autoplay') }));
    return { runningAnimations: by, modelViewers: mv };
  });
  await ctx.close();
}

// ---- phone width ------------------------------------------------------------
{
  const { ctx, page } = await fresh({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  notes.phone = await page.evaluate(() => {
    // The page clips overflow, so also look for any visible element past the screen's edge
    // (the search box once stuck out 38 px while the page itself reported no overflow).
    const sticking = [...document.querySelectorAll('.sc-page *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= innerWidth + 1 || getComputedStyle(el).visibility === 'hidden') return false;
        // Ignore what is meant to be off screen or is clipped by a parent: decorative layers,
        // scrolling strips, and the invisible hover room around My Pals cards.
        if (el.closest('[aria-hidden="true"], .sc-tabs, .dl-anims, .sc-spot-stage') || el.matches('.sc-palwrap')) return false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= innerWidth + 1) return false;
        }
        return true;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 8);
    return { horizontalOverflow: document.documentElement.scrollWidth > innerWidth, scrollWidth: document.documentElement.scrollWidth, stickingOut: sticking, firstTileTop: Math.round(document.querySelector('.sc-dex')?.getBoundingClientRect().top ?? -1) };
  });
  await page.screenshot({ path: out('phone-dex.png') });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(out('results.json'), JSON.stringify({ results, notes }, null, 2));

// ---- summary ------------------------------------------------------------------
const byRule = {};
for (const r of results) for (const v of r.violations) {
  const e = (byRule[v.id] ??= { impact: v.impact, help: v.help, scenes: new Set(), nodes: 0, examples: new Set() });
  e.scenes.add(`${r.skin}/${r.scheme}/${r.scene}`);
  e.nodes += v.nodes.length;
  for (const n of v.nodes.slice(0, 3)) e.examples.add(n.target);
}
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
for (const [id, e] of Object.entries(byRule).sort((a, b) => order[a[1].impact] - order[b[1].impact])) {
  console.log(`\n[${e.impact}] ${id}: ${e.help}\n  nodes=${e.nodes} scenes=${e.scenes.size}/${results.length}\n  e.g. ${[...e.examples].slice(0, 4).join(' | ')}`);
}
console.log('\nNOTES', JSON.stringify({ ...notes, tabOrder: notes.tabOrder?.map((d) => `${d.el} "${d.name}" fv=${d.focusVisible}`) }, null, 2));
