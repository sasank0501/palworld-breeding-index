/**
 * Chibi proportions, happy eyes and a grin, by rescaling bones: a port of
 * chibify() and its helpers in scripts/build-pal-models.mjs. The reasoning behind
 * each constant (why 2.2x, why neckless rigs get less, why the head is lifted) is
 * in that script's comments, next to the evidence; this file only has to behave
 * the same. Pure glTF-Transform: no Node, no DOM.
 */

import type { Document, Node } from '@gltf-transform/core';
import { KHRTextureTransform } from '@gltf-transform/extensions';

import type { Quat } from './psa.ts';

export const CHIBI = {
  body: 0.8,
  head: 2.2,
  leg: 0.7,
  arm: 0.8,
  tail: 0.75,
  /** UV offset to the happy closed-eye cell of the 2x4 eye atlas. */
  eyeCell: [0, 0.5] as [number, number],
  /** Jaw drop about the bone's local Z. */
  jawDegrees: 14,
  headLift: 1,
  headShare: 0.7,
  necklessHead: 1.25,
};

/** One pal's entry in scripts/chibi-overrides.json (the "pose" key is the portrait renderer's). */
export interface ChibiOverride {
  head?: number;
  leg?: number;
  arm?: number;
  tail?: number;
  bones?: Record<string, number>;
  keepHeight?: boolean;
  plain?: boolean;
  doubleSided?: boolean;
  size?: number;
  jaw?: number;
}
export type ChibiOverrides = Record<string, ChibiOverride>;

type Kind = 'leg' | 'arm' | 'tail';
const LIMBS: Record<Kind, RegExp> = {
  leg: /^(leg|thigh|foot|calf)/i,
  arm: /^(upperarm|arm|shoulder|clavicle|wing|hand|fin)/i,
  tail: /^(tail|tale)/i,
};
const JAW = /^(jaw|jaw_01|mouth)$/i;

export interface ChibiResult {
  /** What this rig doesn't have (legs, tail, jaw, ...), for the build's notes. */
  missing: string[];
  legScale: number;
  jaw: string | null;
  /** Translation offsets the animation must re-add (the head lift). */
  shift: Record<string, number[]>;
  /** Head size relative to the body. */
  head: number;
}

export function chibify(doc: Document, name: string, overrides: ChibiOverrides, warn: (m: string) => void = () => undefined): ChibiResult {
  const joints = doc.getRoot().listSkins().flatMap((s) => s.listJoints());
  const byName = new Map(joints.map((j) => [j.getName().toLowerCase(), j]));
  const parent = new Map<Node, Node>();
  for (const j of joints) for (const c of j.listChildren()) parent.set(c, j);
  const missing: string[] = [];

  const head = byName.get('head');
  const headPath = new Set<Node>();
  for (let n: Node | undefined = head; n; n = parent.get(n)) headPath.add(n);
  // The hip: the topmost bone below root on the way to the head.
  let hip = head;
  while (hip && parent.get(hip) && parent.get(parent.get(hip)!)) hip = parent.get(hip);

  const accumulated = (node: Node) => {
    let k = 1;
    for (let n = parent.get(node); n; n = parent.get(n)) k *= n.getScale()[0];
    return k;
  };
  const setOverall = (node: Node, target: number) => {
    const k = target / accumulated(node);
    node.setScale([k, k, k]);
  };

  const o = overrides[name] ?? {};
  const scaleBones = () => {
    for (const [bone, k] of Object.entries(o.bones ?? {})) {
      const j = byName.get(bone.toLowerCase());
      if (!j) {
        warn(`${name}: chibi-overrides names bone "${bone}", which this rig does not have`);
        continue;
      }
      const [x, y, z] = j.getScale();
      j.setScale([x * k, y * k, z * k]);
    }
  };
  if (!head || !hip || o.plain) {
    // Headless rigs can still be reshaped bone by bone.
    if (!head || !hip) {
      missing.push('head');
      scaleBones();
    }
    // A plain pal still gets the happy face and the grin.
    if (o.plain) return { missing, legScale: 1, ...face(doc, joints, missing, o.jaw), shift: {}, head: 1 };
    return { missing, legScale: 1, jaw: null, shift: {}, head: 1 };
  }
  // Measured before any bone is rescaled: it compares the head bone's world
  // position with raw vertex positions, which only agree in the bind pose.
  const { below, share } = measureHead(doc, head);
  setOverall(hip, CHIBI.body);

  const neckless = !!parent.get(hip) && hip === parent.get(head);
  const target = (kind: Kind) => o[kind] ?? (neckless ? CHIBI.body : CHIBI[kind]);
  const T = CHIBI.headShare;
  const fit = share > 0 ? (T * (1 - share)) / (share * (1 - T)) : Infinity;
  const r = Math.min(Math.max(fit, 1), CHIBI.head / CHIBI.body);
  const headRatio = o.head ?? (neckless ? Math.min(r, CHIBI.necklessHead) : r);
  const headTarget = CHIBI.body * headRatio;

  // Limb roots: matches whose parent is not itself the same kind of limb.
  const found: Record<Kind, number> = { leg: 0, arm: 0, tail: 0 };
  for (const kind of ['leg', 'arm', 'tail'] as const) {
    for (const j of joints) {
      if (headPath.has(j) || !LIMBS[kind].test(j.getName())) continue;
      const p = parent.get(j);
      if (p && LIMBS[kind].test(p.getName())) continue;
      setOverall(j, target(kind));
      found[kind]++;
    }
    if (!found[kind]) missing.push(kind === 'leg' ? 'legs' : kind === 'arm' ? 'arms' : 'tail');
  }

  scaleBones();

  // Head last, so it divides out whatever the spine above it ended up with.
  setOverall(head, headTarget);

  // Lift the head by exactly the extra drop the scale-up adds (see the script).
  let shift: Record<string, number[]> = {};
  if (below > 0) {
    const neck = Math.hypot(...head.getTranslation()) * CHIBI.body;
    const lift = Math.min((headTarget - CHIBI.body) * below * CHIBI.headLift, neck);
    const p = parent.get(head);
    const local = p ? worldToLocalDir(p.getWorldMatrix(), [0, lift, 0]) : [0, lift, 0];
    const [x, y, z] = head.getTranslation();
    head.setTranslation([x + local[0], y + local[1], z + local[2]]);
    shift = { [head.getName()]: local };
  }

  // Shorter legs would leave the feet hanging; drop the hips by the same ratio.
  const legScale = found.leg && !o.keepHeight ? target('leg') : 1;
  const [x, y, z] = hip.getTranslation();
  hip.setTranslation([x, y * legScale, z]);

  return { missing, legScale, ...face(doc, joints, missing, o.jaw), shift, head: headRatio };
}

/** Happy eyes and a grin; returns the jaw's name for the animation's `after`. */
function face(doc: Document, joints: Node[], missing: string[], jawDegrees = CHIBI.jawDegrees): { jaw: string | null } {
  if (!smile(doc)) missing.push('eye atlas');
  const jaw = joints.find((j) => JAW.test(j.getName())) ?? null;
  if (!jaw) missing.push('jaw');
  else if (jawDegrees) jaw.setRotation(mulQuat(jaw.getRotation() as Quat, axisAngle([0, 0, 1], jawDegrees)));
  return { jaw: jaw?.getName() ?? null };
}

/**
 * Geometry belonging to the head (vertices whose heaviest skin weight is the head
 * or a descendant), in the bind pose: how far it hangs under the head bone, and
 * its height as a share of the whole pal's.
 */
function measureHead(doc: Document, head: Node): { below: number; share: number } {
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints();
  const inHead = new Set<number>();
  const stack = [head];
  while (stack.length) {
    const n = stack.pop()!;
    inHead.add(joints.indexOf(n));
    stack.push(...n.listChildren());
  }
  const pivotY = head.getWorldMatrix()[13];

  let lowest = pivotY;
  let headTop = -Infinity;
  let floor = Infinity;
  let top = -Infinity;
  const pos: number[] = [];
  const jw: number[] = [];
  const ww: number[] = [];
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
function worldToLocalDir(m: number[], [x, y, z]: number[]): number[] {
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
 * Happy eyes: offset the eye material's UVs to the contented closed-eye cell of
 * the expression atlas, only when the UVs really sit in the first cell.
 */
function smile(doc: Document): boolean {
  const transforms = doc.createExtension(KHRTextureTransform);
  let applied = false;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const info = mat?.getBaseColorTextureInfo();
      if (!mat || !info || !/_Eye$/i.test(mat.getName())) continue;
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!uv) continue;
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

export function axisAngle([x, y, z]: number[], degrees: number): Quat {
  const h = (degrees * Math.PI) / 360;
  const s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
}

/** Hamilton product a*b, both [x, y, z, w]. */
export function mulQuat([ax, ay, az, aw]: number[], [bx, by, bz, bw]: number[]): Quat {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
