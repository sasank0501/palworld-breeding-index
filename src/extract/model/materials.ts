/**
 * Wire a pal's textures into its (empty) glTF materials: a port of the material
 * loop in scripts/build-pal-models.mjs. CUE4Parse exports geometry and skeleton
 * but leaves every material blank; the wiring lives in the material parameter
 * files, which arrive as JSON text in PalExport.materials. Unreal's channel
 * conventions become glTF's on the way (the script's header explains each):
 *
 *   _B   base colour, alpha kept for the masked eye material
 *   _N   normal map: green flips (DirectX -> OpenGL)
 *   _M   R metallic, G roughness, B occlusion -> glTF's R occlusion, G roughness, B metallic
 *   _EM  emissive, as-is
 *
 * Pixels are changed here, in plain RGBA arrays; only the last step (resize and
 * WebP) needs a canvas, and that is passed in so tests can use sharp instead.
 */

import type { Document, Material, Texture } from '@gltf-transform/core';

import { toRgba } from '../pixels.ts';
import type { PalTexture } from '../types.ts';
import type { ChibiOverride } from './chibi.ts';

/**
 * Resize `rgba` to fit inside edge x edge (never enlarging) and encode it: WebP where the
 * browser can, otherwise whatever it produced (PNG in Safari), with `mime` saying which.
 */
export type EncodeImage = (rgba: Uint8ClampedArray, width: number, height: number, edge: number) => Promise<{ data: Uint8Array; mime: string }>;

interface MaterialJson {
  Textures?: Record<string, string>;
  Parameters?: {
    Colors?: Record<string, { R: number; G: number; B: number }>;
    Properties?: { BasePropertyOverrides?: { TwoSided?: boolean; BlendMode?: string; OpacityMaskClipValue?: number } };
  };
}

/** "Pal/Content/.../T_X_Body_B.T_X_Body_B" -> "T_X_Body_B" */
const textureName = (ref: string) => ref.slice(ref.lastIndexOf('/') + 1).split('.')[0];

/** Unreal colour {R,G,B} (linear, can exceed 1) -> glTF factor in 0-1. */
function colorFactor(c: { R: number; G: number; B: number }): [number, number, number] {
  const m = Math.max(c.R, c.G, c.B, 1);
  return [c.R / m, c.G / m, c.B / m].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

export async function applyMaterials(
  doc: Document,
  materials: Record<string, string>,
  textures: PalTexture[],
  override: ChibiOverride,
  edge: number,
  encode: EncodeImage,
  note: (m: string) => void = () => undefined,
): Promise<void> {
  // The game is loose about case (MI_DarKCrow_Body, Ml_Ganesha_Body with a lower-case L).
  const materialText = new Map(Object.entries(materials).map(([k, v]) => [k.toLowerCase(), v]));
  const textureByName = new Map(textures.map((t) => [t.name.toLowerCase(), t]));
  const rgba = (t: PalTexture) => toRgba(t.data, t.width, t.height, t.format);

  const make = (tex: PalTexture, img: { data: Uint8Array; mime: string }): Texture => doc.createTexture(tex.name).setImage(img.data).setMimeType(img.mime);
  const opaque = (px: Uint8ClampedArray) => {
    for (let i = 3; i < px.length; i += 4) px[i] = 255;
  };

  for (const mat of doc.getRoot().listMaterials() as Material[]) {
    const text = materialText.get(mat.getName().toLowerCase());
    if (!text) {
      note(`no ${mat.getName()} parameters, leaving it untextured`);
      continue;
    }
    const mi = JSON.parse(text) as MaterialJson;
    const textureRefs = mi.Textures ?? {};
    const overrides = mi.Parameters?.Properties?.BasePropertyOverrides;
    // Leaf coats, wings and skirts drawn from one side need both sides drawn.
    if (overrides?.TwoSided || override.doubleSided) mat.setDoubleSided(true);

    const refs = [...new Set(Object.values(textureRefs).map(textureName))];
    const find = (suffix: string): PalTexture | null => {
      for (const ref of refs) {
        const t = textureByName.get(ref.toLowerCase());
        if (t && t.name.toLowerCase().endsWith(suffix.toLowerCase())) return t;
      }
      return null;
    };

    // The material names its colour map outright; the _B suffix is only a convention.
    const named = textureRefs['Base Texture'] ?? textureRefs['BaseColor'] ?? textureRefs['Diffuse'];
    const base = (named && textureByName.get(textureName(named).toLowerCase())) || find('_B');

    // Effect shaders (flames, glows) have no colour map: draw a see-through glow in their first colour.
    const blend = overrides?.BlendMode ?? '';
    if (!base && /Translucent|Additive/.test(blend)) {
      const first = Object.values(mi.Parameters?.Colors ?? {})[0];
      const rgb = first ? colorFactor(first) : ([1, 1, 1] as [number, number, number]);
      mat.setBaseColorFactor([...rgb, 0.45]).setEmissiveFactor(rgb).setAlphaMode('BLEND').setDoubleSided(true);
      mat.setMetallicFactor(0).setRoughnessFactor(1);
      continue;
    }

    if (base) {
      const px = rgba(base);
      let hasCutouts = false;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] < 255) {
          hasCutouts = true;
          break;
        }
      }
      mat.setBaseColorTexture(make(base, await encode(px, base.width, base.height, edge)));
      // The body is marked masked too but its alpha is solid; only honour it when the map has cut-outs.
      if (overrides?.BlendMode === 'EBlendMode::BLEND_Masked' && hasCutouts) {
        mat.setAlphaMode('MASK').setAlphaCutoff(overrides.OpacityMaskClipValue ?? 0.5);
      }
    }

    const normal = find('_N');
    if (normal) {
      const px = rgba(normal);
      for (let i = 0; i < px.length; i += 4) px[i + 1] = 255 - px[i + 1];
      opaque(px);
      mat.setNormalTexture(make(normal, await encode(px, normal.width, normal.height, edge)));
    }

    const masks = find('_M');
    if (masks) {
      // An empty occlusion channel means "fully shadowed" to glTF: treat it as absent.
      const px = rgba(masks);
      let aoMax = 0;
      for (let i = 2; i < px.length; i += 4) aoMax = Math.max(aoMax, px[i]);
      const hasAo = aoMax > 16;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        px[i] = hasAo ? px[i + 2] : 255;
        px[i + 2] = r;
      }
      opaque(px);
      const orm = make(masks, await encode(px, masks.width, masks.height, edge));
      mat.setMetallicRoughnessTexture(orm).setMetallicFactor(1).setRoughnessFactor(1);
      if (hasAo) mat.setOcclusionTexture(orm);
    } else {
      mat.setMetallicFactor(0).setRoughnessFactor(0.8);
    }

    const emissive = find('_EM');
    if (emissive) {
      const px = rgba(emissive);
      opaque(px);
      mat.setEmissiveTexture(make(emissive, await encode(px, emissive.width, emissive.height, edge))).setEmissiveFactor([1, 1, 1]);
    }
  }
}
