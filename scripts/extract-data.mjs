/**
 * One-off pipeline: pull the inline DATA blob out of the legacy single-file tool and
 * emit typed JSON for the app.
 *
 * The legacy encoding is positional tuples:
 *   pals[id] = [name, power, num, variant, types[], imgUrl, [[workAbbr, level], ...]]
 * which is compact but means `pals[id][6]` litters the code. Since we now have a build
 * step, convert to named fields once here.
 *
 *   node scripts/extract-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = path.join(ROOT, 'legacy', 'palworld_breeding_index_2.html');
const OUT = path.join(ROOT, 'src', 'data');

const src = fs.readFileSync(LEGACY, 'utf8');

const dataMatch = src.match(/<script id="DATA" type="application\/json">([\s\S]*?)<\/script>/);
if (!dataMatch) throw new Error('DATA block not found in legacy HTML');
const D = JSON.parse(dataMatch[1]);

const saveMatch = src.match(/const YOUR_SAVE = (\[[\s\S]*?\]);/);
if (!saveMatch) throw new Error('YOUR_SAVE not found in legacy HTML');
const sampleRoster = JSON.parse(saveMatch[1]);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const pals = {};
const slugSeen = new Map();
const fileSeen = new Map();

for (const [id, t] of Object.entries(D.pals)) {
  const [name, power, num, variant, types, imgUrl, work] = t;

  const slug = slugify(name);
  if (slugSeen.has(slug)) {
    throw new Error(`slug collision "${slug}": ${slugSeen.get(slug)} and ${name}`);
  }
  slugSeen.set(slug, name);

  // keep the upstream basename so fetch-images.mjs and the app agree on filenames
  const file = imgUrl ? imgUrl.split('/').pop() : null;
  if (file) {
    if (fileSeen.has(file)) {
      throw new Error(`image filename collision "${file}": ${fileSeen.get(file)} and ${name}`);
    }
    fileSeen.set(file, name);
  }

  pals[id] = {
    id,
    slug,
    name,
    power,
    num,
    variant,
    types,
    img: file ? `pals/${file}` : null,
    remoteImg: imgUrl || null,
    work: work.map(([job, level]) => ({ job, level })),
  };
}

// child -> list of parent pairs, unchanged in shape
const combos = D.child;

const meta = {
  version: D.v,
  unbreedable: D.unbr,
  // [parentA, parentB, child, sexOfA, sexOfB] — the sole sex-dependent pairing
  gender: D.gender ?? [],
};

// ---- integrity gates: fail loudly rather than shipping a broken matrix ----
const ids = new Set(Object.keys(pals));
let pairCount = 0;
for (const [childId, pairs] of Object.entries(combos)) {
  if (!ids.has(childId)) throw new Error(`combos references unknown child ${childId}`);
  for (const [a, b] of pairs) {
    if (!ids.has(a) || !ids.has(b)) throw new Error(`combos references unknown parent ${a}/${b}`);
    pairCount++;
  }
}
for (const id of meta.unbreedable) if (!ids.has(id)) throw new Error(`unbr references unknown ${id}`);
for (const g of meta.gender) {
  for (const id of g.slice(0, 3)) if (!ids.has(id)) throw new Error(`gender references unknown ${id}`);
}
for (const id of sampleRoster) if (!ids.has(id)) throw new Error(`sampleRoster references unknown ${id}`);

fs.mkdirSync(OUT, { recursive: true });
const write = (name, obj) => {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(obj));
  return (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
};

console.log('pals.json        ', write('pals.json', pals), `(${ids.size} Pals)`);
console.log('combos.json      ', write('combos.json', combos), `(${pairCount} pairs)`);
console.log('meta.json        ', write('meta.json', meta), `(${meta.unbreedable.length} unbreedable)`);
console.log('sampleRoster.json', write('sampleRoster.json', sampleRoster), `(${sampleRoster.length} Pals)`);

const maxWork = Object.values(pals).reduce(
  (m, p) => p.work.reduce((n, w) => Math.max(n, w.level), m),
  0,
);
console.log(`\nmax work level: ${maxWork}`);
console.log(`breedable     : ${ids.size - meta.unbreedable.length} of ${ids.size}`);
