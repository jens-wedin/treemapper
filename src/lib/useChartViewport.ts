import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface Viewport { x: number; y: number; k: number }
export interface ChartBounds { minX: number; maxX: number; minY: number; maxY: number }

// The viewBox is the container in CSS pixels, so scale 1 means "content at its
// designed size" no matter how large the chart is. A viewBox spanning the whole
// content would shrink a wide chart to unreadable and cap zoom far too low.
export const MIN_K = 0.04;
export const MAX_K = 3;
export const ZOOM_STEP = 1.25;
const EDGE_MARGIN = 70;

/** Scale and offset that bring the whole chart into view, centred. */
export function computeFit(bounds: ChartBounds, size: { w: number; h: number }, minK = MIN_K, maxK = MAX_K): Viewport {
  const contentW = Math.max(bounds.maxX - bounds.minX, 1);
  const contentH = Math.max(bounds.maxY - bounds.minY, 1);
  const k = Math.min(maxK, Math.max(minK, Math.min(size.w / contentW, size.h / contentH, 1)));
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreY = (bounds.minY + bounds.maxY) / 2;
  return { k, x: size.w / 2 - centreX * k, y: size.h / 2 - centreY * k };
}

/**
 * Pan, zoom and fit for an SVG chart — shared by the family, pedigree and fan
 * views so they all behave the same way.
 */
export function useChartViewport(bounds: ChartBounds) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number } | null>(null);
  const adjusted = useRef(false);   // has the user panned/zoomed since the last fit?

  const [size, setSize] = useState({ w: 900, h: 600 });
  const [view, setView] = useState<Viewport>({ x: 450, y: 300, k: 1 });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0) setSize({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = useMemo(() => computeFit(bounds, size), [bounds, size]);

  // Fit on new content or a resize, but never yank the view out from under
  // someone who has already zoomed or panned.
  useEffect(() => {
    if (!adjusted.current) setView(fit);
  }, [fit]);

  const markFresh = useCallback(() => { adjusted.current = false; }, []);

  const zoomAround = useCallback((factor: number, px: number, py: number) => {
    adjusted.current = true;
    setView(v => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      if (k === v.k) return v;
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });
  }, []);

  // React's synthetic wheel handler is passive — attach a real one to preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAround(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  /** Zoom by a step, keeping a content-space point (default: the centre) still. */
  const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    setView(v => {
      const sx = anchor ? anchor.x * v.k + v.x : size.w / 2;
      const sy = anchor ? anchor.y * v.k + v.y : size.h / 2;
      const inside = sx >= 0 && sx <= size.w && sy >= 0 && sy <= size.h;
      const px = inside ? sx : size.w / 2;
      const py = inside ? sy : size.h / 2;
      adjusted.current = true;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      if (k === v.k) return v;
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });
  }, [size]);

  const reset = useCallback(() => {
    adjusted.current = false;
    setView(fit);
  }, [fit]);

  /** Keeps a content-space point inside the viewport (keyboard navigation). */
  const ensureVisible = useCallback((x: number, y: number) => {
    setView(v => {
      const sx = x * v.k + v.x;
      const sy = y * v.k + v.y;
      let nx = v.x;
      let ny = v.y;
      if (sx < EDGE_MARGIN) nx += EDGE_MARGIN - sx;
      else if (sx > size.w - EDGE_MARGIN) nx -= sx - (size.w - EDGE_MARGIN);
      if (sy < EDGE_MARGIN) ny += EDGE_MARGIN - sy;
      else if (sy > size.h - EDGE_MARGIN) ny -= sy - (size.h - EDGE_MARGIN);
      if (nx === v.x && ny === v.y) return v;
      adjusted.current = true;
      return { ...v, x: nx, y: ny };
    });
  }, [size]);

  const svgProps = {
    viewBox: `0 0 ${size.w} ${size.h}`,
    width: size.w,
    height: size.h,
    onPointerDown: (e: React.PointerEvent) => {
      drag.current = { px: e.clientX, py: e.clientY };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.px;
      const dy = e.clientY - drag.current.py;
      drag.current = { px: e.clientX, py: e.clientY };
      adjusted.current = true;
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    },
    onPointerUp: () => { drag.current = null; },
  };

  return {
    wrapRef, svgRef, size, view,
    zoomPercent: Math.round(view.k * 100),
    zoomBy, reset, ensureVisible, markFresh, svgProps,
    transform: `translate(${view.x} ${view.y}) scale(${view.k})`,
  };
}
