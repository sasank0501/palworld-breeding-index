/**
 * Build src/data/skills.json — every active skill ("waza"), keyed by the internal
 * code name the save stores (`EPalWazaID::AirCanon` -> `AirCanon`).
 *
 * No wiki publishes those code names. PalCalc (MIT, github.com/tylercamp/palcalc)
 * extracts them from the game's own data tables, so its attacks.csv is the
 * source. The commit is pinned so a rebuild is reproducible; bump it after a
 * game patch and re-run.
 *
 * The wiki's Cargo ActiveSkill table is then used as an independent check on
 * name, power and cooldown. Mismatches are summarised, not fatal. As of
 * 2026-09-30 the wiki disagrees on ~250 of 302 skills — it still carries the
 * Early Access numbers (Acid Rain 80 power / 18s). paldb.cc at v1.0.5 agrees with
 * PalCalc (Acid Rain 120 / 8s, Air Cannon 40 / 2s), so PalCalc is the one trusted.
 * If the disagreement count ever drops sharply, the wiki has caught up.
 *
 *   node scripts/build-skills.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'skills.json');

const PALCALC_COMMIT = '8566b9addf72e62bc424c59293afd97eacb038ec'; // 2026-09-18
const CSV_URL = `https://raw.githubusercontent.com/tylercamp/palcalc/${PALCALC_COMMIT}/PalCalc.GenDB/out-csv/attacks.csv`;
const WIKI_URL =
  'https://palworld.wiki.gg/index.php?title=Special:CargoExport&format=json&limit=1000' +
  '&tables=ActiveSkill&fields=activeSkillName,element,power,cooldownTime';

/** PalCalc's element names -> the lower-case ids pals.json uses. */
const ELEMENTS = {
  Neutral: 'neutral',
  Fire: 'fire',
  Water: 'water',
  Leaf: 'grass',
  Grass: 'grass',
  Electricity: 'electric',
  Electric: 'electric',
  Ice: 'ice',
  Earth: 'ground',
  Ground: 'ground',
  Dark: 'dark',
  Dragon: 'dragon',
};

/** Minimal CSV: the file has no quoted commas today, but handle quotes anyway. */
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === ',' && !quoted) {
        cells.push(cur);
        cur = '';
      } else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const res = await fetch(CSV_URL);
if (!res.ok) {
  console.error(`attacks.csv: HTTP ${res.status}`);
  process.exit(1);
}
const rows = parseCsv(await res.text());

const skills = {};
const badElements = new Set();
for (const r of rows) {
  const element = ELEMENTS[r.Element];
  if (!element) badElements.add(r.Element);
  skills[r.CodeName] = {
    name: r.Name,
    element: element ?? 'neutral',
    power: Number(r.Power),
    cooldown: Number(r.CooldownSeconds),
    fruit: r.HasSkillFruit === 'True',
    inheritable: r.CanInherit === 'True',
  };
}
if (badElements.size) {
  console.error(`unknown elements in attacks.csv: ${[...badElements].join(', ')} — extend ELEMENTS`);
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(skills).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
console.log(`wrote ${Object.keys(sorted).length} skills -> ${path.relative(ROOT, OUT)}`);

// Independent check against the wiki. Advisory only.
try {
  const wres = await fetch(WIKI_URL, { headers: { 'User-Agent': 'palworld-breeding-index build script' } });
  if (!wres.ok) throw new Error(`HTTP ${wres.status}`);
  const wiki = new Map((await wres.json()).map((w) => [w.activeSkillName, w]));
  const diffs = [];
  let matched = 0;
  for (const s of Object.values(sorted)) {
    const w = wiki.get(s.name);
    if (!w) continue;
    matched++;
    if (Number(w.power) !== s.power) diffs.push(`${s.name}: power ${s.power} vs wiki ${w.power}`);
    if (Number(w.cooldownTime) !== s.cooldown) diffs.push(`${s.name}: cooldown ${s.cooldown} vs wiki ${w.cooldownTime}`);
  }
  console.log(`wiki cross-check: ${matched} of ${Object.keys(sorted).length} matched by name, ${diffs.length} disagreements`);
  for (const d of diffs.slice(0, 5)) console.log(`  ${d}`);
  if (diffs.length > 5) console.log(`  … ${diffs.length - 5} more (the wiki lags 1.0 — see the header comment)`);
} catch (err) {
  console.warn(`wiki cross-check skipped: ${err.message}`);
}
