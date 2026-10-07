/// <reference lib="webworker" />
/**
 * The in-browser extractor's thread (docs/WEBSITE-PLAN.md, Phase 6). It starts the
 * .NET runtime from public/extractor/ (`npm run build-extractor`) the first time
 * it's asked, and hands CUE4Parse the game's pak as a File.
 *
 * Why a worker: CUE4Parse reads synchronously, and only a worker may wait for a
 * file read (FileReaderSync). The page stays responsive meanwhile.
 *
 *   page -> { id, call: 'boot' | 'mount' | 'useMappings' | 'listPals' | 'exportPal', ... }
 *   worker -> { id, ok: true, value } or { id, ok: false, error }
 */

import roles from '../../scripts/anim-roles.json';
import type { PalExport, PalList } from './types.ts';

export type Call =
  | { call: 'boot' }
  | { call: 'mount'; pak: File }
  | { call: 'useMappings'; bytes: Uint8Array }
  | { call: 'listPals' }
  | { call: 'exportPal'; name: string; maxEdge: number };

export type Request = Call & { id: number };
export type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

/** The C# side (extractor/Program.cs, class Extractor). Strings are JSON where noted. */
interface Exports {
  Version(): string;
  Mount(pakName: string, pakSize: number): Promise<string>;
  UseMappings(bytes: Uint8Array): string;
  ListPals(): string;
  ExportPal(name: string, rolesJson: string, maxEdge: number): Promise<string>;
  ReadFile(path: string): Uint8Array;
  Clear(name: string): number;
}

/** ExportPal's JSON. */
interface Exported {
  error?: string;
  name: string;
  mesh: string;
  files: Array<{ path: string; file: string; bytes: number }>;
  materials: Record<string, string>;
  textures: Array<{ name: string; width: number; height: number; format: string }>;
  animations: Record<string, string>;
  errors: string[];
  ms: { mesh: number; textures: number; animations: number };
  reads: number;
}

const rolesJson = JSON.stringify(roles);

/** Export one pal, copy its files out of WebAssembly memory, and free them there. */
async function exportPal(x: Exports, name: string, maxEdge: number): Promise<PalExport> {
  const t0 = performance.now();
  const e = JSON.parse(await x.ExportPal(name, rolesJson, maxEdge)) as Exported;
  if (e.error) throw new Error(e.error);
  try {
    const read = (file: string) => {
      const f = e.files.find((one) => one.file.toLowerCase() === file.toLowerCase());
      return f ? x.ReadFile(f.path) : null;
    };
    const glbFile = e.files.find((f) => f.file.toLowerCase().endsWith('.glb'));
    const out: PalExport = {
      name,
      mesh: e.mesh,
      glb: glbFile ? x.ReadFile(glbFile.path) : null,
      materials: e.materials,
      textures: e.textures.flatMap((t) => {
        const data = read(`${t.name}.raw`);
        return data ? [{ ...t, data }] : [];
      }),
      animations: Object.entries(e.animations).flatMap(([role, from]) => {
        const psa = read(`${from}.psa`);
        return psa ? [{ role, from, psa }] : [];
      }),
      errors: e.errors,
      ms: { ...e.ms, total: 0 },
      reads: e.reads,
      bytes: 0,
      heapMB: null,
    };
    out.bytes = (out.glb?.byteLength ?? 0) + out.textures.reduce((n, t) => n + t.data.byteLength, 0) + out.animations.reduce((n, a) => n + a.psa.byteLength, 0);
    out.ms.total = Math.round(performance.now() - t0);
    return out;
  } finally {
    x.Clear(name);
  }
}

/** Set after Clear, so it's the memory the next pal starts from. */
async function exportAndMeasure(x: Exports, name: string, maxEdge: number): Promise<PalExport> {
  const out = await exportPal(x, name, maxEdge);
  out.heapMB = heapMB();
  return out;
}

/** The buffers a result carries, so they move to the page instead of being copied. */
function transferables(value: unknown): Transferable[] {
  if (!value || typeof value !== 'object' || !('textures' in value)) return [];
  const e = value as PalExport;
  return [e.glb, ...e.textures.map((t) => t.data), ...e.animations.map((a) => a.psa)].flatMap((b) => (b ? [b.buffer] : []));
}

// .NET decides whether it runs as a "sidecar" (a worker hosting .NET) by whether
// onmessage is assigned when dotnet.js loads; outside that mode dotnet.create()
// never finishes (dotnet/runtime#114918). Say so explicitly instead of relying on it.
(self as unknown as { dotnetSidecar: boolean }).dotnetSidecar = true;

let pak: File | null = null;
const reader = new FileReaderSync();

/** Called from C# (JsFileStream.Read): copy [offset, offset + length) of the pak into `into`. */
function readRange(offset: number, length: number, into: { set(bytes: Uint8Array, at: number): void }): number {
  if (!pak) throw new Error('No game file is open.');
  const bytes = new Uint8Array(reader.readAsArrayBuffer(pak.slice(offset, offset + length)));
  into.set(bytes, 0);
  return bytes.length;
}

let api: Promise<{ exports: Exports; bootMs: number }> | null = null;
/** The whole WebAssembly memory (.NET heap, runtime, in-memory files), in MB. */
let heapMB: () => number | null = () => null;

/** Start .NET once. About 43 MB the first time; the browser caches it after that. */
function boot() {
  api ??= (async () => {
    const t0 = performance.now();
    const url = new URL(`${import.meta.env.BASE_URL}extractor/_framework/dotnet.js`, self.location.origin).href;
    let dotnet;
    try {
      ({ dotnet } = await import(/* @vite-ignore */ url));
    } catch {
      throw new Error('The extractor isn’t on this copy of the site (public/extractor is missing: run npm run build-extractor).');
    }
    const runtime = await dotnet.create();
    runtime.setModuleImports('extractor', { readRange });
    heapMB = () => {
      const heap = (runtime as { Module?: { HEAPU8?: Uint8Array } }).Module?.HEAPU8;
      return heap ? Math.round(heap.length / 1048576) : null;
    };
    const assembly = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
    return { exports: assembly.Extractor as Exports, bootMs: Math.round(performance.now() - t0) };
  })();
  api.catch(() => (api = null)); // A failed start can be tried again.
  return api;
}

async function handle(r: Request): Promise<unknown> {
  const { exports, bootMs } = await boot();
  switch (r.call) {
    case 'boot':
      return { ...JSON.parse(exports.Version()), bootMs };
    case 'mount': {
      pak = r.pak;
      return JSON.parse(await exports.Mount(r.pak.name, r.pak.size));
    }
    case 'useMappings':
      return exports.UseMappings(r.bytes) || null;
    case 'listPals':
      return JSON.parse(exports.ListPals()) as PalList;
    case 'exportPal':
      return exportAndMeasure(exports, r.name, r.maxEdge);
  }
}

// addEventListener, not `self.onmessage = …`: an assigned onmessage is what turns
// sidecar mode off (above). Found 7 Oct 2026 on .NET 10.0.9.
self.addEventListener('message', async (e: MessageEvent<Request>) => {
  const { id } = e.data;
  try {
    const value = await handle(e.data);
    postMessage({ id, ok: true, value } satisfies Reply, transferables(value));
  } catch (err) {
    postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Reply);
  }
});
