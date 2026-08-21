/**
 * One-off: mirror the Pal portraits locally so the site does not hotlink a third party.
 *
 * Deliberately gentle — small concurrency, skips files already on disk — because this
 * points at someone else's server. Safe to re-run; it only fetches what is missing.
 *
 *   node scripts/fetch-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PALS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'pals.json'), 'utf8'));
const DEST = path.join(ROOT, 'public', 'pals');

const CONCURRENCY = 5;
const RETRIES = 3;

fs.mkdirSync(DEST, { recursive: true });

const jobs = Object.values(PALS)
  .filter((p) => p.remoteImg && p.img)
  .map((p) => ({ name: p.name, url: p.remoteImg, dest: path.join(ROOT, 'public', p.img) }))
  .filter((j) => !fs.existsSync(j.dest) || fs.statSync(j.dest).size === 0);

if (!jobs.length) {
  console.log('all portraits already present, nothing to do');
  process.exit(0);
}

console.log(`fetching ${jobs.length} portraits at concurrency ${CONCURRENCY}...`);

let done = 0;
const failures = [];

async function fetchOne(job) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(job.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('empty body');
      fs.writeFileSync(job.dest, buf);
      done++;
      if (done % 40 === 0) console.log(`  ${done}/${jobs.length}`);
      return;
    } catch (err) {
      if (attempt === RETRIES) {
        failures.push(`${job.name}: ${err.message}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
}

async function run() {
  const queue = [...jobs];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      await fetchOne(queue.shift());
    }
  });
  await Promise.all(workers);

  const files = fs.readdirSync(DEST).filter((f) => f.endsWith('.webp'));
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(DEST, f)).size, 0);
  console.log(`\ndownloaded ${done}, failed ${failures.length}`);
  console.log(`on disk: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  if (failures.length) {
    console.log('\nfailures:\n' + failures.join('\n'));
    process.exit(1);
  }
}

run();
