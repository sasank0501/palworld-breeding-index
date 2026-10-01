/**
 * Reader for ActorX .psa animation files, as written by CUE4Parse
 * (`dotnet run -- --anim AS_<Name>_<Anim>` in scripts/pal-textures).
 *
 * The file is a list of chunks, each a 32-byte header — ChunkID[20],
 * TypeFlag, DataSize (bytes per record), DataCount — followed by the records:
 *
 *   BONENAMES  120 B/bone   Name[64], Flags, NumChildren, ParentIndex,
 *                           then the bind pose: quat xyzw, pos xyz, length, size xyz
 *   ANIMINFO   168 B/seq    Name[64], Group[64], TotalBones, RootInclude,
 *                           KeyCompressionStyle, KeyQuotum, KeyReduction,
 *                           TrackTime, AnimRate, StartBone, FirstRawFrame, NumRawFrames
 *   ANIMKEYS    32 B/key    pos xyz, quat xyzw, time — frame-major: every bone of
 *                           frame 0, then every bone of frame 1, …
 *   SCALEKEYS   16 B/key    scale xyz, time (optional)
 *
 * Values are in Unreal space (centimetres, Z up, left-handed). `toGltf` below
 * converts them to the glTF node space of the meshes CUE4Parse exports.
 */

const text = (buf, at, len) => {
  const raw = buf.subarray(at, at + len);
  const end = raw.indexOf(0);
  return raw.subarray(0, end < 0 ? len : end).toString('latin1');
};

export function readPsa(buf) {
  const chunks = new Map();
  for (let at = 0; at + 32 <= buf.length; ) {
    const id = text(buf, at, 20);
    const size = buf.readInt32LE(at + 24);
    const count = buf.readInt32LE(at + 28);
    chunks.set(id, { at: at + 32, size, count });
    at += 32 + size * count;
  }

  const need = (id) => {
    const c = chunks.get(id);
    if (!c) throw new Error(`psa has no ${id} chunk`);
    return c;
  };

  const bn = need('BONENAMES');
  const bones = [];
  for (let i = 0; i < bn.count; i++) {
    const o = bn.at + i * bn.size;
    bones.push({
      name: text(buf, o, 64),
      parent: buf.readInt32LE(o + 72),
      rotation: [0, 1, 2, 3].map((k) => buf.readFloatLE(o + 76 + k * 4)),
      translation: [0, 1, 2].map((k) => buf.readFloatLE(o + 92 + k * 4)),
    });
  }

  const ai = need('ANIMINFO');
  const seq = {
    name: text(buf, ai.at, 64),
    trackTime: buf.readFloatLE(ai.at + 64 + 64 + 20),
    rate: buf.readFloatLE(ai.at + 64 + 64 + 24),
    frames: buf.readInt32LE(ai.at + 64 + 64 + 36),
  };

  const ak = need('ANIMKEYS');
  const n = bones.length;
  // keys[frame][bone] = { translation, rotation }, normalised into the same
  // space as the BONENAMES bind pose. CUE4Parse writes the two in opposite
  // handedness — keys are mirrored in Y relative to the bind pose (spine_01
  // sits at y -11.84 in the bind pose and +11.46 in Idle's first key). Found
  // empirically on Blazamut: un-mirroring brings every bone's key translation
  // within ~5 mm of its bind length, and the rotations to small offsets.
  // SCALEKEYS has the same frame-major layout. Optional, and often all 1 — but
  // 190 of 604 pal loops really scale bones: Skutlass retracts its sword by
  // shrinking the segments to zero, and dropping that left them dangling.
  const sk = chunks.get('SCALEKEYS');
  const keys = [];
  for (let f = 0; f < seq.frames; f++) {
    const row = [];
    for (let b = 0; b < n; b++) {
      const o = ak.at + (f * n + b) * ak.size;
      const [tx, ty, tz] = [0, 1, 2].map((k) => buf.readFloatLE(o + k * 4));
      const [qx, qy, qz, qw] = [0, 1, 2, 3].map((k) => buf.readFloatLE(o + 12 + k * 4));
      const scale = sk && sk.count === ak.count
        ? [0, 1, 2].map((k) => buf.readFloatLE(sk.at + (f * n + b) * sk.size + k * 4))
        : [1, 1, 1];
      row.push({ translation: [tx, -ty, tz], rotation: [qx, -qy, qz, qw], scale });
    }
    keys.push(row);
  }

  return { bones, seq, keys };
}

/* ---------- Unreal -> glTF conversion -------------------------------------
   One fixed mapping for every pal: swap Y and Z, conjugate the rotation, and
   centimetres to metres. It is a property of the two exporters, not of the
   creature, so it is not searched per pal.

   It was first found by searching all axis permutations against Blazamut's
   bind pose (exact fit), and an early version re-ran that search per pal. That
   broke on Lamball, Kelpsea and Gumoss: their .psa skeletons hold bone
   *positions* a few centimetres off the mesh's own, no candidate fitted
   exactly, and the search settled on a wrong axis order that sank them into
   the floor. Under this fixed mapping every bind *rotation* matches the mesh
   exactly on all ten test rigs, which is what `bindError` reports. */

export const toGltf = {
  vec: ([x, y, z]) => [x * 0.01, z * 0.01, y * 0.01],
  quat: ([x, y, z, w]) => [-x, -z, -y, w],
  /** Same axis swap as positions; scale has no units and no handedness sign. */
  scale: ([x, y, z]) => [x, z, y],
};

/**
 * Share of bones (0-1) whose .psa bind rotation, converted, disagrees with the
 * glb's. `nodes` maps bone name -> { rotation } from the glb.
 *
 * Some disagreement is normal and harmless. On ~40 of 295 rigs the animation
 * skeleton's reference pose differs from the mesh's for a few bones (Alpaca's
 * head stored 90° off, Brown Rabbit's arms 180°); the game drives the mesh with
 * the animation's rotations regardless, and so does build-pal-models, and every
 * one of those rigs was checked visually and poses correctly. A *wrong mapping*
 * looks different: nearly every bone disagrees. So this reports the share, and
 * the caller only worries when it is most of the skeleton — an early average-
 * error version flagged all 40 healthy rigs and hid nothing real.
 */
export function bindMismatch(bones, nodes) {
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
