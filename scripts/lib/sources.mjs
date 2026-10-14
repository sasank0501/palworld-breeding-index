/**
 * Readers for the public data of the sites PalDoc's game data is cross-checked against.
 * Used by scripts/compare-sources.mjs. Every network request goes through `fetchCached`: one
 * request per file, a pause between requests, and a local copy (scripts/.cache/sources/,
 * gitignored) so a re-run costs nothing unless `--refresh` is given.
 *
 * What is fetched, and why it is allowed:
 *
 *   the game    nothing is fetched: `loadGame` reads the JSON that scripts/pal-textures writes from
 *               a copy of Palworld on this machine (gitignored; absent on a machine without one).
 *   paldb.cc    three list pages (Active_Skills, Passive_Skills, Pals_Table), robots-allowed.
 *               The per-pal pages are NOT fetched here: they are read from scripts/.cache/paldb/,
 *               which `npm run build-pal-extras` filled earlier.
 *   palworld.gg its /pals list page: every pal with rarity, elements and work levels in one
 *               server-rendered page. Its skill tables are filled in by the browser, one page
 *               at a time, so they are not read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = path.join(ROOT, 'scripts', '.cache', 'sources');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PalDocDataCheck/1.0 (personal hobby project; github.com/sasank0501)';
const PAUSE_MS = 2000;
let last = 0;

export async function fetchCached(url, name, { refresh = false } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  if (!refresh && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' } });
  last = Date.now();
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(file, text);
  console.error(`fetched ${url} (${(text.length / 1024).toFixed(0)} KB)`);
  return text;
}

// ---- small helpers shared by the comparison ----
export const decode = (s) => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&ndash;/g, '–');
/** Letters and digits only, lower case, typographic apostrophes straightened: the join key for names. */
export const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']/g, '');
export const compact = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Work suitability names used by the sites -> the codes pals.json uses. */
export const JOBS = {
  Kindling: 'Kdl', kindling: 'Kdl', Watering: 'Wtr', watering: 'Wtr', Planting: 'Plt', planting: 'Plt',
  'Generating Electricity': 'Elc', generating: 'Elc', electricity: 'Elc', Handiwork: 'Hnd', handcraft: 'Hnd',
  Gathering: 'Gth', gathering: 'Gth', Lumbering: 'Lmb', Logging: 'Lmb', Deforesting: 'Lmb', logging: 'Lmb',
  Mining: 'Min', mining: 'Min', 'Medicine Production': 'Med', medicine: 'Med', Cooling: 'Cool', cooling: 'Cool',
  Transporting: 'Trn', transport: 'Trn', Farming: 'Frm', farming: 'Frm',
};
/** Element names the sites use -> the ids pals.json uses. */
export const ELEMENT = { normal: 'neutral', electricity: 'electric', earth: 'ground', leaf: 'grass' };
export const element = (e) => ELEMENT[e.toLowerCase()] ?? e.toLowerCase();

// ---- the game's own data tables ----
/**
 * The passive table and the English skill names, from the game itself. Made on a machine with
 * Palworld installed, in scripts/pal-textures (PALWORLD_PAKS set to the game's Pal/Content/Paks):
 *
 *   dotnet run -- --table DT_PassiveSkill_Main
 *   dotnet run -- --table L10N/en/Pal/DataTable/Text/DT_SkillNameText
 *
 * Returns null where the dump is missing. Nothing here is a website: this is what the game does.
 */
export function loadGame() {
  const dir = path.join(ROOT, 'scripts', 'pal-textures', 'out', '_tables');
  const table = path.join(dir, 'DT_PassiveSkill_Main.json');
  const text = path.join(dir, 'en-DT_SkillNameText_Common.json');
  if (!fs.existsSync(table) || !fs.existsSync(text)) return null;
  const rows = JSON.parse(fs.readFileSync(table, 'utf8'))[0].Rows;
  const passives = new Map(Object.entries(rows).map(([id, r]) => [id, { rank: r.Rank }]));
  const names = new Map();
  for (const [key, v] of Object.entries(JSON.parse(fs.readFileSync(text, 'utf8'))[0].Rows)) {
    if (key.startsWith('PASSIVE_')) names.set(key.slice('PASSIVE_'.length), v.TextData?.LocalizedString ?? v.TextData?.SourceString);
  }
  // The text table's keys differ from the row names in letter case for a few ids.
  const lower = new Map([...names].map(([k, v]) => [k.toLowerCase(), v]));
  for (const id of passives.keys()) if (!names.has(id) && lower.has(id.toLowerCase())) names.set(id, lower.get(id.toLowerCase()));
  return { passives, names };
}

// ---- paldb.cc ----
export async function loadPaldb(opts) {
  const active = await fetchCached('https://paldb.cc/en/Active_Skills', 'paldb-active.html', opts);
  const passive = await fetchCached('https://paldb.cc/en/Passive_Skills', 'paldb-passive.html', opts);
  const skills = new Map();
  for (const c of active.split('<div class="card itemPopup activeSkill">').slice(1)) {
    const code = c.match(/Waza%2FEPalWazaID%3A%3A([^"&]+)/)?.[1];
    if (!code) continue;
    const k = compact(code);
    if (skills.has(k)) continue;
    skills.set(k, {
      code,
      name: decode(c.match(/<a data-hover="\?s=Waza[^"]*" href="[^"]*"[^>]*>([^<]+)<\/a>/)?.[1] ?? ''),
      element: c.match(/<span style="padding-left: 35px">([^<]+)<\/span>/)?.[1],
      cooldown: Number(c.match(/data-bs-title="CoolTime"[^>]*>:\s*<span[^>]*>([\d.]+)<\/span>/)?.[1]),
      power: Number(c.match(/Power:\s*<span[^>]*>(\d+)<\/span>/)?.[1]),
    });
  }
  const passives = new Map();
  for (const b of passive.split('<div class="col"><div class="border bg-dark">').slice(1)) {
    const m = b.match(/<div class="passive-rank(-?\d+)[^"]*[^>]*>([^<]+)<\/div>/);
    if (!m) continue;
    const name = decode(m[2].trim());
    const text = decode(b.slice(b.indexOf('class="p-2"')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).replace(/^class="p-2" style="position: relative"\s*/, '');
    passives.set(norm(name), { name, rank: Number(m[1]), text });
  }
  const version = active.match(/<a href="version">(v[\d.]+)<\/a>\s*([\d/]+)/);
  return { skills, passives, version: version ? `${version[1]} (${version[2]})` : 'unknown' };
}

/** paldb's per-pal pages, if an earlier `npm run build-pal-extras` cached them. Never fetches. */
export function loadPaldbPals() {
  const dir = path.join(ROOT, 'scripts', '.cache', 'paldb');
  if (!fs.existsSync(dir)) return null;
  const out = new Map();
  for (const f of fs.readdirSync(dir)) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const name = html.match(/<title>([^<]+?) - Palworld Database/)?.[1];
    if (!name) continue;
    const work = {};
    for (const m of html.matchAll(/href="[A-Za-z_]+"><img[^>]*palwork[^>]*>\s*([^<]+?)\s*<\/a>\s*<\/div>\s*<div>\s*<span[^>]*>Lv<\/span>\s*(?:<span[^>]*>)?\s*(\d+)/g)) {
      const j = JOBS[m[1].trim()];
      if (j) work[j] = Number(m[2]);
    }
    const k = html.indexOf('<div>Food</div>');
    const food = k > 0 ? [...html.slice(k, k + 4000).matchAll(/foodamount_(on|off)/g)].slice(0, 10).filter((m) => m[1] === 'on').length : undefined;
    out.set(norm(decode(name)), { name: decode(name), work, food });
  }
  return out;
}

// ---- palworld.gg ----
export async function loadPalworldGg(opts) {
  const html = await fetchCached('https://palworld.gg/pals', 'palworldgg-pals.html', opts);
  const out = new Map();
  for (const c of html.split('<div class="pal"><a href="/pal/').slice(1)) {
    const name = decode(c.match(/<div class="name">([^<]+?)\s*<span class="index">#[^<]+<\/span>/)?.[1] ?? '');
    if (!name) continue;
    const rar = c.match(/<div class="(\w+) rarity"><div class="lv">(\d+)<\/div>/);
    const work = {};
    for (const m of c.matchAll(/alt="([A-Za-z ]+)" width="20"><\/div><!----><\/div><div class="level"><!----><span class="value">(\d+)<\/span>/g)) {
      const j = JOBS[m[1]];
      if (j) work[j] = Number(m[2]);
    }
    out.set(norm(name), {
      name,
      rarity: rar ? Number(rar[2]) : undefined,
      work,
      elements: [...c.matchAll(/alt="(\w+) element"/g)].map((m) => element(m[1])).sort(),
    });
  }
  return out;
}
