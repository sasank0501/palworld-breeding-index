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
const { getAssemblyExports, getConfig, setModuleImports } = await dotnet.create();
setModuleImports('main.js', { readRange });
const { Spike } = (await getAssemblyExports(getConfig().mainAssemblyName));
const boot = Math.round(performance.now() - t0);
postMessage({ step: 'hello', boot, hello: Spike.Hello() });

onmessage = async (e) => {
  const { pak: file, usmap, mesh } = e.data;
  try {
    pak = file;
    let t = performance.now();
    const usmapBytes = new Uint8Array(reader.readAsArrayBuffer(usmap));
    const mount = JSON.parse(await Spike.Mount(file.name, file.size, usmapBytes)); // a Promise: C# awaits inside
    mount.wallMs = Math.round(performance.now() - t);
    postMessage({ step: 'mount', mount });
    t = performance.now();
    const load = JSON.parse(Spike.LoadMesh(mesh));
    load.wallMs = Math.round(performance.now() - t);
    postMessage({ step: 'load', load });
  } catch (err) {
    postMessage({ step: 'error', error: String(err?.stack ?? err) });
  }
};
