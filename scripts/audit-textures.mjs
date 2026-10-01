/**
 * List every built chibi model whose materials have no base-colour texture —
 * the "broken" look in the Chibi review tab (flat white or grey parts).
 *
 *   node scripts/audit-textures.mjs           # dex species only
 *   node scripts/audit-textures.mjs --all     # every model in the manifest
 *
 * Reads public/pal-models/*.chibi.glb, so run it after `npm run build-models`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { buildSpeciesIndex } from '../src/save/species.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'public', 'pal-models');
const all = process.argv.includes('--all');

const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'index.json'), 'utf8'));
const species = buildSpeciesIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'pals.json'), 'utf8')));
const files = new Set();
for (const [name, e] of Object.entries(manifest)) {
  if (e.chibi && (all || species.lookup(name))) files.add(e.file ?? name);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const bad = [];
for (const file of [...files].sort()) {
  const doc = await io.read(path.join(MODELS, `${file}.chibi.glb`));
  const missing = doc
    .getRoot()
    .listMaterials()
    // Effect shaders are drawn as a see-through glow on purpose (BLEND, no map).
    .filter((m) => !m.getBaseColorTexture() && m.getAlphaMode() !== 'BLEND')
    .map((m) => m.getName());
  if (missing.length) bad.push({ file, missing });
}

console.log(`${bad.length} of ${files.size} models have untextured materials`);
for (const { file, missing } of bad) console.log(`  ${file}: ${missing.join(', ')}`);
fs.mkdirSync(path.join(ROOT, 'scripts', '.cache'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'scripts', '.cache', 'texture-audit.json'), JSON.stringify(bad, null, 2) + '\n');
