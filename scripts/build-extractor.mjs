/**
 * Publish the in-browser extractor (extractor/, C# on .NET's browser-wasm runtime)
 * into public/extractor/, where the app's extractor worker loads it on demand.
 * It is code (the .NET runtime, CUE4Parse and friends), not game art, so both
 * builds ship it. Needs the .NET 10 SDK.
 *
 *   npm run build-extractor
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.join(ROOT, 'extractor');
const PUBLISHED = path.join(PROJECT, 'bin', 'Release', 'net10.0', 'publish', 'wwwroot', '_framework');
const OUT = path.join(ROOT, 'public', 'extractor', '_framework');
// Cloudflare Pages refuses any single file over 25 MiB.
const MAX_FILE = 25 * 1024 * 1024;

const run = spawnSync('dotnet', ['publish', '-c', 'Release', '-v', 'q', '--nologo'], { cwd: PROJECT, stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status ?? 1);

fs.rmSync(path.dirname(OUT), { recursive: true, force: true });
fs.cpSync(PUBLISHED, OUT, { recursive: true });

const files = fs.readdirSync(OUT).map((name) => ({ name, size: fs.statSync(path.join(OUT, name)).size }));
const total = files.reduce((n, f) => n + f.size, 0);
const largest = files.reduce((a, b) => (b.size > a.size ? b : a));
console.log(`public/extractor/_framework: ${files.length} files, ${(total / 1e6).toFixed(1)} MB; largest ${largest.name} ${(largest.size / 1e6).toFixed(1)} MB`);
if (largest.size > MAX_FILE) {
  console.error(`${largest.name} is over Cloudflare Pages' 25 MiB file limit.`);
  process.exit(1);
}
