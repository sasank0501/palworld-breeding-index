/**
 * Build public/demo-roster.json from your imported public/roster.json, for a
 * deployed copy of the app, which has no save to read. The app falls back to
 * it when roster.json is missing (roster.json stays gitignored).
 *
 *   node scripts/make-demo-roster.mjs
 *
 * Keeps every pal and stat; replaces what ties it to one save: instance and
 * container GUIDs, the world id and the export time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'roster.json');
const OUT = path.join(ROOT, 'public', 'demo-roster.json');

if (!fs.existsSync(SRC)) {
  console.error('No public/roster.json — run npm run import-save first.');
  process.exit(1);
}

const roster = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const demo = {
  ...roster,
  world: 'demo',
  exportedAt: new Date(0).toISOString(),
  demo: true,
  pals: roster.pals.map((p, i) => ({
    ...p,
    instanceId: `demo-${i}`,
    location: { ...p.location, containerId: null },
  })),
};
fs.writeFileSync(OUT, JSON.stringify(demo));
console.log(`wrote ${demo.pals.length} pals -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
