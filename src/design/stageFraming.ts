/**
 * Frame a pal on its stage from where its animation actually puts it.
 *
 * model-viewer frames a model by its bind pose, which ignores the animation: a
 * pal that sits, lies down or swings a cape ends up small, off-centre or out of
 * shot (and a chibi's oversized head makes it worse). So for the clip that is
 * playing, this samples the posed mesh across the whole clip, takes the box that
 * covers the pal in every frame, and pivots the camera on one point:
 *
 *   - the pivot is the centre of everything the clip reaches,
 *   - the distance fits the smallest sphere around that centre holding every
 *     sampled point, so the pal fills the same share of the stage whatever it is,
 *   - the camera orbits freely (any side, above, below) at that fixed distance,
 *     with zoom and pan off, so no angle can take any part of the pal out of view.
 *
 * It reaches into model-viewer's scene through the element's private `scene`
 * symbol (model-viewer 4). If that is ever missing, framing is left as it was.
 */

const FOV_DEG = 30;
/** Starting pitch: 75deg from straight down, i.e. 15deg above the horizon. */
const PITCH_DEG = 75;
/** Share of the stage's half-height the pal's bounding sphere fills. */
const FILL = 0.88;
/** Frames sampled across a clip. */
const SAMPLES = 16;
/** Vertices visited per mesh per frame; the rest are skipped evenly. */
const VERTEX_BUDGET = 4000;

// Just the parts of three.js objects this touches; model-viewer brings its own three.
interface Vec3 {
  x: number;
  y: number;
  z: number;
  applyMatrix4(m: Mat4): Vec3;
}
interface Mat4 {
  clone(): Mat4;
  copy(m: Mat4): Mat4;
  invert(): Mat4;
  premultiply(m: Mat4): Mat4;
}
interface Obj3D {
  isSkinnedMesh?: boolean;
  visible: boolean;
  position: { clone(): Vec3 };
  matrixWorld: Mat4;
  geometry?: { attributes?: { position?: { count: number } } };
  getVertexPosition?(index: number, target: Vec3): Vec3;
  traverse(fn: (o: Obj3D) => void): void;
  updateMatrixWorld(force?: boolean): void;
}
export interface Viewer extends HTMLElement {
  duration: number;
  currentTime: number;
  cameraTarget: string;
  cameraOrbit: string;
  minCameraOrbit: string;
  maxCameraOrbit: string;
  fieldOfView: string;
  getCameraOrbit(): { theta: number };
  jumpCameraToGoal(): void;
}

function sceneOf(el: Viewer): { target?: Obj3D } | null {
  const sym = Object.getOwnPropertySymbols(el).find((s) => s.description === 'scene');
  return sym ? ((el as unknown as Record<symbol, { target?: Obj3D }>)[sym] ?? null) : null;
}

/** The pivot and radius (model space) that hold the pal through the playing clip, or null. */
function clipSphere(el: Viewer): { center: number[]; radius: number } | null {
  const target = sceneOf(el)?.target;
  if (!target) return null;
  // Only the pal's own (skinned) meshes: model-viewer parents its shadow plane
  // here too, and measuring that floor quad would frame the shadow, not the pal.
  const meshes: Obj3D[] = [];
  target.traverse((o) => {
    if (o.isSkinnedMesh && o.visible && o.getVertexPosition && o.geometry?.attributes?.position) meshes.push(o);
  });
  if (!meshes.length) return null;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const v = meshes[0].position.clone();
  const toModel = meshes[0].matrixWorld.clone();
  const duration = el.duration > 0 ? el.duration : 0;
  const resume = el.currentTime;
  const frames = duration ? SAMPLES : 1;
  // Every sampled point, kept so the radius can be measured from the box centre.
  const pts: number[] = [];

  for (let f = 0; f < frames; f++) {
    // Setting the time poses the skeleton at once; nothing renders in between,
    // so the jumps are never seen.
    if (duration) el.currentTime = (duration * f) / frames;
    target.updateMatrixWorld(true);
    const inv = target.matrixWorld.clone().invert();
    for (const mesh of meshes) {
      const count = mesh.geometry!.attributes!.position!.count;
      const step = Math.max(1, Math.floor(count / VERTEX_BUDGET));
      toModel.copy(mesh.matrixWorld).premultiply(inv);
      for (let i = 0; i < count; i += step) {
        // Skinned meshes return the posed position here (three r151+).
        mesh.getVertexPosition!(i, v).applyMatrix4(toModel);
        pts.push(v.x, v.y, v.z);
        if (v.x < min[0]) min[0] = v.x;
        if (v.y < min[1]) min[1] = v.y;
        if (v.z < min[2]) min[2] = v.z;
        if (v.x > max[0]) max[0] = v.x;
        if (v.y > max[1]) max[1] = v.y;
        if (v.z > max[2]) max[2] = v.z;
      }
    }
  }
  if (duration) el.currentTime = resume;
  if (!Number.isFinite(min[0])) return null;
  const center = [0, 1, 2].map((a) => (min[a] + max[a]) / 2);
  let r2 = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const d = (pts[i] - center[0]) ** 2 + (pts[i + 1] - center[1]) ** 2 + (pts[i + 2] - center[2]) ** 2;
    if (d > r2) r2 = d;
  }
  return { center, radius: Math.sqrt(r2) };
}

/**
 * Fit the camera to the playing clip. `jump` skips the camera's glide (use it for
 * the first framing of a model, so it doesn't zoom in from model-viewer's default).
 * Returns false when the scene could not be measured.
 */
export function fitStage(el: Viewer, jump = false): boolean {
  const sphere = clipSphere(el);
  if (!sphere || sphere.radius <= 0) return false;
  const [cx, cy, cz] = sphere.center;

  // A sphere of radius r at distance d spans asin(r/d) either side of centre, so
  // it fills FILL of the half field of view when r/d = FILL * sin(fov/2). The
  // stage is square, so the horizontal field is the same.
  const half = ((FOV_DEG / 2) * Math.PI) / 180;
  const distance = sphere.radius / (FILL * Math.sin(half));

  const { theta } = el.getCameraOrbit();
  el.fieldOfView = `${FOV_DEG}deg`;
  el.cameraTarget = `${cx}m ${cy}m ${cz}m`;
  el.minCameraOrbit = `-Infinity 0deg ${distance}m`;
  el.maxCameraOrbit = `Infinity 180deg ${distance}m`;
  el.cameraOrbit = `${theta}rad ${PITCH_DEG}deg ${distance}m`;
  if (jump) el.jumpCameraToGoal();
  return true;
}
