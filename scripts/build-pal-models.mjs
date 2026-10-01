/**
 * Turn the raw meshes staged by scripts/pal-textures (`dotnet run -- --mesh <Name>`)
 * into self-contained, web-sized .glb files the pal page can show in 3D.
 *
 * CUE4Parse exports the geometry and skeleton but leaves every material empty; the
 * texture wiring lives in the MI_*.json files beside the mesh. This script reads
 * those and embeds the maps, converting Unreal's conventions to glTF's on the way:
 *
 *   _B   base colour, alpha kept for the masked eye material
 *   _N   normal map — Unreal is green-down (DirectX), glTF is green-up, so G flips
 *   _M   R metallic, G roughness, B ambient occlusion. glTF packs that as
 *        R occlusion, G roughness, B metallic, so R and B swap
 *   _EM  emissive colour, used as-is
 *
 * Channel meanings were read off Blazamut's maps, not assumed: R is non-zero only
 * on the claws and plates, B is dark only in crevices.
 *
 * Each pal is written twice: <Name>.glb at game proportions, and <Name>.chibi.glb
 * with a big head, happy eyes and a slight grin. When the pal's animations have
 * been staged (`dotnet run -- --anim AS_<Name>_Idle` etc.), the normal model loops
 * ANIMS.normal and the chibi loops ANIMS.chibi; without them both stand in the
 * bind pose.
 *
 * Output is gitignored (public/pal-models/). These are Pocketpair's assets extracted
 * from a copy of the game you own — personal use only, never commit them.
 *
 *   node scripts/build-pal-models.mjs                 every staged mesh
 *   node scripts/build-pal-models.mjs KingBahamut     just one
 *   node scripts/build-pal-models.mjs --size 2048     texture edge (default 1024)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP, KHRTextureTransform } from '@gltf-transform/extensions';
import sharp from 'sharp';

import { bindMismatch, readPsa, toGltf } from './lib/psa.mjs';
import { buildSpeciesIndex } from '../src/save/species.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGED = path.join(ROOT, 'scripts', 'pal-textures', 'out');
const DEST = path.join(ROOT, 'public', 'pal-models');

const args = process.argv.slice(2);
const sizeAt = args.indexOf('--size');
const SIZE = sizeAt >= 0 ? Number(args.splice(sizeAt, 2)[1]) : 1024;
const only = args[0] ?? null;

/** Every file under dir, recursively. */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** "Pal/Content/.../T_X_Body_B.T_X_Body_B" -> "T_X_Body_B" */
const textureName = (ref) => ref.slice(ref.lastIndexOf('/') + 1).split('.')[0];

/**
 * Lower-cased basename -> path, for every file in a pal's export folder.
 * Variants keep the base species' eye/mouth materials in a sibling folder
 * (out/BerryGoat_Dark/…/Monster/BerryGoat/), and the game is loose about case
 * (MI_DarKCrow_Body, Ml_Ganesha_Body with a lower-case L), so materials and
 * textures are looked up across the whole export, ignoring case — not just in
 * the folder beside the mesh.
 */
function fileIndex(dir) {
  const index = new Map();
  for (const f of walk(dir)) {
    const key = path.basename(f).toLowerCase();
    if (!index.has(key)) index.set(key, f);
  }
  return index;
}

/** Unreal colour {R,G,B} (linear, can exceed 1) -> glTF factor in 0-1. */
function colorFactor(c) {
  const m = Math.max(c.R, c.G, c.B, 1);
  return [c.R / m, c.G / m, c.B / m].map((v) => Math.min(1, Math.max(0, v)));
}

async function webp(pipeline) {
  return pipeline.resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
}

/** Rewrite each RGB pixel in place with fn(data, index), then encode. */
async function remap(file, fn) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 3) fn(data, i);
  return webp(sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }));
}

async function build(glbPath) {
  // Named after the export folder (out/<Name>/…), not the .glb: the game's
  // SK_GrassMinotaur_Ice package holds a mesh called SK_GrassMinotaur_Ice_Eye.
  const name = path.relative(STAGED, glbPath).split(path.sep)[0];
  // Materials and textures normally sit beside the .glb. That same misnamed
  // mesh lands one folder deeper than its materials, so walk up to the first
  // folder that has any MI_*.json, stopping at the pal's export folder.
  const top = path.join(STAGED, name);
  const files = fileIndex(top);
  const lookup = (base) => files.get(base.toLowerCase()) ?? null;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(glbPath);
  doc.createExtension(EXTTextureWebP).setRequired(true);

  // Unreal stores masks in vertex colour; glTF multiplies it into the base colour,
  // which paints the whole pal near-black. Every material samples UV 0, so the
  // other seven UV sets are dead weight too.
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) {
        if (semantic.startsWith('COLOR_') || (semantic.startsWith('TEXCOORD_') && semantic !== 'TEXCOORD_0')) {
          const attr = prim.getAttribute(semantic);
          prim.setAttribute(semantic, null);
          if (attr && attr.listParents().length <= 1) attr.dispose();
        }
      }
    }
  }

  const tex = async (file, buffer) =>
    doc.createTexture(path.basename(file, '.png')).setImage(buffer).setMimeType('image/webp');

  for (const mat of doc.getRoot().listMaterials()) {
    const miFile = lookup(`${mat.getName()}.json`);
    if (!miFile) {
      console.warn(`  ${name}: no ${mat.getName()}.json, leaving ${mat.getName()} untextured`);
      continue;
    }
    const mi = JSON.parse(fs.readFileSync(miFile, 'utf8'));
    const textures = mi.Textures ?? {};
    const refs = new Set(Object.values(textures).map(textureName));
    const find = (suffix) =>
      [...refs].map((t) => lookup(`${t}.png`)).find((f) => f && f.toLowerCase().endsWith(suffix.toLowerCase())) ?? null;

    // The material names its colour map outright ("Base Texture"); the _B
    // suffix is only a convention (DarkCrow's is _PV, LotusDragon's has none).
    const named = textures['Base Texture'] ?? textures['BaseColor'] ?? textures['Diffuse'];
    const base = (named && lookup(`${textureName(named)}.png`)) || find('_B.png');

    // Effect shaders (flames, glows, sparkles) are translucent or additive with
    // no colour map: their look comes from a node graph glTF cannot express.
    // Left alone they render as solid white shapes. Draw them as a see-through
    // glow in the effect's own first colour instead.
    const blend = mi.Parameters?.Properties?.BasePropertyOverrides?.BlendMode ?? '';
    if (!base && /Translucent|Additive/.test(blend)) {
      const first = Object.values(mi.Parameters?.Colors ?? {})[0];
      const rgb = first ? colorFactor(first) : [1, 1, 1];
      mat.setBaseColorFactor([...rgb, 0.45]).setEmissiveFactor(rgb).setAlphaMode('BLEND').setDoubleSided(true);
      mat.setMetallicFactor(0).setRoughnessFactor(1);
      continue;
    }

    if (base) {
      const masked = mi.Parameters?.Properties?.BasePropertyOverrides?.BlendMode === 'EBlendMode::BLEND_Masked';
      // The body is marked masked too but its alpha is solid; only honour it when
      // the map actually has cut-outs, so the body never loses pixels to a cutoff.
      const hasCutouts = (await sharp(base).stats()).channels[3]?.min < 255;
      mat.setBaseColorTexture(await tex(base, await webp(sharp(base))));
      if (masked && hasCutouts) {
        mat.setAlphaMode('MASK').setAlphaCutoff(mi.Parameters.Properties.BasePropertyOverrides.OpacityMaskClipValue ?? 0.5);
      }
    }

    const normal = find('_N.png');
    if (normal) {
      const buf = await remap(normal, (d, i) => {
        d[i + 1] = 255 - d[i + 1];
      });
      mat.setNormalTexture(await tex(normal, buf));
    }

    const masks = find('_M.png');
    if (masks) {
      // Not every pal fills every channel: Anubis leaves B (occlusion) at zero
      // throughout, and zero occlusion means "fully shadowed" — the whole pal
      // renders black. An empty channel is treated as absent, not as data.
      const [, , ao] = (await sharp(masks).stats()).channels;
      const hasAo = ao.max > 16;
      const buf = await remap(masks, (d, i) => {
        const r = d[i];
        d[i] = hasAo ? d[i + 2] : 255;
        d[i + 2] = r;
      });
      const orm = await tex(masks, buf);
      mat.setMetallicRoughnessTexture(orm).setMetallicFactor(1).setRoughnessFactor(1);
      if (hasAo) mat.setOcclusionTexture(orm);
    } else {
      mat.setMetallicFactor(0).setRoughnessFactor(0.8);
    }

    const emissive = find('_EM.png');
    if (emissive) {
      mat.setEmissiveTexture(await tex(emissive, await webp(sharp(emissive).removeAlpha()))).setEmissiveFactor([1, 1, 1]);
    }
  }

  fs.mkdirSync(DEST, { recursive: true });
  const out = path.join(DEST, `${name}.glb`);
  const normalAnim = attachLoop(doc, name, ANIMS.normal);
  await io.write(out, doc);
  disposeAnimation(normalAnim);

  const { missing, legScale, jaw, shift, head } = chibify(doc, name);
  const chibiOpts = { legScale, shift, after: jaw ? { [jaw]: axisAngle([0, 0, 1], CHIBI.jawDegrees) } : {} };
  // First animation = what the live viewer autoplays (the sitting rest).
  const chibiAnim = attachLoop(doc, name, ANIMS.chibi, chibiOpts);
  // Second, for stills only: the standing Idle. The rest loops turn and tuck
  // the body, so a frame of one rarely shows the face; Idle stands facing
  // forward. render-portraits selects it by name.
  if (chibiAnim?.getName() !== 'Idle') attachLoop(doc, name, ['Idle'], chibiOpts);
  const chibiOut = path.join(DEST, `${name}.chibi.glb`);
  await io.write(chibiOut, doc);

  recordInManifest(name, {
    v: Date.now(),
    chibi: true,
    anim: normalAnim?.getName() ?? null,
    chibiAnim: chibiAnim?.getName() ?? null,
    // Head size relative to the body, shown in the Chibi review tab and tuned
    // per pal through scripts/chibi-overrides.json.
    head: Math.round(head * 100) / 100,
  });

  const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(2);
  const anims = [normalAnim, chibiAnim].map((a) => a?.getName() ?? 'bind pose').join(' / ');
  const note = missing.length ? `  (skipped, not on this pal: ${missing.join(', ')})` : '';
  console.log(`  ${name}.glb  ${mb(out)} MB · chibi ${mb(chibiOut)} MB · ${anims}${note}`);
}

/**
 * public/pal-models/index.json: which pals have models, and a version stamp per
 * pal. The page loads `<Name>.glb?v=<stamp>`, because model-viewer caches parsed
 * models in memory by URL — without the stamp, a model rebuilt while the page is
 * open keeps rendering the old one until a full reload. Merged, not replaced, so
 * a one-pal rebuild leaves the other entries alone.
 */
function recordInManifest(name, entry) {
  const file = path.join(DEST, 'index.json');
  const manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  manifest[name] = entry;
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
}

/* ---------- animation ----------------------------------------------------
   Which staged sequence each model loops, in order of preference. The chibi
   prefers a sitting rest: its idle and first rest pose both tip the head
   forward, and on a 2.2x head that hides the face. */
const ANIMS = {
  normal: ['Idle'],
  chibi: ['Rest02', 'Rest01', 'Idle'],
};

let animFiles = null;

/**
 * The first staged AS_<stem>_<anim>.psa from the preference list, or null.
 * Variants (Kitsunebi_Ice) usually borrow the base species' animations, so each
 * anim is tried under the full name, then with trailing _Suffixes stripped —
 * the same fallback the --batch export used to decide what to stage.
 */
function findAnim(name, prefs) {
  const dir = path.join(STAGED, 'anims');
  if (!fs.existsSync(dir)) return null;
  animFiles ??= new Map(walk(dir).map((f) => [path.basename(f).toLowerCase(), f]));
  for (const anim of prefs) {
    for (let stem = name; stem; stem = stem.includes('_') ? stem.slice(0, stem.lastIndexOf('_')) : null) {
      const hit = animFiles.get(`as_${stem}_${anim}.psa`.toLowerCase());
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Add a looping glTF animation built from a staged .psa: one rotation track per
 * bone, plus translation tracks for the hip and for any bone the animation
 * actually places somewhere else.
 *
 * Most bone translations only restate bone lengths, and the mesh's own are kept
 * — they can differ by a few cm from the animation skeleton's (Lamball), and
 * the mesh's are the ones that fit its geometry. But some bones are *put* by the
 * animation: Necromus's lances are stored 1.79 m away at its feet and the
 * animation moves them into its hands. Ignoring that left both lances lying on
 * the floor. So a bone gets a translation track when its animated position is
 * more than PLACED from the mesh's, or it moves more than MOVES during the loop.
 *
 * `legScale` shrinks the hip height the same way chibify() does; `after`
 * post-multiplies extra rotations onto named bones (the chibi's jaw grin), and
 * `shift` adds translation offsets (the chibi's head lift) — both of which the
 * animation would otherwise overwrite every frame.
 */
const PLACED = 0.05;
const MOVES = 0.01;

function attachLoop(doc, name, prefs, { legScale = 1, after = {}, shift = {} } = {}) {
  const file = findAnim(name, prefs);
  if (!file) return null;

  const psa = readPsa(fs.readFileSync(file));
  const joints = new Map(doc.getRoot().listSkins().flatMap((s) => s.listJoints()).map((j) => [j.getName(), j]));
  const bind = new Map([...joints].map(([n, j]) => [n, { rotation: j.getRotation() }]));
  // A few bones disagreeing is normal (see bindMismatch); most of them means the
  // axis mapping does not hold for this rig.
  const mismatch = bindMismatch(psa.bones, bind);
  if (mismatch > 0.75) {
    console.warn(`  ${name}: ${path.basename(file)} — ${Math.round(mismatch * 100)}% of bones disagree with the mesh, expect a broken pose`);
  }

  const buffer = doc.getRoot().listBuffers()[0];
  const frames = psa.seq.frames;
  const times = Float32Array.from({ length: frames }, (_, f) => f / psa.seq.rate);
  const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);

  // "AS_Kitsunebi_Idle" -> "Idle", whether or not the file is a borrowed base one.
  const anim = doc.createAnimation(path.basename(file, '.psa').split('_').pop());
  const track = (node, pathName, values, type) => {
    const output = doc.createAccessor().setType(type).setArray(values).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(sampler));
  };

  // The hip, found the same way chibify() finds it: walk up from `head` to the
  // bone just below the root. (Not by name — Pengullet's is "pevis".)
  let hip = psa.bones.findIndex((b) => b.name.toLowerCase() === 'head');
  while (hip >= 0 && psa.bones[hip].parent >= 0 && psa.bones[psa.bones[hip].parent].parent >= 0) {
    hip = psa.bones[hip].parent;
  }

  psa.bones.forEach((bone, b) => {
    const node = joints.get(bone.name);
    // The root carries root motion (walking off across the floor); skip it.
    if (!node || bone.parent < 0) return;

    const rot = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) {
      let q = toGltf.quat(psa.keys[f][b].rotation);
      if (after[bone.name]) q = mulQuat(q, after[bone.name]);
      rot.set(q, f * 4);
    }
    track(node, 'rotation', rot, 'VEC4');

    const keys = psa.keys.map((frame) => toGltf.vec(frame[b].translation));
    const off = shift[bone.name] ?? [0, 0, 0];
    const own = node.getTranslation().map((v, k) => v - off[k]);
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const placed = keys.some((k) => dist(k, own) > PLACED);
    const moves = keys.some((k) => dist(k, keys[0]) > MOVES);

    if (b === hip || placed || moves) {
      // The viewer frames the raw mesh and ignores the skeleton's pose, so a
      // hip the loop carries off somewhere leaves the pal out of shot: 154 of
      // 603 loops move it 30 cm+ — flyers hover up to 3.5 m (Horus), Skutlass
      // 1 m, some drift sideways. Keep the motion, drop the average sideways,
      // forward and *upward* displacement. Downward stays: sitting and lying
      // poses have to sink to the floor.
      let drift = [0, 0, 0];
      if (b === hip) {
        const mean = [0, 1, 2].map((a) => keys.reduce((s, k) => s + k[a], 0) / frames);
        drift = [mean[0] - own[0], Math.max(0, mean[1] - own[1]), mean[2] - own[2]];
      }
      const pos = new Float32Array(frames * 3);
      keys.forEach(([x, y, z], f) => {
        const [dx, dy, dz] = [x - drift[0], y - drift[1], z - drift[2]];
        pos.set(b === hip ? [dx, dy * legScale, dz] : [x + off[0], y + off[1], z + off[2]], f * 3);
      });
      track(node, 'translation', pos, 'VEC3');
    }

    // Scale keys, multiplied by the bone's own scale so the chibi's resizing
    // (hip, head, limb roots) survives a loop that also scales the bone.
    const scales = psa.keys.map((frame) => toGltf.scale(frame[b].scale));
    if (scales.some((s) => s.some((v) => Math.abs(v - 1) > 0.01))) {
      const base = node.getScale();
      const sc = new Float32Array(frames * 3);
      scales.forEach((s, f) => sc.set([s[0] * base[0], s[1] * base[1], s[2] * base[2]], f * 3));
      track(node, 'scale', sc, 'VEC3');
    }
  });
  return anim;
}

function disposeAnimation(anim) {
  if (!anim) return;
  const accessors = new Set(anim.listSamplers().flatMap((s) => [s.getInput(), s.getOutput()]));
  anim.dispose();
  for (const a of accessors) if (a && a.listParents().length <= 1) a.dispose();
}

/**
 * Chibi proportions by rescaling bones, which the skinned mesh follows.
 *
 * Bone names are *not* standard across pals — legs are leg_01, thigh,
 * leg_back_01, leg_front_01 or foot_01; arms are upperarm, arm_01, shoulder or
 * wing; Anubis spells tail "tale" and Penguin spells pelvis "pevis". So the
 * skeleton is read by structure, with names only as hints:
 *
 *   hip     the child of root that leads to `head`, whatever it is called
 *   body    the hip, scaled — the whole pal shrinks together
 *   head    `head`, scaled back up so it lands at CHIBI.head overall
 *   limbs   the first bone of each chain matching LIMBS[kind], off the path to
 *           the head, set to CHIBI[kind] overall
 *
 * Every target is an *overall* scale: the product of the bone's ancestors is
 * divided out, so a leg hanging off a scaled spine is not shrunk twice.
 */
const CHIBI = {
  body: 0.8,
  head: 2.2,
  leg: 0.7,
  arm: 0.8,
  tail: 0.75,
  /** UV offset to the happy closed-eye cell of the 2x4 eye atlas: column 0,
   *  row 2 — the smooth upturned lid. Row 3 below it is squeezed shut, which
   *  reads as pain, not contentment. */
  eyeCell: [0, 0.5],
  /** Jaw drop about the bone's local Z. */
  jawDegrees: 14,
  /** Share of the head's downward growth to undo by lifting it. Full (1) is
   *  what keeps Necromus's shoulders — and so its lance-arms — visible; 0.6
   *  was tried and hid them again. The cost is a longer neck on pals whose
   *  helmet or mane hangs low. */
  headLift: 1,
  /** Target share of the pal's height taken by its head; sets each pal's head
   *  scale (see chibify). At 0.7 small heads get the full 2.2x and heads that
   *  already are most of the pal (Gumoss, Chikipi, Gloopie) do not grow. */
  headShare: 0.7,
  /** Head size relative to the body on neckless rigs (see chibify). */
  necklessHead: 1.25,
};

/**
 * Per-pal fixes from the Chibi review tab: { "<Name>": { "head": 1.6 } }, where
 * head is the head's scale relative to the body (the "head N×" the tab shows).
 * Overrides the headShare formula for that pal only. (A "pose" key in the same
 * file is read by render-portraits.mjs, not here.)
 */
const OVERRIDES_FILE = path.join(ROOT, 'scripts', 'chibi-overrides.json');
const OVERRIDES = fs.existsSync(OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) : {};

/** Name hints for the start of each limb chain. Checked against real rigs:
 *  Blazamut, Anubis, Jetragon, Chikipi, Foxparks, Pengullet, Lamball, Kelpsea,
 *  Gumoss, Surfent. */
const LIMBS = {
  leg: /^(leg|thigh|foot|calf)/i,
  arm: /^(upperarm|arm|shoulder|clavicle|wing|hand|fin)/i,
  tail: /^(tail|tale)/i,
};
const JAW = /^(jaw|jaw_01|mouth)$/i;

function chibify(doc, name) {
  const joints = doc.getRoot().listSkins().flatMap((s) => s.listJoints());
  const byName = new Map(joints.map((j) => [j.getName().toLowerCase(), j]));
  const parent = new Map();
  for (const j of joints) for (const c of j.listChildren()) parent.set(c, j);
  const missing = [];

  const head = byName.get('head');
  const headPath = new Set();
  for (let n = head; n; n = parent.get(n)) headPath.add(n);
  // The hip: the topmost bone below root on the way to the head.
  let hip = head;
  while (hip && parent.get(hip) && parent.get(parent.get(hip))) hip = parent.get(hip);

  const accumulated = (node) => {
    let k = 1;
    for (let n = parent.get(node); n; n = parent.get(n)) k *= n.getScale()[0];
    return k;
  };
  const setOverall = (node, target) => {
    const k = target / accumulated(node);
    node.setScale([k, k, k]);
  };

  if (!head || !hip) {
    missing.push('head');
    return { missing, legScale: 1, jaw: null, shift: {}, head: 1 };
  }
  // Measured before any bone is rescaled: it compares the head bone's world
  // position with raw vertex positions, which only agree in the bind pose.
  const { below, share } = measureHead(doc, head);
  setOverall(hip, CHIBI.body);

  // Neckless rigs (Skutlass, Icenarwhal, Mimicat…: the head hangs straight off
  // the hip) have no neck to absorb a scale change — the head IS the front of
  // the body, blended straight into the tail. A 2.2x head beside a 0.75x tail
  // tore Skutlass in half. They get a gentler chibi: a modest head, and limbs
  // and tail left at body scale so no seam is stretched.
  const neckless = parent.get(hip) && hip === parent.get(head);
  const target = (kind) => (neckless ? CHIBI.body : CHIBI[kind]);
  // How much to grow the head depends on how much of the pal it already is. A
  // flat 2.2x suits Blazamut (head = 35% of its height) but ballooned Gloopie
  // Primo, whose hood and hair are its whole silhouette. So solve for the scale
  // r that brings the head to CHIBI.headShare of the height: if it is h now,
  // r = T(1-h) / (h(1-T)), clamped between "no growth" and the full CHIBI.head.
  const T = CHIBI.headShare;
  const fit = share > 0 ? (T * (1 - share)) / (share * (1 - T)) : Infinity;
  const r = Math.min(Math.max(fit, 1), CHIBI.head / CHIBI.body);
  // A reviewed per-pal value (from the Chibi review tab) beats the formula.
  const override = OVERRIDES[name]?.head;
  const headRatio = override ?? (neckless ? Math.min(r, CHIBI.necklessHead) : r);
  const headTarget = CHIBI.body * headRatio;

  // Limb roots: matches whose parent is not itself the same kind of limb.
  const found = { leg: 0, arm: 0, tail: 0 };
  for (const kind of /** @type {const} */ (['leg', 'arm', 'tail'])) {
    for (const j of joints) {
      if (headPath.has(j) || !LIMBS[kind].test(j.getName())) continue;
      const p = parent.get(j);
      if (p && LIMBS[kind].test(p.getName())) continue;
      setOverall(j, target(kind));
      found[kind]++;
    }
    if (!found[kind]) missing.push(kind === 'leg' ? 'legs' : kind === 'arm' ? 'arms' : 'tail');
  }

  // Head last, so it divides out whatever the spine above it ended up with.
  // Measured before scaling: how far the head's own geometry hangs below it.
  setOverall(head, headTarget);

  // Grow the head upward, not down over the shoulders. Scaled about its pivot,
  // a head's lower half swallows whatever sits under it — Necromus's shoulders
  // and arms vanished, leaving its lances floating. Lift it by exactly the
  // extra drop the scale-up adds, so the neck join stays where the body put it.
  let shift = {};
  if (below > 0) {
    // Capped at the head bone's own length: on a horizontal pal (Skutlass) the
    // "head" owns the whole front of the body down to the belly, and an
    // uncapped lift of 47 cm tore it clean off. Upright pals never reach the cap.
    const neck = Math.hypot(...head.getTranslation()) * CHIBI.body;
    const lift = Math.min((headTarget - CHIBI.body) * below * CHIBI.headLift, neck);
    const p = parent.get(head);
    const local = p ? worldToLocalDir(p.getWorldMatrix(), [0, lift, 0]) : [0, lift, 0];
    const [x, y, z] = head.getTranslation();
    head.setTranslation([x + local[0], y + local[1], z + local[2]]);
    shift = { [head.getName()]: local };
  }

  // Shorter legs would leave the feet hanging; drop the hips by the same ratio.
  // Legless pals (fish, blobs, floaters) keep their height.
  const legScale = found.leg ? target('leg') : 1;
  const [x, y, z] = hip.getTranslation();
  hip.setTranslation([x, y * legScale, z]);

  if (!smile(doc)) missing.push('eye atlas');

  // A slightly dropped jaw reads as an open-mouthed grin; most pals have no
  // mouth texture or morph targets, so the jaw bone is the only mouth control.
  const jaw = joints.find((j) => JAW.test(j.getName())) ?? null;
  if (jaw) jaw.setRotation(mulQuat(jaw.getRotation(), axisAngle([0, 0, 1], CHIBI.jawDegrees)));
  else missing.push('jaw');

  return { missing, legScale, jaw: jaw?.getName() ?? null, shift, head: headRatio };
}

/**
 * Measures the geometry belonging to the head — vertices whose heaviest skin
 * weight is the head or a descendant (jaw, ears, hair, hood) — in the bind pose:
 *
 *   below  how far it hangs under the head bone (world units)
 *   share  its height as a fraction of the whole pal's height
 *
 * glTF is Y-up and these meshes sit at the origin unrotated, so world Y is up.
 */
function measureHead(doc, head) {
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints();
  const inHead = new Set();
  const stack = [head];
  while (stack.length) {
    const n = stack.pop();
    inHead.add(joints.indexOf(n));
    stack.push(...n.listChildren());
  }
  const pivotY = head.getWorldMatrix()[13];

  let lowest = pivotY;
  let headTop = -Infinity;
  let floor = Infinity;
  let top = -Infinity;
  const pos = [];
  const jw = [];
  const ww = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION');
      const J = prim.getAttribute('JOINTS_0');
      const W = prim.getAttribute('WEIGHTS_0');
      if (!P || !J || !W) continue;
      for (let i = 0; i < P.getCount(); i++) {
        W.getElement(i, ww);
        J.getElement(i, jw);
        let best = 0;
        for (let k = 1; k < 4; k++) if (ww[k] > ww[best]) best = k;
        P.getElement(i, pos);
        floor = Math.min(floor, pos[1]);
        top = Math.max(top, pos[1]);
        if (!inHead.has(jw[best])) continue;
        lowest = Math.min(lowest, pos[1]);
        headTop = Math.max(headTop, pos[1]);
      }
    }
  }
  const height = top - floor;
  return { below: pivotY - lowest, share: height > 0 ? (headTop - lowest) / height : 0 };
}

/** A world-space direction expressed in the local frame of a node with world matrix m (column-major 4x4). */
function worldToLocalDir(m, [x, y, z]) {
  const a = m[0], b = m[4], c = m[8];
  const d = m[1], e = m[5], f = m[9];
  const g = m[2], h = m[6], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const inv = [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
  return [inv[0] * x + inv[1] * y + inv[2] * z, inv[3] * x + inv[4] * y + inv[5] * z, inv[6] * x + inv[7] * y + inv[8] * z];
}

/**
 * Happy eyes. Pal eye textures are a 2-wide, 4-tall expression atlas — open,
 * closed, half-lidded, squint… — and the mesh's UVs sit in the top-left cell.
 * The chibi file offsets the eye material's UVs to CHIBI.eyeCell, the contented
 * closed-eye curve. Only applied when the UVs really are
 * confined to that first cell; anything else is left looking where it looked.
 */
function smile(doc) {
  const transforms = doc.createExtension(KHRTextureTransform);
  let applied = false;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const info = mat?.getBaseColorTextureInfo();
      if (!mat || !info || !/_Eye$/i.test(mat.getName())) continue;
      const uv = prim.getAttribute('TEXCOORD_0');
      const [maxU, maxV] = uv.getMax([]);
      const [minU, minV] = uv.getMin([]);
      if (minU < 0 || minV < 0 || maxU > 0.5 || maxV > 0.25) continue;
      info.setExtension('KHR_texture_transform', transforms.createTransform().setOffset(CHIBI.eyeCell));
      applied = true;
    }
  }
  if (!applied) transforms.dispose();
  return applied;
}

function axisAngle([x, y, z], degrees) {
  const h = (degrees * Math.PI) / 360;
  const s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
}

/** Hamilton product a*b, both [x, y, z, w]. */
function mulQuat([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

if (!fs.existsSync(STAGED)) {
  console.error(`Nothing staged at ${STAGED}. Run: cd scripts/pal-textures && dotnet run -- --mesh <Name>`);
  process.exit(1);
}

// One mesh per export folder; the folder is the pal's name (see build()).
const meshes = walk(STAGED).filter(
  (f) => /[\\/]SK_[^\\/]+\.glb$/.test(f) && (!only || path.relative(STAGED, f).split(path.sep)[0] === only),
);
if (!meshes.length) {
  console.error(only ? `No staged SK_${only}.glb` : 'No staged meshes');
  process.exit(1);
}

console.log(`building ${meshes.length} model(s), textures at ${SIZE}px`);
let failed = 0;
for (const m of meshes) {
  try {
    await build(m);
  } catch (err) {
    failed++;
    console.error(`  FAILED ${path.basename(m)}: ${err.message}`);
  }
}

if (!only) {
  applyAliases();
  coverage();
}

/**
 * Blueprint-only pals (out/aliases.json, from `--batch`) get a manifest entry
 * pointing at the mesh their Blueprint really uses: { file: 'LilyQueen_Ice' }
 * under LilyQueen_Dark. The page follows `file`; nothing is copied on disk.
 */
function applyAliases() {
  const aliasFile = path.join(STAGED, 'aliases.json');
  if (!fs.existsSync(aliasFile)) return;
  const aliases = JSON.parse(fs.readFileSync(aliasFile, 'utf8'));
  const file = path.join(DEST, 'index.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  let added = 0;
  for (const [pal, target] of Object.entries(aliases)) {
    const real = manifest[target];
    const own = manifest[pal] && !manifest[pal].file; // a real model of its own wins
    if (!real || own) continue;
    manifest[pal] = { ...real, file: real.file ?? target };
    added++;
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\n${added} aliases folded into the manifest`);
}
process.exit(failed ? 1 : 0);

/**
 * Which dex species have a model, using the same codename -> dex lookup the
 * save importer uses, so "has a model" means "the Pal Box can show it". Models
 * that map to no species (collab creatures, NPC monsters) are listed too.
 */
function coverage() {
  const pals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'pals.json'), 'utf8'));
  const species = buildSpeciesIndex(pals);
  const manifest = JSON.parse(fs.readFileSync(path.join(DEST, 'index.json'), 'utf8'));

  const covered = new Set();
  const extras = [];
  // Aliases count: a pal whose Blueprint borrows another mesh still has a model.
  for (const name of Object.keys(manifest)) {
    const match = species.lookup(name);
    if (match) covered.add(match.palId);
    else extras.push(name);
  }
  const missing = Object.values(pals).filter((p) => !covered.has(p.id));

  console.log(`\ncoverage: ${covered.size} of ${Object.keys(pals).length} dex species have a model`);
  if (missing.length) console.log(`  no model: ${missing.map((p) => `${p.name} (#${p.num})`).join(', ')}`);
  if (extras.length) console.log(`  models with no dex species (${extras.length}): ${extras.join(', ')}`);
}
