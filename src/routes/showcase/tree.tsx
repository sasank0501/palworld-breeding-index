import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';

import { MAX_SCALE, MIN_SCALE, fitView, keepInReach, reveal, zoomAt, type View } from '../../lib/viewport.ts';

/**
 * A left-to-right family tree: the ingredients on the left, joined by elbow
 * connectors into the thing they make on the right. Pure CSS (see `.sc-tree`
 * in showcase-views.css), so it re-skins with everything else and needs no layout pass.
 * Used for a species' breeding route and for the passive planner's lineage.
 *
 * Each pair sits right beside the pal it makes (the column of parents is packed to the right),
 * so with cards of one width every breeding lines up in its own column, and each join carries
 * its step number in the order to breed.
 *
 * `sandbox` (the planner's lineage, which can be far larger than the page) shows the tree in a
 * frame that opens fitted to its size and can be zoomed and dragged; on a phone, where a frame
 * inside the page fights the page's own scrolling, it becomes a ladder of steps instead.
 */
export interface TNode {
  key: string;
  card: ReactNode;
  /** The parents that make this node; none for something you already own. */
  kids?: TNode[];
}

/** The breedings in the order to do them: a pal is bred before it is used as a parent. */
function stepsOf(root: TNode): TNode[] {
  const out: TNode[] = [];
  const walk = (n: TNode) => {
    for (const k of n.kids ?? []) walk(k);
    if (n.kids?.length) out.push(n);
  };
  walk(root);
  return out;
}

const PHONE = '(max-width: 640px)';
function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof matchMedia === 'function' && matchMedia(PHONE).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(PHONE);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

export function Tree({ root, sandbox = false }: { root: TNode; sandbox?: boolean }) {
  const phone = usePhone();
  const steps = useMemo(() => new Map(stepsOf(root).map((n, i) => [n.key, i + 1])), [root]);
  if (sandbox && phone) return <Ladder root={root} />;
  if (sandbox) return <Sandbox root={root} steps={steps} />;
  return <Scroller root={root} steps={steps} />;
}

/** The plain form: the tree at its natural size, scrolling sideways when it is wider than its card. */
function Scroller({ root, steps }: { root: TNode; steps: Map<string, number> }) {
  const box = useRef<HTMLDivElement>(null);
  // The goal is on the right and the tree grows leftwards, so start scrolled to the
  // right end: the thing you asked for (and its parents) is what you see first.
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [root.key]);

  return (
    <div className="sc-tree-scroll" ref={box}>
      <TreeNode node={root} steps={steps} />
    </div>
  );
}

function TreeNode({ node, steps }: { node: TNode; steps: Map<string, number> }) {
  const kids = node.kids ?? [];
  const step = steps.get(node.key);
  return (
    <div className="sc-tree">
      {kids.length > 0 && (
        <div className="sc-tree-kids">
          {kids.map((k) => (
            <div className="sc-tree-kid" key={k.key}>
              <TreeNode node={k} steps={steps} />
            </div>
          ))}
        </div>
      )}
      <div className={`sc-tree-node${kids.length ? ' has-kids' : ''}`}>
        {step !== undefined && steps.size > 1 && (
          <span className="sc-tree-step">
            <span className="sr-only">Step </span>
            {step}
          </span>
        )}
        {node.card}
      </div>
    </div>
  );
}

/** Phones: one row per breeding, top to bottom. A bred pal shows as a result, then again as a parent. */
function Ladder({ root }: { root: TNode }) {
  const steps = stepsOf(root);
  if (steps.length === 0) return <div className="sc-ladder-one">{root.card}</div>;
  return (
    <ol className="sc-ladder">
      {steps.map((n, i) => (
        <li key={n.key}>
          <span className="sc-ladder-n">
            Step {i + 1}
            {steps.length > 1 ? ` of ${steps.length}` : ''}
          </span>
          {(n.kids ?? []).map((k, j) => (
            <div className="sc-ladder-part" key={k.key}>
              {j > 0 && <i aria-hidden="true">×</i>}
              {j > 0 && <span className="sr-only">with</span>}
              {k.card}
            </div>
          ))}
          <div className="sc-ladder-part makes">
            <i aria-hidden="true">=</i>
            <span className="sr-only">makes</span>
            {n.card}
          </div>
        </li>
      ))}
    </ol>
  );
}

const STEP = 1.25;
const PAN = 60;

/**
 * The tree in a frame of its own. It opens fitted, so the whole lineage shows without zooming
 * the browser; from there:
 *
 *   drag                       move it (mouse, pen or one finger)
 *   Ctrl + wheel, or a pinch   zoom, about the pointer
 *   wheel alone                zooms once the frame has been clicked or tabbed into (and in full
 *                              screen); before that the wheel scrolls the page, as it should
 *   keyboard, frame focused    arrows move, + and - zoom, 0 fits
 *   the buttons                the same, for everyone
 *
 * Cards stay real buttons inside it; one that takes keyboard focus while out of sight is brought in.
 */
function Sandbox({ root, steps }: { root: TNode; steps: Map<string, number> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 16, y: 16 });
  const viewRef = useRef(view);
  viewRef.current = view;
  /** Until the player zooms or drags, the tree is re-fitted whenever the frame or the tree changes size. */
  const touched = useRef(false);
  const [full, setFull] = useState(false);
  const hintId = useId();

  const sizes = useCallback(() => {
    const b = box.current;
    const c = inner.current;
    return b && c ? { box: { w: b.clientWidth, h: b.clientHeight }, content: { w: c.offsetWidth, h: c.offsetHeight } } : null;
  }, []);
  const fit = useCallback(() => {
    const s = sizes();
    if (s) setView(fitView(s.box, s.content));
    touched.current = false;
  }, [sizes]);
  const change = useCallback(
    (next: (v: View) => View) => {
      const s = sizes();
      touched.current = true;
      setView((v) => (s ? keepInReach(next(v), s.box, s.content) : next(v)));
    },
    [sizes],
  );
  const zoom = useCallback(
    (factor: number, px?: number, py?: number) => {
      const b = box.current;
      if (b) change((v) => zoomAt(v, factor, px ?? b.clientWidth / 2, py ?? b.clientHeight / 2));
    },
    [change],
  );

  // A new plan starts fitted; so does a frame that changed size before the player moved anything.
  useEffect(() => {
    touched.current = false;
    fit();
  }, [root.key, fit]);
  useEffect(() => {
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [fit]);

  // The wheel: React's listener is passive, and zooming has to stop the page from scrolling.
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const onWheel = (e: WheelEvent) => {
      const engaged = e.ctrlKey || e.metaKey || b.contains(document.activeElement) || !!document.fullscreenElement;
      if (!engaged) return;
      e.preventDefault();
      const r = b.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    b.addEventListener('wheel', onWheel, { passive: false });
    return () => b.removeEventListener('wheel', onWheel);
  }, [zoom]);

  // Drag to move, two fingers to pinch. A press that never moves stays a click on the card under it.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; pinch: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current ??= { moved: false, pinch: 0 };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const before = pointers.current.get(e.pointerId);
    const d = drag.current;
    if (!before || !d) return;
    const dx = e.clientX - before.x;
    const dy = e.clientY - before.y;
    if (!d.moved && pointers.current.size === 1 && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) {
      d.moved = true;
      box.current?.setPointerCapture(e.pointerId);
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && box.current) {
      const [a, b] = [...pointers.current.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      const r = box.current.getBoundingClientRect();
      if (d.pinch > 0 && span > 0) zoom(span / d.pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      d.pinch = span;
    } else {
      change((v) => ({ scale: v.scale, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    const moved = drag.current?.moved;
    drag.current = null;
    if (!moved) return;
    // The click that ends a drag is not a click on whatever card the pointer happens to be over.
    const stop = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const move: Record<string, [number, number]> = { ArrowLeft: [PAN, 0], ArrowRight: [-PAN, 0], ArrowUp: [0, PAN], ArrowDown: [0, -PAN] };
    if (move[e.key]) change((v) => ({ scale: v.scale, x: v.x + move[e.key][0], y: v.y + move[e.key][1] }));
    else if (e.key === '+' || e.key === '=') zoom(STEP);
    else if (e.key === '-' || e.key === '_') zoom(1 / STEP);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
  };

  // A card focused by Tab while out of sight is brought into the frame.
  const onFocus = (e: React.FocusEvent) => {
    const b = box.current;
    if (!b || e.target === b || !(e.target instanceof HTMLElement) || !e.target.matches(':focus-visible')) return;
    const r = e.target.getBoundingClientRect();
    const o = b.getBoundingClientRect();
    const next = reveal(viewRef.current, { w: b.clientWidth, h: b.clientHeight }, { left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top });
    if (next.x !== viewRef.current.x || next.y !== viewRef.current.y) {
      touched.current = true;
      setView(next);
    }
  };

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.current?.requestFullscreen?.().catch(() => undefined);
  };
  const canFull = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  return (
    <div className="sc-sandbox" ref={wrap}>
      <div className="sc-sandbox-bar" role="group" aria-label="Zoom the lineage tree">
        <button type="button" onClick={() => zoom(1 / STEP)} disabled={view.scale <= MIN_SCALE} aria-label="Zoom out">
          −
        </button>
        <output aria-label="Zoom">{Math.round(view.scale * 100)}%</output>
        <button type="button" onClick={() => zoom(STEP)} disabled={view.scale >= MAX_SCALE} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={fit}>
          Fit
        </button>
        {canFull && (
          <button type="button" onClick={toggleFull} aria-pressed={full}>
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
        )}
      </div>
      <div
        className="sc-sandbox-box"
        ref={box}
        tabIndex={0}
        role="group"
        aria-label="Lineage tree"
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        <div className="sc-sandbox-inner" ref={inner} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <TreeNode node={root} steps={steps} />
        </div>
      </div>
      <p className="sc-sandbox-hint" id={hintId}>
        Drag to move. Ctrl + scroll or pinch to zoom; click the tree first and the wheel zooms by itself. Keys: arrows move, + and − zoom,
        0 fits.
      </p>
    </div>
  );
}
