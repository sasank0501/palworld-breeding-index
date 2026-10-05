/**
 * Build an art pack folder from this machine's art, to load into the public site
 * through "Add the art folder" (src/art/, docs/WEBSITE-PLAN.md Phase 4). It stands
 * in for Phase 6's in-browser extractor, which will write the same layout.
 *
 *   npm run make-art-pack              -> art-pack/ (gitignored: it is game art)
 *   npm run make-art-pack -- --full    full-size models instead of the lite set
 *
 * Layout: pal-models/ (lite chibi models + index.json), pal-portraits/ (stills +
 * index.json), pals/ (the flat 2D icons), pack.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const out = path.join(root, 'art-pack');
const full = process.argv.includes('--full');

const models = path.join(pub, full ? 'pal-models' : 'pal-models-lite');
const sources = [
  [models, 'pal-models', (f) => f.endsWith('.chibi.glb') || f === 'index.json'],
  [path.join(pub, 'pal-portraits'), 'pal-portraits', (f) => f.endsWith('.webp') || f === 'index.json'],
  [path.join(pub, 'pals'), 'pals', (f) => f.endsWith('.webp')],
];

for (const [dir, , ] of sources) {
  if (!fs.existsSync(dir)) {
    console.error(`Missing ${path.relative(root, dir)}. Run \`npm run build-portraits${full ? '' : ' -- --lite'}\` first.`);
    process.exit(1);
  }
}

fs.rmSync(out, { recursive: true, force: true });
let files = 0;
let bytes = 0;
for (const [dir, name, keep] of sources) {
  fs.mkdirSync(path.join(out, name), { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (!keep(f)) continue;
    fs.copyFileSync(path.join(dir, f), path.join(out, name, f));
    files++;
    bytes += fs.statSync(path.join(dir, f)).size;
  }
}
fs.writeFileSync(
  path.join(out, 'pack.json'),
  JSON.stringify({ format: 1, source: 'make-art-pack', models: full ? 'full' : 'lite', createdAt: new Date().toISOString() }, null, 2),
);
console.log(`art-pack/: ${files} files, ${(bytes / 1e6).toFixed(1)} MB. Load it with "Add the art folder" in the app.`);
