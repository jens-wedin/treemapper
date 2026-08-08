import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './useReducedMotion';

export interface Viewport { x: number; y: number; k: number }
export interface ChartBounds { minX: number; maxX: number; minY: number; maxY: number }

// The viewBox is the container in CSS pixels, so scale 1 means "content at its
// designed size" no matter how large the chart is. A viewBox spanning the whole
// content would shrink a wide chart to unreadable and cap zoom far too low.
export const MIN_K = 0.04;
export const MAX_K = 3;
export const ZOOM_STEP = 1.25;
const EDGE_MARGIN = 70;

/**
 * Wheel zoom, in proportion to how far the wheel actually turned.
 *
 * A fixed factor per event is what makes a trackpad feel wild: two fingers
 * produce a stream of tiny events, and each one used to count as much as a full
 * notch of a mouse wheel. Scaling by the distance instead means a nudge zooms a
 * little and a shove zooms a lot.
 */
const WHEEL_STRENGTH = 0.0022;
/** A pinch is a deliberate gesture and may move faster. */
const PINCH_STRENGTH = 0.01;
/** However violent one event is, it cannot leap more than this. */
const MAX_WHEEL_STEP = 1.1;
/** A line of scrolling in pixels, for mice that report lines rather than pixels. */
const LINE_HEIGHT = 16;
/** How long the eased transform lasts after a button press. */
export const ZOOM_EASE_MS = 220;

/**
 * Throwing the canvas.
 *
 * Letting go while still moving carries on and slows down, the way a flicked
 * list does on a phone. The speed decays exponentially rather than linearly:
 * a linear stop has a visible moment where it just quits, while an exponential
 * one keeps easing off to nothing — `TAU` is how long it takes to fall to about
 * a third, so a throw travels roughly `speed × TAU` pixels.
 */
const FLING_TAU = 200;
/** Below this the pointer was being placed, not thrown (px per ms). */
const FLING_MIN_SPEED = 0.22;
/** Where the glide gives up rather than crawling to a mathematical halt. */
const FLING_STOP_SPEED = 0.02;
/** Velocity is measured over the tail of the drag, not the whole of it. */
const FLING_SAMPLE_MS = 90;
/** One slow frame must not be read as one huge step. */
const MAX_FRAME_MS = 32;

/**
 * The same throw, applied to zoom.
 *
 * Scale is multiplicative, so the speed is measured in **log units per
 * millisecond** — that is what makes zooming out coast exactly as far as
 * zooming in, instead of stalling near the small end where a linear rate would
 * have almost nothing left to subtract.
 *
 * The coast starts only once wheel events stop arriving. A trackpad already
 * sends its own decaying events after the fingers lift; beginning while those
 * are still coming would put one tail on top of another.
 */
const ZOOM_FLING_TAU = 60;
const ZOOM_GESTURE_END_MS = 80;
/** Below this the wheel was nudged, not spun (log units per ms). */
const ZOOM_MIN_RATE = 0.0012;
const ZOOM_STOP_RATE = 0.00005;
/**
 * However hard the wheel is spun, the tail stays a tail. Uncapped, a fast spin
 * coasts further than the gesture itself — at 0.006 the most it can add is
 * about 40 %, which reads as easing to a stop rather than carrying on zooming.
 */
const ZOOM_MAX_RATE = 0.006;

interface Sample { t: number; x: number; y: number }
interface ZoomSample { t: number; logK: number }

/** Pixels per millisecond over the last few moves, or null if barely moving. */
function velocityOf(samples: Sample[]): { x: number; y: number } | null {
  const last = samples[samples.length - 1];
  if (!last) return null;
  const first = samples.find(s => last.t - s.t <= FLING_SAMPLE_MS) ?? samples[0]!;
  const dt = last.t - first.t;
  if (dt < 8) return null;                 // too brief to tell speed from noise
  const v = { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
  return Math.hypot(v.x, v.y) >= FLING_MIN_SPEED ? v : null;
}

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
  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number } | null>(null);
  const adjusted = useRef(false);   // has the user panned/zoomed since the last fit?

  const [size, setSize] = useState({ w: 900, h: 600 });
  const [view, setView] = useState<Viewport>({ x: 450, y: 300, k: 1 });
  // A button press is one jump, so it glides. Wheel and drag are continuous and
  // must not: a transition would leave the chart lagging behind the pointer.
  const [eased, setEased] = useState(false);
  const easeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fling = useRef(0);                 // rAF id while the canvas coasts
  const samples = useRef<Sample[]>([]);
  const zoomFling = useRef(0);             // rAF id while the zoom coasts
  const zoomSamples = useRef<ZoomSample[]>([]);
  const zoomEnd = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zoomAnchor = useRef({ x: 0, y: 0 });

  const stopFling = useCallback(() => {
    cancelAnimationFrame(fling.current);
    fling.current = 0;
    cancelAnimationFrame(zoomFling.current);
    zoomFling.current = 0;
    clearTimeout(zoomEnd.current);
    zoomSamples.current = [];
  }, []);
  useEffect(() => stopFling, [stopFling]);

  const glide = useCallback(() => {
    clearTimeout(easeTimer.current);
    setEased(true);
    easeTimer.current = setTimeout(() => setEased(false), ZOOM_EASE_MS);
  }, []);
  useEffect(() => () => clearTimeout(easeTimer.current), []);

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

  /**
   * Keeps the current pan and zoom across the next change of bounds. Expanding
   * a branch grows the chart, and re-fitting it would shove the person you just
   * clicked across the screen.
   */
  const holdView = useCallback(() => { adjusted.current = true; }, []);

  /**
   * Carry on from the speed the pointer had when it let go, slowing to a stop.
   * Skipped entirely under reduced motion: the pan itself still works, it just
   * ends where the finger did.
   */
  const throwCanvas = useCallback((vx: number, vy: number) => {
    if (reduced) return;
    let x = vx;
    let y = vy;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(MAX_FRAME_MS, now - last);
      last = now;
      setView(v => ({ ...v, x: v.x + x * dt, y: v.y + y * dt }));
      const decay = Math.exp(-dt / FLING_TAU);
      x *= decay;
      y *= decay;
      fling.current = Math.hypot(x, y) > FLING_STOP_SPEED ? requestAnimationFrame(step) : 0;
    };
    fling.current = requestAnimationFrame(step);
  }, [reduced]);

  const zoomAround = useCallback((factor: number, px: number, py: number) => {
    adjusted.current = true;
    setView(v => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      if (k === v.k) return v;
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });
  }, []);

  /** Carry the zoom on from the rate the wheel had when it stopped. */
  const throwZoom = useCallback((rate: number) => {
    if (reduced) return;
    let r = Math.sign(rate) * Math.min(Math.abs(rate), ZOOM_MAX_RATE);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(MAX_FRAME_MS, now - last);
      last = now;
      setView(v => {
        const k = Math.min(MAX_K, Math.max(MIN_K, v.k * Math.exp(r * dt)));
        if (k === v.k) return v;                 // sitting against a zoom limit
        const { x, y } = zoomAnchor.current;
        return { k, x: x - (x - v.x) * (k / v.k), y: y - (y - v.y) * (k / v.k) };
      });
      r *= Math.exp(-dt / ZOOM_FLING_TAU);
      // The decaying rate alone decides when to stop. Asking whether the last
      // frame actually moved cannot work here — that is only known once React
      // runs the updater, which happens after this line.
      zoomFling.current = Math.abs(r) > ZOOM_STOP_RATE ? requestAnimationFrame(step) : 0;
    };
    zoomFling.current = requestAnimationFrame(step);
  }, [reduced]);

  // React's synthetic wheel handler is passive — attach a real one to preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      // deltaMode says what the numbers mean: 0 pixels, 1 lines, 2 pages.
      const distance = e.deltaY * (e.deltaMode === 1 ? LINE_HEIGHT : e.deltaMode === 2 ? rect.height : 1);
      // A trackpad pinch arrives as ctrl+wheel, and should feel direct.
      const factor = Math.exp(-distance * (e.ctrlKey ? PINCH_STRENGTH : WHEEL_STRENGTH));
      const step = Math.min(MAX_WHEEL_STEP, Math.max(1 / MAX_WHEEL_STEP, factor));
      // No easing here: continuous input has to track the fingers exactly, and
      // a transition would always be chasing the last event.
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      cancelAnimationFrame(zoomFling.current);   // a new turn takes over from the coast
      zoomFling.current = 0;
      zoomAnchor.current = { x: px, y: py };
      zoomAround(step, px, py);

      // Rate over the tail of the gesture, in log units per millisecond.
      const now = e.timeStamp;
      const previous = zoomSamples.current[zoomSamples.current.length - 1];
      zoomSamples.current.push({ t: now, logK: (previous?.logK ?? 0) + Math.log(step) });
      zoomSamples.current = zoomSamples.current.filter(s => now - s.t <= FLING_SAMPLE_MS * 2);

      clearTimeout(zoomEnd.current);
      zoomEnd.current = setTimeout(() => {
        const list = zoomSamples.current;
        zoomSamples.current = [];
        const last = list[list.length - 1];
        const first = list.find(s => last && last.t - s.t <= FLING_SAMPLE_MS) ?? list[0];
        if (!last || !first) return;
        const dt = last.t - first.t;
        if (dt < 8) return;
        const rate = (last.logK - first.logK) / dt;
        console.log('DIAG rate', rate, 'samples', list.length, 'dt', dt);
        if (Math.abs(rate) >= ZOOM_MIN_RATE) throwZoom(rate);
      }, ZOOM_GESTURE_END_MS);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAround, throwZoom]);

  /** Zoom by a step, keeping a content-space point (default: the centre) still. */
  const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    stopFling();
    glide();
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
    stopFling();
    glide();
    setView(fit);
  }, [fit, glide, stopFling]);

  /** Keeps a content-space point inside the viewport (keyboard navigation). */
  const ensureVisible = useCallback((x: number, y: number) => {
    stopFling();                 // arrow keys take over from a throw at once
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
      clearTimeout(easeTimer.current);
      setEased(false);            // dragging must stay glued to the pointer
      stopFling();                // catching it mid-throw stops it dead
      drag.current = { px: e.clientX, py: e.clientY };
      samples.current = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.px;
      const dy = e.clientY - drag.current.py;
      drag.current = { px: e.clientX, py: e.clientY };
      adjusted.current = true;
      // Only the tail of the drag decides the throw — an earlier pause should
      // not slow down a flick that ends fast.
      samples.current.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      samples.current = samples.current.filter(s => e.timeStamp - s.t <= FLING_SAMPLE_MS * 2);
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    },
    onPointerUp: () => {
      drag.current = null;
      const v = velocityOf(samples.current);
      samples.current = [];
      if (v) throwCanvas(v.x, v.y);
    },
  };

  return {
    wrapRef, svgRef, size, view,
    zoomPercent: Math.round(view.k * 100),
    zoomBy, reset, ensureVisible, markFresh, holdView, svgProps,
    transform: `translate(${view.x} ${view.y}) scale(${view.k})`,
    /** Put on the transformed <g>: glides a button's jump, nothing else. */
    transformClass: eased ? 'chart-zoom' : undefined,
  };
}
