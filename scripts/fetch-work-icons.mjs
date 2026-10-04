/**
 * Download the game's small UI icons that the app shows:
 *
 *   public/work-icons/     the twelve work-suitability icons, named by the codes
 *                          pals.json uses (Kdl.webp, Min.webp, …)
 *   public/element-icons/  the nine element icons, named by element (fire.webp, …)
 *
 *   node scripts/fetch-work-icons.mjs
 *
 * paldb.cc mirrors them from the game files. The work icons are T_icon_palwork_NN,
 * and the numbering is not the suitability row order — 09 is unused, and Cooling,
 * Transporting and Farming are 10, 11 and 12 — so the mapping is spelled out,
 * checked against the tooltip paldb puts on each icon. The element icons are
 * T_Icon_element_s_NN in the game's element order, checked by eye against each icon.
 *
 * Both folders are game art: gitignored, and left out of the public build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://cdn.paldb.cc/image/Pal/Texture/UI/InGame/';

const SETS = [
  {
    out: path.join(ROOT, 'public', 'work-icons'),
    prefix: 'T_icon_palwork_',
    icons: {
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
    },
  },
  {
    out: path.join(ROOT, 'public', 'element-icons'),
    prefix: 'T_Icon_element_s_',
    icons: {
      neutral: '00',
      fire: '01',
      water: '02',
      electric: '03',
      grass: '04',
      dark: '05',
      dragon: '06',
      ground: '07',
      ice: '08',
    },
  },
];

for (const { out, prefix, icons } of SETS) {
  fs.mkdirSync(out, { recursive: true });
  for (const [code, n] of Object.entries(icons)) {
    const res = await fetch(`${CDN}${prefix}${n}.webp`, { headers: { 'User-Agent': 'Mozilla/5.0 (palworld-breeding-index)' } });
    if (!res.ok) {
      console.error(`${prefix}${n} (${code}): HTTP ${res.status}`);
      process.exit(1);
    }
    fs.writeFileSync(path.join(out, `${code}.webp`), Buffer.from(await res.arrayBuffer()));
  }
  console.log(`wrote ${Object.keys(icons).length} icons -> ${path.relative(ROOT, out)}`);
}
