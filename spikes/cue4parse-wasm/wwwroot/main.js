// Runs in a module Web Worker: starts the .NET runtime and calls into it.
// Synchronous file reads (FileReaderSync) are only allowed in workers, and
// CUE4Parse's Stream.Read has to return its bytes before it can carry on.
import { dotnet } from './_framework/dotnet.js';

let pak = null; // the File the page handed over; reading it happens only in readRange
const reader = new FileReaderSync();

/** Called from C# (JsFileStream.Read): copy [offset, offset + length) of the pak into `into`. */
function readRange(offset, length, into) {
  const bytes = new Uint8Array(reader.readAsArrayBuffer(pak.slice(offset, offset + length)));
  into.set(bytes, 0);
  return bytes.length;
}

const t0 = performance.now();
const runtime = await dotnet.create();
runtime.setModuleImports('main.js', { readRange });
const { Spike } = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
const boot = Math.round(performance.now() - t0);
postMessage({ step: 'hello', boot, hello: Spike.Hello() });

/** The whole WebAssembly memory (.NET heap, runtime, in-memory files), in MB. */
const wasmMB = () => {
  const heap = runtime.Module?.HEAPU8 ?? globalThis.HEAPU8;
  return heap ? Math.round(heap.length / 1048576) : null;
};

const timed = async (step, f) => {
  const t = performance.now();
  const out = JSON.parse(await f());
  out.wallMs = Math.round(performance.now() - t);
  out.wasmMB = wasmMB();
  postMessage({ step, [step]: out });
  return out;
};

onmessage = async (e) => {
  const { cmd = 'mount', pak: file, usmap, mesh, name, anim } = e.data;
  try {
    if (cmd === 'mount') {
      pak = file;
      const usmapBytes = new Uint8Array(reader.readAsArrayBuffer(usmap));
      await timed('mount', () => Spike.Mount(file.name, file.size, usmapBytes)); // a Promise: C# awaits inside
      if (mesh) await timed('load', () => Spike.LoadMesh(mesh));
    } else if (cmd === 'export') {
      await timed(`export:${name}`, () => Spike.ExportPal(name, anim, e.data.maxMip ?? 0));
    } else if (cmd === 'clear') {
      postMessage({ step: `clear:${name}`, removed: Spike.ClearOut(name), wasmMB: wasmMB() });
    } else if (cmd === 'file') {
      const bytes = Spike.ReadOut(name, e.data.file);
      postMessage({ step: `file:${name}/${e.data.file}`, bytes }, [bytes.buffer]);
    }
  } catch (err) {
    postMessage({ step: 'error', error: String(err?.stack ?? err) });
  }
};
