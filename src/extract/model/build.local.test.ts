/**
 * Local check of the browser model builder against the desktop's (Phase 6, step 6).
 * Needs files that never reach git: the desktop staging folder
 * (scripts/pal-textures/out) and the lite models built from it
 * (public/pal-models-lite). Without them every test here is skipped.
 *
 * It rebuilds pals from the staged files through the same code the browser runs
 * (textures are re-encoded with sharp instead of a canvas) and compares the result
 * with the desktop's model: bone transforms, animation values, material wiring and
 * the manifest line. Textures are only compared by size, since two encoders never
 * agree to the byte.
 */
import fs from 'node:fs';
import path from 'node:path';

import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, type Transform } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import roleFile from '../../../scripts/anim-roles.json';
import type { PalExport, PalTexture } from '../types.ts';
import { buildModel, type ModelEntry } from './build.ts';
import type { EncodeImage } from './materials.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const STAGED = path.join(ROOT, 'scripts', 'pal-textures', 'out');
const LITE = path.join(ROOT, 'public', 'pal-models-lite');
const have = fs.existsSync(STAGED) && fs.existsSync(path.join(LITE, 'index.json'));

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const encode: EncodeImage = (rgba, width, height, edge) =>
  sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width, height, channels: 4 } })
    .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer()
    .then((b) => ({ data: new Uint8Array(b), mime: 'image/webp' }));

/** What the extractor would hand over for `name`, rebuilt from the desktop's staged export. */
async function staged(name: string, animFiles: Map<string, string>): Promise<PalExport> {
  const files = walk(path.join(STAGED, name));
  const glb = files.find((f) => /[\\/]SK_[^\\/]+\.glb$/.test(f))!;
  const materials: Record<string, string> = {};
  for (const f of files.filter((f) => f.endsWith('.json'))) materials[path.basename(f, '.json')] = fs.readFileSync(f, 'utf8');
  const textures: PalTexture[] = [];
  for (const f of files.filter((f) => f.endsWith('.png'))) {
    const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    textures.push({ name: path.basename(f, '.png'), width: info.width, height: info.height, format: 'PF_R8G8B8A8', data: new Uint8Array(data) });
  }
  const animations = roleFile.roles.flatMap((r) => {
    for (const anim of r.candidates) {
      for (let stem: string | null = name; stem; stem = stem.includes('_') ? stem.slice(0, stem.lastIndexOf('_')) : null) {
        const hit = animFiles.get(`as_${stem}_${anim}.psa`.toLowerCase());
        if (hit) return [{ role: r.role, from: path.basename(hit, '.psa'), psa: new Uint8Array(fs.readFileSync(hit)) }];
      }
    }
    return [];
  });
  return {
    name,
    mesh: path.basename(glb, '.glb'),
    glb: new Uint8Array(fs.readFileSync(glb)),
    materials,
    textures,
    animations,
    errors: [],
    ms: { mesh: 0, textures: 0, animations: 0, total: 0 },
    reads: 0,
    bytes: 0,
    heapMB: null,
  };
}

async function read(bytes: Uint8Array): Promise<Document> {
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(bytes);
}

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  if (a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

/** Everything about a model except texture pixels, as plain numbers for comparing. */
function describeDoc(doc: Document) {
  const root = doc.getRoot();
  return {
    nodes: new Map(root.listNodes().map((n) => [n.getName(), { t: n.getTranslation(), r: n.getRotation(), s: n.getScale() }])),
    anims: new Map(
      root.listAnimations().map((a) => [
        a.getName(),
        a.listChannels().map((c) => ({
          node: c.getTargetNode()?.getName() ?? '',
          path: c.getTargetPath() ?? '',
          times: c.getSampler()!.getInput()!.getArray()!,
          values: c.getSampler()!.getOutput()!.getArray()!,
        })),
      ]),
    ),
    materials: root.listMaterials().map((m) => ({
      name: m.getName(),
      alpha: m.getAlphaMode(),
      cutoff: m.getAlphaCutoff(),
      double: m.getDoubleSided(),
      factor: m.getBaseColorFactor(),
      metal: m.getMetallicFactor(),
      rough: m.getRoughnessFactor(),
      maps: [m.getBaseColorTexture(), m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture(), m.getEmissiveTexture()].map(
        (t) => t?.getSize()?.join('x') ?? null,
      ),
      offset: m.getBaseColorTextureInfo()?.getExtension<Transform>('KHR_texture_transform')?.getOffset() ?? null,
    })),
    positions: root.listMeshes().flatMap((m) => m.listPrimitives().map((p) => p.getAttribute('POSITION')!.getArray()!)),
  };
}

/** Rigs the script's comments single out (neckless, metres-keyed, lone jaw override...), then an even sample; ALL=1 does every model. */
const TRICKY = ['Alpaca', 'SheepBall', 'Skutlass', 'Necromus', 'Anubis', 'Kelpsea', 'Hoocrates', 'Elphidran', 'Sweepa', 'Horus', 'Croajiro', 'Hangyu', 'Kitsunebi_Ice'];

describe.skipIf(!have)('browser model builder vs the desktop lite models', () => {
  const manifest = have ? (JSON.parse(fs.readFileSync(path.join(LITE, 'index.json'), 'utf8')) as Record<string, ModelEntry>) : {};
  const animDir = path.join(STAGED, 'anims');
  const animFiles = have && fs.existsSync(animDir) ? new Map(walk(animDir).map((f) => [path.basename(f).toLowerCase(), f])) : new Map<string, string>();

  const own = Object.keys(manifest).filter((n) => !manifest[n].file);
  const pals = process.env.BROWSER ? own.filter((n) => fs.existsSync(path.join(process.env.BROWSER!, `${n}.chibi.glb`))) : process.env.ALL ? own : [...new Set([...TRICKY.filter((n) => own.includes(n)), ...own.filter((_, i) => i % 25 === 0)])];
  for (const name of pals) {
    const lite = path.join(LITE, `${name}.chibi.glb`);
    it.skipIf(!have || !fs.existsSync(path.join(STAGED, name)) || !fs.existsSync(lite))(name, { timeout: 120_000 }, async () => {
      // BROWSER=<dir>: compare the models the bench built in a real browser (<dir>/<Name>.chibi.glb) instead.
      const fromBrowser = process.env.BROWSER ? path.join(process.env.BROWSER, `${name}.chibi.glb`) : null;
      const mine = fromBrowser
        ? { glb: new Uint8Array(fs.readFileSync(fromBrowser)), entry: JSON.parse(fs.readFileSync(path.join(process.env.BROWSER!, 'index.json'), 'utf8'))[name] as ModelEntry }
        : await buildModel(await staged(name, animFiles), { encode, edge: 512, now: 0 });
      const a = describeDoc(await read(mine.glb));
      const b = describeDoc(await read(new Uint8Array(fs.readFileSync(lite))));

      // Manifest line (v is a timestamp).
      const { v: _v, ...want } = manifest[name];
      const { v: _w, ...got } = mine.entry;
      expect(got).toEqual(want);

      // Bones: the chibi reshaping.
      expect([...a.nodes.keys()].sort()).toEqual([...b.nodes.keys()].sort());
      for (const [n, x] of a.nodes) {
        const y = b.nodes.get(n)!;
        expect(maxDiff(x.t, y.t), `${n} translation`).toBeLessThan(1e-5);
        expect(maxDiff(x.r, y.r), `${n} rotation`).toBeLessThan(1e-5);
        expect(maxDiff(x.s, y.s), `${n} scale`).toBeLessThan(1e-5);
      }

      // Clips and their values.
      expect([...a.anims.keys()]).toEqual([...b.anims.keys()]);
      for (const [clip, chans] of a.anims) {
        const other = b.anims.get(clip)!;
        expect(chans.length, `${clip} channels`).toBe(other.length);
        chans.forEach((c, i) => {
          expect(`${c.node}.${c.path}`).toBe(`${other[i].node}.${other[i].path}`);
          expect(maxDiff(c.times, other[i].times), `${clip} ${c.node}.${c.path} times`).toBeLessThan(1e-4);
          expect(maxDiff(c.values, other[i].values), `${clip} ${c.node}.${c.path}`).toBeLessThan(1e-3);
        });
      }

      // Materials and geometry.
      expect(a.materials).toEqual(b.materials);
      expect(a.positions.length).toBe(b.positions.length);
      a.positions.forEach((p, i) => expect(maxDiff(p, b.positions[i])).toBeLessThan(1e-6));
    });
  }
});
