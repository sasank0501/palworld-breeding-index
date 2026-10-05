// Runs in a module Web Worker: starts the .NET runtime and calls into it.
import { dotnet } from './_framework/dotnet.js';

const t0 = performance.now();
const { getAssemblyExports, getConfig } = await dotnet.create();
const exports = await getAssemblyExports(getConfig().mainAssemblyName);
const boot = Math.round(performance.now() - t0);
postMessage({ boot, hello: exports.Spike.Hello() });
