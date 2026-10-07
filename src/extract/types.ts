/**
 * What the extractor hands the page for each pal (Phase 6, step 5): everything the
 * model builder (step 6, a port of scripts/build-pal-models.mjs) reads, in memory.
 * Nothing is kept between pals: the desktop's staging folder is 3.9 GB, so in the
 * browser each pal goes straight from here to the builder to the art pack.
 */

export interface PalList {
  /** Every pal mesh in the pak (SK_<Name> under Model/Character/Monster/), sorted. */
  pals: string[];
  /** How many monster animation assets the pak has. */
  animations: number;
  /** Blueprint-only pal -> the pal whose mesh it uses (BP_LilyQueen_Dark -> LilyQueen_Ice). */
  aliases: Record<string, string>;
}

export interface PalTexture {
  /** The texture's name, e.g. T_Sheepball_Body_B. */
  name: string;
  width: number;
  height: number;
  /** CUE4Parse's pixel format: PF_B8G8R8A8, PF_R8G8B8A8 or PF_G8 in practice. */
  format: string;
  data: Uint8Array;
}

export interface PalAnimation {
  /** The role in scripts/anim-roles.json: Rest, Idle, Walk, Sleep, Petting. */
  role: string;
  /** The sequence used, e.g. AS_SheepBall_Rest02, or a base species' for a variant. */
  from: string;
  psa: Uint8Array;
}

export interface PalExport {
  name: string;
  /** The mesh export's own name: usually SK_<name>, not always (SK_GrassMinotaur_Ice_Eye). */
  mesh: string;
  /** The mesh, skeleton and empty materials as glTF binary; null when the export failed. */
  glb: Uint8Array | null;
  /** Material name -> its parameters as CUE4Parse's material export writes them (JSON text). */
  materials: Record<string, string>;
  textures: PalTexture[];
  animations: PalAnimation[];
  /** Everything that went wrong but didn't stop the pal: a texture, a role, ... */
  errors: string[];
  ms: { mesh: number; textures: number; animations: number; total: number };
  /** Reads of the pak this pal took. */
  reads: number;
  /** Bytes handed over: the size of everything above. */
  bytes: number;
  /** WebAssembly memory after the pal's files were freed, in MB: it can grow but never shrink. */
  heapMB: number | null;
}
