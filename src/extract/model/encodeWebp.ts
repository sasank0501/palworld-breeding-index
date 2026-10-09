/**
 * The browser's WebP step for model textures: fit inside edge x edge (never
 * enlarging), then encode at the desktop build's quality. Canvas stores colour
 * premultiplied, so pixels of a cut-out texture that are fully transparent lose
 * their colour; those pixels are never drawn, so nothing visible changes.
 */

import type { EncodeWebp } from './materials.ts';

export const encodeWebp: EncodeWebp = async (rgba, width, height, edge) => {
  const source = new OffscreenCanvas(width, height);
  const sctx = source.getContext('2d');
  if (!sctx) throw new Error('No 2D canvas here.');
  sctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

  const scale = Math.min(1, edge / Math.max(width, height));
  let canvas = source;
  if (scale < 1) {
    canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas here.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.88 });
  return new Uint8Array(await blob.arrayBuffer());
};
