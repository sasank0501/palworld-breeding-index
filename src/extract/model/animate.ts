/**
 * Looping glTF animations from the game's .psa sequences: a port of attachLoop()
 * in scripts/build-pal-models.mjs (read its comments for why a bone gets a
 * translation track, why the hip's drift is dropped, and what the rescale is for).
 * The animation bytes arrive with the export instead of being found on disk, so
 * there is no findAnim here: the extractor already resolved each role's sequence.
 */

import type { Animation, Document, Node } from '@gltf-transform/core';

import { mulQuat } from './chibi.ts';
import { bindMismatch, readPsa, toGltf, type Quat } from './psa.ts';

const PLACED = 0.05;
const MOVES = 0.01;
/** How far a loop's bone lengths may stray from the mesh's (as a ratio) before its translations are rescaled. */
const SKELETON_TOLERANCE = 1.25;

export interface LoopOptions {
  /** Hip height scale, the same as chibify's. */
  legScale?: number;
  /** Rotations post-multiplied onto named bones (the grin). */
  after?: Record<string, Quat>;
  /** Translation offsets added to named bones (the head lift). */
  shift?: Record<string, number[]>;
}

export function attachLoop(
  doc: Document,
  name: string,
  label: string,
  psaBytes: Uint8Array,
  { legScale = 1, after = {}, shift = {} }: LoopOptions = {},
  note: (m: string) => void = () => undefined,
): Animation {
  const psa = readPsa(psaBytes);
  const joints = new Map<string, Node>(doc.getRoot().listSkins().flatMap((s) => s.listJoints()).map((j) => [j.getName(), j]));
  const bind = new Map([...joints].map(([n, j]) => [n, { rotation: j.getRotation() as number[] }]));
  const mismatch = bindMismatch(psa.bones, bind);
  if (mismatch > 0.75) {
    note(`${name}: ${label} — ${Math.round(mismatch * 100)}% of bones disagree with the mesh, expect a broken pose`);
  }

  const buffer = doc.getRoot().listBuffers()[0];
  const frames = psa.seq.frames;
  const times = new Float32Array(new ArrayBuffer(frames * 4));
  for (let f = 0; f < frames; f++) times[f] = f / psa.seq.rate;
  const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);

  const anim = doc.createAnimation(label);
  const track = (node: Node, pathName: 'rotation' | 'translation' | 'scale', values: Float32Array<ArrayBuffer>, type: 'VEC3' | 'VEC4') => {
    const output = doc.createAccessor().setType(type).setArray(values).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(sampler));
  };

  // The hip: walk up from `head` to the bone just below the root (not by name: Pengullet's is "pevis").
  let hip = psa.bones.findIndex((b) => b.name.toLowerCase() === 'head');
  while (hip >= 0 && psa.bones[hip].parent >= 0 && psa.bones[psa.bones[hip].parent].parent >= 0) {
    hip = psa.bones[hip].parent;
  }

  // Some loops are keyed for a skeleton of another size: divide out the median bone-length ratio.
  const ratios = psa.bones
    .map((bone, b) => {
      const node = joints.get(bone.name);
      const len = node && bone.parent >= 0 ? Math.hypot(...node.getTranslation()) : 0;
      return len > 0.01 ? Math.hypot(...toGltf.vec(psa.keys[0][b].translation)) / len : null;
    })
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b);
  const unit = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
  const rescale = Math.abs(Math.log(unit)) > Math.log(SKELETON_TOLERANCE) ? 1 / unit : 1;
  if (rescale !== 1) note(`${name}: ${label} keyed at ${unit.toFixed(2)}x the mesh, rescaled`);

  psa.bones.forEach((bone, b) => {
    const node = joints.get(bone.name);
    // The root carries root motion (walking off across the floor); skip it.
    if (!node || bone.parent < 0) return;

    const rot = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) {
      let q = toGltf.quat(psa.keys[f][b].rotation);
      const extra = after[bone.name];
      if (extra) q = mulQuat(q, extra);
      rot.set(q, f * 4);
    }
    track(node, 'rotation', rot, 'VEC4');

    const keys = psa.keys.map((frame) => toGltf.vec(frame[b].translation).map((v) => v * rescale));
    const off = shift[bone.name] ?? [0, 0, 0];
    const own = node.getTranslation().map((v, k) => v - off[k]);
    const dist = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const placed = keys.some((k) => dist(k, own) > PLACED);
    const moves = keys.some((k) => dist(k, keys[0]) > MOVES);

    if (b === hip || placed || moves) {
      // Keep the motion, drop the average sideways, forward and upward drift of the hip.
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

    // Scale keys, multiplied by the bone's own scale so the chibi's resizing survives.
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
