/// <reference lib="webworker" />
/**
 * Writes one OPFS file with a synchronous access handle, for pages that can't write
 * OPFS themselves (src/art/storage.ts). Sync handles exist only in workers, and they
 * are Safari's way to write OPFS: stable Safari has long had no createWritable(), and
 * a WebKit that has it was found writing empty files (2026-10-09, Playwright WebKit).
 *
 *   page -> { id, parts: ['art', <pack id>, ...folders], name, data: ArrayBuffer }
 *   worker -> { id, ok: true } or { id, ok: false, name, message }
 */

type SyncHandle = { write(b: BufferSource, o: { at: number }): number; truncate(n: number): void; flush(): void; close(): void };
export type WriteRequest = { id: number; parts: string[]; name: string; data: ArrayBuffer };
export type WriteReply = { id: number; ok: true } | { id: number; ok: false; name: string; message: string };

self.addEventListener('message', async (e: MessageEvent<WriteRequest>) => {
  const { id, parts, name, data } = e.data;
  try {
    let dir = await navigator.storage.getDirectory();
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    const fh = await dir.getFileHandle(name, { create: true });
    const h = await (fh as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
    try {
      h.truncate(0);
      h.write(new Uint8Array(data), { at: 0 });
      h.flush();
    } finally {
      h.close();
    }
    postMessage({ id, ok: true } satisfies WriteReply);
  } catch (err) {
    const x = err as DOMException;
    postMessage({ id, ok: false, name: x?.name ?? 'Error', message: x?.message ?? String(err) } satisfies WriteReply);
  }
});
