/**
 * Reader for ActorX .psa animation files, as written by CUE4Parse. A port of
 * scripts/lib/psa.mjs for the browser (Uint8Array and DataView instead of Buffer);
 * the layout notes and the Unreal -> glTF mapping live there and are not repeated.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface PsaBone {
  name: string;
  parent: number;
  rotation: Quat;
  translation: Vec3;
}

export interface PsaKey {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface Psa {
  bones: PsaBone[];
  seq: { name: string; trackTime: number; rate: number; frames: number };
  /** keys[frame][bone], in the same space as the bind pose (Y un-mirrored). */
  keys: PsaKey[][];
}

const latin1 = new TextDecoder('latin1');

export function readPsa(bytes: Uint8Array): Psa {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, len: number) => {
    const raw = bytes.subarray(at, at + len);
    const end = raw.indexOf(0);
    return latin1.decode(end < 0 ? raw : raw.subarray(0, end));
  };
  const f32 = (at: number) => view.getFloat32(at, true);

  const chunks = new Map<string, { at: number; size: number; count: number }>();
  for (let at = 0; at + 32 <= bytes.length; ) {
    const size = view.getInt32(at + 24, true);
    const count = view.getInt32(at + 28, true);
    chunks.set(text(at, 20), { at: at + 32, size, count });
    at += 32 + size * count;
  }
  const need = (id: string) => {
    const c = chunks.get(id);
    if (!c) throw new Error(`psa has no ${id} chunk`);
    return c;
  };

  const bn = need('BONENAMES');
  const bones: PsaBone[] = [];
  for (let i = 0; i < bn.count; i++) {
    const o = bn.at + i * bn.size;
    bones.push({
      name: text(o, 64),
      parent: view.getInt32(o + 72, true),
      rotation: [f32(o + 76), f32(o + 80), f32(o + 84), f32(o + 88)],
      translation: [f32(o + 92), f32(o + 96), f32(o + 100)],
    });
  }

  const ai = need('ANIMINFO');
  const seq = {
    name: text(ai.at, 64),
    trackTime: f32(ai.at + 64 + 64 + 20),
    rate: f32(ai.at + 64 + 64 + 24),
    frames: view.getInt32(ai.at + 64 + 64 + 36, true),
  };

  const ak = need('ANIMKEYS');
  const sk = chunks.get('SCALEKEYS');
  const n = bones.length;
  const keys: PsaKey[][] = [];
  for (let f = 0; f < seq.frames; f++) {
    const row: PsaKey[] = [];
    for (let b = 0; b < n; b++) {
      const o = ak.at + (f * n + b) * ak.size;
      const so = sk && sk.count === ak.count ? sk.at + (f * n + b) * sk.size : -1;
      row.push({
        // CUE4Parse writes keys mirrored in Y relative to the bind pose (psa.mjs).
        translation: [f32(o), -f32(o + 4), f32(o + 8)],
        rotation: [f32(o + 12), -f32(o + 16), f32(o + 20), f32(o + 24)],
        scale: so >= 0 ? [f32(so), f32(so + 4), f32(so + 8)] : [1, 1, 1],
      });
    }
    keys.push(row);
  }
  return { bones, seq, keys };
}

/** One fixed mapping for every pal: swap Y and Z, conjugate the rotation, centimetres to metres. */
export const toGltf = {
  vec: ([x, y, z]: Vec3): Vec3 => [x * 0.01, z * 0.01, y * 0.01],
  quat: ([x, y, z, w]: Quat): Quat => [-x, -z, -y, w],
  scale: ([x, y, z]: Vec3): Vec3 => [x, z, y],
};

/** Share of bones (0-1) whose bind rotation, converted, disagrees with the glb's; see psa.mjs. */
export function bindMismatch(bones: PsaBone[], nodes: Map<string, { rotation: number[] }>): number {
  let off = 0;
  let n = 0;
  for (const b of bones) {
    const node = nodes.get(b.name);
    if (!node || b.parent < 0) continue;
    const q = toGltf.quat(b.rotation);
    const r = node.rotation;
    if (1 - Math.abs(q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3]) > 0.01) off++;
    n++;
  }
  return n ? off / n : 0;
}
