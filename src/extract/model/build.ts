/**
 * One extracted pal -> one chibi model for the art pack (Phase 6, step 6): a port
 * of build() in scripts/build-pal-models.mjs, in its `--lite` form (chibi only,
 * meshopt-compressed, the set the portfolio build hosts). Everything environment-
 * specific is passed in (`encode` for the WebP step), so the same code runs in the
 * browser and in the tests.
 */

import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

import roleFile from '../../../scripts/anim-roles.json';
import overridesFile from '../../../scripts/chibi-overrides.json';
import type { PalExport } from '../types.ts';
import { attachLoop } from './animate.ts';
import { axisAngle, CHIBI, chibify, type ChibiOverrides } from './chibi.ts';
import { applyMaterials, type EncodeWebp } from './materials.ts';

const ROLES = roleFile.roles.map((r) => r.role);
const OVERRIDES = overridesFile as unknown as ChibiOverrides;

/** A pal's line in pal-models/index.json (src/design/PalModel.tsx reads it). */
export interface ModelEntry {
  v: number;
  chibi: true;
  anim: null;
  chibiAnim: string | null;
  clips: string[];
  head: number;
  normal: false;
  /** Set on a blueprint-only pal: draw this pal's model instead. */
  file?: string;
}

export interface BuiltModel {
  glb: Uint8Array;
  entry: ModelEntry;
  /** Anything worth a look: a missing bone, a skeleton rescaled, a pose that may be broken. */
  notes: string[];
}

export interface BuildOptions {
  encode: EncodeWebp;
  /** Texture edge in px; 512 matches the portfolio's lite set. */
  edge?: number;
  /** Stamp for the manifest entry; tests pin it. */
  now?: number;
}

export async function buildModel(pal: PalExport, { encode, edge = 512, now = Date.now() }: BuildOptions): Promise<BuiltModel> {
  if (!pal.glb) throw new Error(`${pal.name}: the mesh didn’t export`);
  const notes: string[] = [];
  const note = (m: string) => notes.push(m);
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.readBinary(pal.glb);
  doc.createExtension(EXTTextureWebP).setRequired(true);

  // Unreal stores masks in vertex colour, which glTF multiplies into the base colour
  // (near-black pals), and every material samples UV 0, so the other UV sets are dead weight.
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

  await applyMaterials(doc, pal.materials, pal.textures, OVERRIDES[pal.name] ?? {}, edge, encode, (m) => note(`${pal.name}: ${m}`));

  const { missing, legScale, jaw, shift, head } = chibify(doc, pal.name, OVERRIDES, (m) => note(m));
  const jawDegrees = OVERRIDES[pal.name]?.jaw ?? CHIBI.jawDegrees;
  const opts = { legScale, shift, after: jaw && jawDegrees ? { [jaw]: axisAngle([0, 0, 1], jawDegrees) } : {} };
  // First clip = what the viewer autoplays (the sitting rest); roles the pal lacks are skipped.
  const clips: string[] = [];
  for (const role of ROLES) {
    const a = pal.animations.find((x) => x.role === role);
    if (!a) continue;
    clips.push(attachLoop(doc, pal.name, role, a.psa, opts, note).getName());
  }
  if (missing.length) note(`${pal.name}: skipped, not on this pal: ${missing.join(', ')}`);

  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const glb = await io.writeBinary(doc);

  return {
    glb,
    notes,
    entry: { v: now, chibi: true, anim: null, chibiAnim: clips[0] ?? null, clips, head: Math.round(head * 100) / 100, normal: false },
  };
}

/**
 * Blueprint-only pals get an entry pointing at the mesh their Blueprint really
 * uses ({ file: 'LilyQueen_Ice' } under LilyQueen_Dark); the page follows `file`
 * and nothing is copied. A pal with a real model of its own keeps it.
 */
export function foldAliases(manifest: Record<string, ModelEntry>, aliases: Record<string, string>): number {
  let added = 0;
  for (const [pal, target] of Object.entries(aliases)) {
    const real = manifest[target];
    const own = manifest[pal] && !manifest[pal].file;
    if (!real || own) continue;
    manifest[pal] = { ...real, file: real.file ?? target };
    added++;
  }
  return added;
}

/** index.json as the desktop writes it: sorted by name, two-space indent, trailing newline. */
export function manifestText(manifest: Record<string, ModelEntry>): string {
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(sorted, null, 2) + '\n';
}
