/**
 * Build the species data the save does not carry:
 *
 *   src/data/palExtras.json — per dex id: food amount and partner skill
 *   src/data/palExp.json    — total exp a pal needs to reach each level
 *
 * Sources, each the most current one checked on 2026-10-01:
 *
 *   - Partner skill: paldb.cc/en/Partner_Skill (v1.0.5), one page listing every
 *     pal. The wiki's Cargo PalPartnerSkill table is stale — its Blazamut entry
 *     is still the Early Access wording — so it is not used. Descriptions keep
 *     paldb's per-level ranges ("(5~10)%"); exact values per level live on the
 *     individual pal pages and are not fetched.
 *   - Food amount: palworld.wiki.gg Cargo `Pal.hungerRate` (1-9). Agrees with
 *     paldb on the pals spot-checked.
 *   - Exp curve: thepalprofessor.com/xp-tables, the "Pal XP" table (v1.0.3). It
 *     is the pal curve, not the player one paldb.gg publishes — the two differ by
 *     10x at level 60. palExtras.test.ts checks it against every pal in the save.
 *
 * Both paldb and the wiki tag rows with the internal name the save uses
 * (`KingBahamut`), so rows are matched to dex ids through the same index the
 * save importer uses rather than by display name.
 *
 *   node scripts/build-pal-extras.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpeciesIndex } from '../src/save/species.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTRAS_OUT = path.join(ROOT, 'src', 'data', 'palExtras.json');
const EXP_OUT = path.join(ROOT, 'src', 'data', 'palExp.json');

const PARTNER_URL = 'https://paldb.cc/en/Partner_Skill';
const FOOD_URL =
  'https://palworld.wiki.gg/index.php?title=Special:CargoExport&format=json&limit=1000' +
  '&tables=Pal&fields=palName,internalName,hungerRate';
const EXP_URL = 'https://thepalprofessor.com/xp-tables/';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (palworld-breeding-index build script)' };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    console.error(`${url}: HTTP ${res.status}`);
    process.exit(1);
  }
  return res.text();
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');

/** Tags out, entities decoded, whitespace collapsed. */
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/ ([.,%)])/g, '$1').trim();

const dex = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'pals.json'), 'utf8'));
const species = buildSpeciesIndex(dex);

// ---- partner skills (paldb) -------------------------------------------------
// Each pal block: <a data-pal-id="KingBahamut" ...>Blazamut</a> ... "Partner Skill"
// ... <span class="ms-2">Magma Kaiser</span> Lv.1 ... <div class="flex-grow-1 ms-2">
// description <div>(saddle/tech links)</div>. Split on the pal anchors so a block
// can never bleed into the next pal.
const partnerHtml = await get(PARTNER_URL);
const partners = new Map();
/** dex id -> paldb page slug ("Blazamut"), for the per-pal rarity fetch below. */
const pages = new Map();
const unmatchedPartner = [];
for (const block of partnerHtml.split(/(?=<a data-pal-id=")/).slice(1)) {
  const id = /^<a data-pal-id="([^"]+)"/.exec(block)?.[1];
  const nameM = /Partner Skill\s*<\/div>\s*<\/div>\s*<div[^>]*><span class="ms-2">([^<]+)<\/span>/.exec(block);
  const descM = /<div class="flex-grow-1 ms-2">([\s\S]*?)(?:<div>|<\/div>)/g;
  if (!id || !nameM) continue;
  // The first flex-grow-1 ms-2 is the pal's name header; the description is the
  // one after the "Partner Skill" heading.
  descM.lastIndex = nameM.index;
  const desc = descM.exec(block);
  const match = species.lookup(id);
  if (!match) {
    unmatchedPartner.push(id);
    continue;
  }
  if (!partners.has(match.palId)) {
    partners.set(match.palId, { name: decode(nameM[1]).trim(), description: desc ? text(desc[1]) : '' });
    const href = /^<a data-pal-id="[^"]+"[^>]*href="([^"]+)"/.exec(block)?.[1];
    if (href) pages.set(match.palId, href);
  }
}

// ---- rarity (paldb, one page per pal) -----------------------------------------
// No list page carries rarity, so each pal page is fetched — throttled, and
// cached on disk so a re-run does not hit paldb again. Delete scripts/.cache/paldb
// after a game patch.
const CACHE = path.join(ROOT, 'scripts', '.cache', 'paldb');
fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function palPage(slug) {
  const file = path.join(CACHE, `${slug.replace(/[^A-Za-z0-9_-]/g, '_')}.html`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  await sleep(250);
  const html = await get(`https://paldb.cc/en/${slug}`);
  fs.writeFileSync(file, html);
  return html;
}
const rarity = new Map();
const noRarity = [];
for (const [palId, slug] of pages) {
  const m = /<div>Rarity<\/div>[\s\S]*?<\/div>\s*<\/div>\s*<div>(\d+)<\/div>/.exec(await palPage(slug));
  if (m) rarity.set(palId, Number(m[1]));
  else noRarity.push(slug);
}

// ---- food (wiki) ------------------------------------------------------------
const foodRows = JSON.parse(await get(FOOD_URL));
const food = new Map();
const unmatchedFood = [];
for (const r of foodRows) {
  if (r.hungerRate == null) continue;
  const match = (r.internalName && species.lookup(r.internalName)) || species.lookup(r.palName ?? '');
  if (!match) {
    unmatchedFood.push(r.internalName || r.palName);
    continue;
  }
  if (!food.has(match.palId)) food.set(match.palId, Number(r.hungerRate));
}

// Cosmetic variants neither source lists separately: same pal, same data as the
// base species. Gumoss (Special) is Gumoss wearing a flower prop.
const SAME_AS = { '12.1': '12.0' };
for (const [variant, base] of Object.entries(SAME_AS)) {
  if (!food.has(variant) && food.has(base)) food.set(variant, food.get(base));
  if (!partners.has(variant) && partners.has(base)) partners.set(variant, partners.get(base));
  if (!rarity.has(variant) && rarity.has(base)) rarity.set(variant, rarity.get(base));
}

// ---- write extras -------------------------------------------------------------
const extras = {};
const missing = [];
for (const id of Object.keys(dex).sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b))) {
  const entry = {};
  if (food.has(id)) entry.food = food.get(id);
  if (rarity.has(id)) entry.rarity = rarity.get(id);
  if (partners.has(id)) entry.partner = partners.get(id);
  const gaps = [!entry.food && 'food', !entry.rarity && 'rarity', !entry.partner && 'partner'].filter(Boolean);
  if (gaps.length) missing.push(`${id} ${dex[id].name} (${gaps.join(', ')})`);
  if (Object.keys(entry).length) extras[id] = entry;
}
fs.writeFileSync(EXTRAS_OUT, JSON.stringify(extras, null, 2) + '\n');
const total = Object.keys(dex).length;
console.log(
  `wrote ${path.relative(ROOT, EXTRAS_OUT)}: food ${food.size}/${total}, rarity ${rarity.size}/${total}, partner skill ${partners.size}/${total}`,
);
if (missing.length) console.log(`  incomplete: ${missing.join('; ')}`);
if (noRarity.length) console.log(`  paldb pages with no Rarity row: ${noRarity.join(', ')}`);
const histogram = {};
for (const r of rarity.values()) histogram[r] = (histogram[r] ?? 0) + 1;
console.log(`  rarity histogram: ${Object.entries(histogram).map(([r, n]) => `${r}:${n}`).join(' ')}`);
if (unmatchedPartner.length) console.log(`  paldb ids with no dex entry: ${unmatchedPartner.join(', ')}`);
if (unmatchedFood.length) console.log(`  wiki rows with no dex entry: ${unmatchedFood.join(', ')}`);

// ---- exp curve ------------------------------------------------------------------
// The page has three tables (player, pal, kill exp). Pick the one whose heading is
// "Pal XP" rather than trusting the order.
const expHtml = await get(EXP_URL);
let palTable = null;
for (const m of expHtml.matchAll(/<table[\s\S]*?<\/table>/g)) {
  const before = text(expHtml.slice(Math.max(0, m.index - 300), m.index));
  if (/Pal XP\s*$/i.test(before)) palTable = m[0];
}
if (!palTable) {
  console.error('exp: no table headed "Pal XP" — the page layout changed');
  process.exit(1);
}
// Row: Lv | Xp to Lv | Total Xp Gained. totals[level] = exp to *reach* that level.
const totals = [0];
for (const row of palTable.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
  const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => text(c[1]));
  const lv = Number(cells[0]);
  if (!Number.isInteger(lv) || lv < 1) continue;
  totals[lv] = Number(cells[2].replace(/,/g, ''));
}
for (let lv = 1; lv < totals.length; lv++) {
  if (!Number.isFinite(totals[lv]) || (lv > 1 && totals[lv] <= totals[lv - 1])) {
    console.error(`exp: bad or non-increasing total at level ${lv}`);
    process.exit(1);
  }
}
fs.writeFileSync(EXP_OUT, JSON.stringify(totals) + '\n');
console.log(`wrote ${path.relative(ROOT, EXP_OUT)}: levels 1-${totals.length - 1}`);
