/**
 * Make a flat black silhouette of every species, for the browse page (a visit with no save).
 *
 *   npm run build-silhouettes
 *
 * Reads the chibi stills (public/pal-portraits/, from `npm run render-portraits`) and writes
 * public/silhouettes/<name>.webp, one per dex species: the still's outline in solid black, 256 px
 * square, the pal placed exactly as in its still. <name> is the species' sprite name in pals.json
 * ("sheep-ball" for Lamball), the same key the app uses everywhere. The app tints them with CSS,
 * so one file serves every skin.
 *
 * These files are shapes made from game art and ARE committed: the owner allowed them on the
 * public site (2026-10-12), the one exception beside the landing page's tour screenshots. Only
 * outlines. Never write colour, shading or detail into them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STILLS = path.join(ROOT, 'public', 'pal-portraits');
const OUT = path.join(ROOT, 'public', 'silhouettes');
const SIZE = 256;

const compact = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const pals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'pals.json'), 'utf8'));
const indexFile = path.join(STILLS, 'index.json');
if (!fs.existsSync(indexFile)) {
  console.error('No stills in public/pal-portraits. Run `npm run build-portraits` (or render-portraits) first.');
  process.exit(1);
}
const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

// The stills are keyed by codename (SheepBall), the dex by sprite name (sheep-ball): squashed to letters and
// digits they agree (src/routes/showcase/shared.tsx does the same).
const byCompact = new Map();
for (const key of Object.keys(index)) if (!byCompact.has(compact(key))) byCompact.set(compact(key), key);

fs.mkdirSync(OUT, { recursive: true });
const written = new Set();
const missing = [];
let bytes = 0;
for (const pal of Object.values(pals)) {
  if (!pal.img) {
    missing.push(`${pal.name} (no sprite name)`);
    continue;
  }
  const name = pal.img.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
  if (written.has(name)) continue;
  const key = byCompact.get(compact(name));
  const still = key && path.join(STILLS, `${index[key].file}.webp`);
  if (!still || !fs.existsSync(still)) {
    missing.push(`${pal.name} (${name})`);
    continue;
  }
  const alpha = await sharp(still).ensureAlpha().resize(SIZE, SIZE, { fit: 'fill' }).extractChannel(3).toBuffer();
  const file = path.join(OUT, `${name}.webp`);
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: '#000000' } })
    .joinChannel(alpha)
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(file);
  bytes += fs.statSync(file).size;
  written.add(name);
}

// A file for a species that is no longer in the dex is stale: remove it.
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.webp') && !written.has(f.slice(0, -5))) fs.rmSync(path.join(OUT, f));

console.log(`${written.size} silhouettes in public/silhouettes, ${(bytes / 1024).toFixed(0)} KB (${(bytes / written.size / 1024).toFixed(1)} KB each)`);
if (missing.length) console.log(`no still for ${missing.length}: ${missing.join(', ')}`);
