/**
 * The extractor's decoded textures, as the canvas wants them: 8-bit RGBA.
 * CUE4Parse hands over the formats Palworld's textures decode to; anything else
 * is refused rather than drawn wrong.
 */

export function toRgba(data: Uint8Array, width: number, height: number, format: string): Uint8ClampedArray<ArrayBuffer> {
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  switch (format) {
    case 'PF_R8G8B8A8':
      if (data.length < n * 4) break;
      out.set(data.subarray(0, n * 4));
      return out;
    case 'PF_B8G8R8A8':
      if (data.length < n * 4) break;
      for (let i = 0; i < n * 4; i += 4) {
        out[i] = data[i + 2];
        out[i + 1] = data[i + 1];
        out[i + 2] = data[i];
        out[i + 3] = data[i + 3];
      }
      return out;
    case 'PF_G8':
      if (data.length < n) break;
      for (let i = 0; i < n; i++) {
        const g = data[i];
        out[i * 4] = g;
        out[i * 4 + 1] = g;
        out[i * 4 + 2] = g;
        out[i * 4 + 3] = 255;
      }
      return out;
    default:
      throw new Error(`Pixel format ${format} isn’t handled yet.`);
  }
  throw new Error(`A ${width}×${height} ${format} texture came with only ${data.length} bytes.`);
}
