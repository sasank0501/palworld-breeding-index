/**
 * The arithmetic of a zoom-and-drag frame (the lineage tree's sandbox, src/routes/showcase/tree.tsx):
 * a picture of some size shown through a box, scaled and moved. Kept apart from the component so
 * it can be tested without a browser.
 *
 * A view is where the picture's top-left corner sits in the box (x, y, in the box's pixels) and how
 * large it is drawn (scale; 1 is its natural size).
 */
export interface View {
  scale: number;
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;
const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** The whole picture, centred in the box. It is shrunk to fit and never enlarged past its natural size. */
export function fitView(box: Size, content: Size, pad = 16): View {
  if (content.w <= 0 || content.h <= 0 || box.w <= 0 || box.h <= 0) return { scale: 1, x: pad, y: pad };
  const scale = clampScale(Math.min(1, (box.w - 2 * pad) / content.w, (box.h - 2 * pad) / content.h));
  return { scale, x: (box.w - content.w * scale) / 2, y: (box.h - content.h * scale) / 2 };
}

/** Zoom by a factor, keeping the point of the picture under (px, py) where it is: under the pointer, or the box's middle. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const scale = clampScale(view.scale * factor);
  const k = scale / view.scale;
  return { scale, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}

/** Stop a drag from losing the picture: at least `keep` pixels of it stay inside the box on each axis. */
export function keepInReach(view: View, box: Size, content: Size, keep = 80): View {
  const w = content.w * view.scale;
  const h = content.h * view.scale;
  const kx = Math.min(keep, w, box.w);
  const ky = Math.min(keep, h, box.h);
  return {
    scale: view.scale,
    x: Math.min(box.w - kx, Math.max(kx - w, view.x)),
    y: Math.min(box.h - ky, Math.max(ky - h, view.y)),
  };
}

/**
 * Move the picture the least distance that brings a rectangle (in the box's pixels, as it is drawn
 * now) inside the box: a card that took keyboard focus while off screen. Larger than the box, its
 * top-left corner wins.
 */
export function reveal(view: View, box: Size, rect: { left: number; top: number; right: number; bottom: number }, pad = 12): View {
  let dx = 0;
  let dy = 0;
  if (rect.right > box.w - pad) dx = box.w - pad - rect.right;
  if (rect.left + dx < pad) dx = pad - rect.left;
  if (rect.bottom > box.h - pad) dy = box.h - pad - rect.bottom;
  if (rect.top + dy < pad) dy = pad - rect.top;
  return { scale: view.scale, x: view.x + dx, y: view.y + dy };
}
