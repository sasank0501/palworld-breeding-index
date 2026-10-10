/**
 * The browser's image step for model textures: fit inside edge x edge (never
 * enlarging), then encode at the desktop build's quality.
 *
 * WebP where the browser can encode it (Chrome, Edge, Firefox). Safari can't: asked
 * for WebP, its canvas hands back a PNG (WebKit bug 226950, closed WONTFIX), so the
 * type is read off the result rather than assumed, and the model labels each texture
 * with what it really is. A browser without OffscreenCanvas (Safari before 16.4, and
 * Playwright's Windows WebKit) gets a plain canvas element instead.
 *
 * Canvas stores colour premultiplied, so pixels of a cut-out texture that are fully
 * transparent lose their colour; those pixels are never drawn, so nothing visible changes.
 */

import type { EncodeImage } from './materials.ts';

type Canvas2D = { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D };

function canvas(width: number, height: number): Canvas2D {
  const c: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('This browser has no 2D canvas to draw the textures with.');
  return { canvas: c, ctx };
}

function toBlob(c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/webp', quality: 0.88 });
  return new Promise((resolve, reject) => (c as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('The canvas made no image.'))), 'image/webp', 0.88));
}

export const encodeImage: EncodeImage = async (rgba, width, height, edge) => {
  const source = canvas(width, height);
  source.ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

  const scale = Math.min(1, edge / Math.max(width, height));
  let out = source;
  if (scale < 1) {
    out = canvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    out.ctx.imageSmoothingQuality = 'high';
    out.ctx.drawImage(source.canvas, 0, 0, out.canvas.width, out.canvas.height);
  }
  const blob = await toBlob(out.canvas);
  return { data: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || 'image/png' };
};
