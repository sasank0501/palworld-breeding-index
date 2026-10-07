/// <reference lib="webworker" />
/**
 * The in-browser extractor's thread (docs/WEBSITE-PLAN.md, Phase 6). It starts the
 * .NET runtime from public/extractor/ (`npm run build-extractor`) the first time
 * it's asked, and hands CUE4Parse the game's pak as a File.
 *
 * Why a worker: CUE4Parse reads synchronously, and only a worker may wait for a
 * file read (FileReaderSync). The page stays responsive meanwhile.
 *
 *   page -> { id, call: 'boot' | 'mount' | 'useMappings', ... }
 *   worker -> { id, ok: true, value } or { id, ok: false, error }
 */

export type Call =
  | { call: 'boot' }
  | { call: 'mount'; pak: File }
  | { call: 'useMappings'; bytes: Uint8Array };

export type Request = Call & { id: number };
export type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

/** The C# side (extractor/Program.cs, class Extractor). Strings are JSON where noted. */
interface Exports {
  Version(): string;
  Mount(pakName: string, pakSize: number): Promise<string>;
  UseMappings(bytes: Uint8Array): string;
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
  }
}

// addEventListener, not `self.onmessage = …`: an assigned onmessage is what turns
// sidecar mode off (above). Found 7 Oct 2026 on .NET 10.0.9.
self.addEventListener('message', async (e: MessageEvent<Request>) => {
  const { id } = e.data;
  try {
    postMessage({ id, ok: true, value: await handle(e.data) } satisfies Reply);
  } catch (err) {
    postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Reply);
  }
});
