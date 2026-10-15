/**
 * The picture a link to paldoc.app shows when shared (og:image in index.html): 1200 x 630, our own
 * egg (the favicon's drawing) and the site's name. No game art. Run again if the name or tagline changes:
 *
 *   node scripts/build-og-image.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbf4e2"/>
      <stop offset="1" stop-color="#e9dcb8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(110 135) scale(11)">
    <path d="M16 2C9 2 5 13 5 19a11 11 0 0 0 22 0C27 13 23 2 16 2z" fill="#f4e3b5" stroke="#614a1f" stroke-width="1.4"/>
    <path d="M8 18l4-3 4 3 4-3 4 3" fill="none" stroke="#43a047" stroke-width="2" stroke-linejoin="round"/>
  </g>
  <text x="520" y="285" font-family="${FONT}" font-size="120" font-weight="700" fill="#3b2d12">PalDoc</text>
  <text x="524" y="365" font-family="${FONT}" font-size="40" fill="#614a1f">Palworld breeding calculator</text>
  <text x="524" y="417" font-family="${FONT}" font-size="40" fill="#614a1f">and save viewer</text>
  <text x="524" y="500" font-family="${FONT}" font-size="30" fill="#2e7d32">paldoc.app</text>
</svg>`;

const out = path.join(ROOT, 'public', 'og-image.png');
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log('wrote', path.relative(ROOT, out));
