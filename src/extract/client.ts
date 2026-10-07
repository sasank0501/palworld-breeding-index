/**
 * The page's handle on the extractor worker (src/extract/extractor.worker.ts).
 * Nothing loads until `startExtractor()` is called: the 43 MB .NET runtime is
 * only fetched by players who are extracting.
 */

import type { Call, Reply, Request } from './extractor.worker.ts';
import type { Verify } from '../art/mappings.ts';
import type { PalExport, PalList } from './types.ts';

export interface BootInfo {
  cue4parse: string;
  runtime: string;
  bootMs: number;
}

export interface MountInfo {
  files: number;
  palMeshes: number;
  mountMs: number;
  reads: number;
  bytesRead: number;
}

export interface Extractor {
  boot(): Promise<BootInfo>;
  /** Open the game's pak (Pal-Windows.pak). Reads only its index: about 15 MB of 39 GB. */
  mount(pak: File): Promise<MountInfo>;
  /** The decode check findMappings needs: null when these mappings decode the art. */
  verify: Verify;
  /** Every pal mesh in the pak, and the Blueprint-only pals that borrow one. */
  listPals(): Promise<PalList>;
  /** One pal, textures decoded at up to maxEdge pixels (default 1024). */
  exportPal(name: string, maxEdge?: number): Promise<PalExport>;
  stop(): void;
}

export function startExtractor(): Extractor {
  const worker = new Worker(new URL('./extractor.worker.ts', import.meta.url), { type: 'module', name: 'extractor' });
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let next = 0;

  worker.onmessage = (e: MessageEvent<Reply>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.value);
    else p.reject(new Error(e.data.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'The extractor stopped.'));
    pending.clear();
  };

  const send = <T>(call: Call, transfer: Transferable[] = []) =>
    new Promise<T>((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, ...call } satisfies Request, transfer);
    });

  return {
    boot: () => send<BootInfo>({ call: 'boot' }),
    mount: (pak) => send<MountInfo>({ call: 'mount', pak }),
    // A copy goes to the worker, so the caller's bytes stay usable (findMappings stores them).
    verify: (bytes) => send<string | null>({ call: 'useMappings', bytes: bytes.slice() }),
    listPals: () => send<PalList>({ call: 'listPals' }),
    exportPal: (name, maxEdge = 1024) => send<PalExport>({ call: 'exportPal', name, maxEdge }),
    stop() {
      worker.terminate();
      for (const p of pending.values()) p.reject(new DOMException('Stopped', 'AbortError'));
      pending.clear();
    },
  };
}
