/**
 * Download the game's twelve work-suitability icons into public/work-icons/,
 * named by the codes pals.json uses (Kdl.webp, Min.webp, …).
 *
 *   node scripts/fetch-work-icons.mjs
 *
 * paldb.cc mirrors them from the game files as T_icon_palwork_NN. The numbering
 * is not the suitability row order — 09 is unused, and Cooling, Transporting and
 * Farming are 10, 11 and 12 — so the mapping is spelled out, checked against the
 * tooltip paldb puts on each icon.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'work-icons');
const BASE = 'https://cdn.paldb.cc/image/Pal/Texture/UI/InGame/T_icon_palwork_';

const ICONS = {
  Kdl: '00',
  Wtr: '01',
  Plt: '02',
  Elc: '03',
  Hnd: '04',
  Gth: '05',
  Lmb: '06',
  Min: '07',
  Med: '08',
  Cool: '10',
  Trn: '11',
  Frm: '12',
};

fs.mkdirSync(OUT, { recursive: true });
for (const [code, n] of Object.entries(ICONS)) {
  const res = await fetch(`${BASE}${n}.webp`, { headers: { 'User-Agent': 'Mozilla/5.0 (palworld-breeding-index)' } });
  if (!res.ok) {
    console.error(`${code} (${n}): HTTP ${res.status}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(OUT, `${code}.webp`), Buffer.from(await res.arrayBuffer()));
}
console.log(`wrote ${Object.keys(ICONS).length} icons -> ${path.relative(ROOT, OUT)}`);
