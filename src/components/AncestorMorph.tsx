import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BRANCH_COLORS } from '../lib/ahnentafel';
import { planMorph, type MorphPlan } from '../lib/ancestorMorph';
import { computeFit } from '../lib/useChartViewport';
import { MORPH_MS } from '../lib/useChartTransitions';
import type { PedigreeLayout } from '../lib/pedigreeLayout';
import type { FanLayout } from '../lib/fanLayout';

const MARK_W = 20;
const MARK_H = 12;
const DEG = 180 / Math.PI;
/** Of the run, spent fading the markers in at one end and out at the other. */
const HANDOVER = 0.15;

/**
 * Slow out, quick through the middle, slow in.
 *
 * The chart glides elsewhere use a pure ease-out, because they start the moment
 * you click. This one has a handover at both ends: the markers have to sit
 * still on their cards while the antavla fades, and settle onto their wedges
 * before the fan chart appears. An ease-out sent them 61 % of the way in the
 * first 21 % of the time, so they never appeared to leave anything.
 */
const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * How solid the markers are, as a share of **wall-clock** time — not of the
 * eased travel. The chart fades either side of them are CSS keyframes, which
 * run on wall time too; keying these to the eased value instead put the markers
 * into their fade-out before the charts had finished getting out of the way,
 * and the whole box looked empty.
 */
export const markerOpacity = (linear: number) =>
  // Gone a little before the end. The overlay is fitted to the whole box while
  // each chart fits its own SVG below its toolbar, so the last stretch is very
  // slightly off — better to hand over just before that shows.
  Math.max(0, Math.min(1, linear / HANDOVER, (0.9 - linear) / HANDOVER));

/**
 * The pedigree chart winding into the fan chart, and back.
 *
 * Only the position travels. A rectangle cannot become a wedge, and morphing
 * the shapes would mean rewriting both layouts against one parameterised
 * geometry — at the cost of the pedigree's portraits and the fan's labels
 * along arcs. Carrying the position keeps the part that means something: where
 * each person goes.
 *
 * Decoration, so `aria-hidden`: the chart it came from and the chart it becomes
 * are both announced in their own right.
 */
export default function AncestorMorph({ pedigree, fan, direction, size, onDone }: {
  pedigree: PedigreeLayout;
  fan: FanLayout;
  /** 'toFan' runs t from 0 to 1; 'toPedigree' runs it back. */
  direction: 'toFan' | 'toPedigree';
  size: { w: number; h: number };
  onDone: () => void;
}) {
  const [plan] = useState<MorphPlan>(() => planMorph(pedigree, fan));
  const [{ t, linear }, setProgress] = useState({ t: direction === 'toFan' ? 0 : 1, linear: 0 });
  const doneRef = useRef(onDone);

  useLayoutEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const linear = Math.min(1, (now - start) / MORPH_MS);
      const eased = ease(linear);
      setProgress({ t: direction === 'toFan' ? eased : 1 - eased, linear });
      if (linear < 1) raf = requestAnimationFrame(step);
      else doneRef.current();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [direction]);

  // Zoom from one chart's own fit to the other's, so the overlay is exactly the
  // size of the chart it replaces at the start and of the one it becomes at the
  // end — no shrinking away and popping back.
  const a = computeFit(plan.from, size);
  const b = computeFit(plan.to, size);
  const fit = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    k: a.k + (b.k - a.k) * t,
  };

  return (
    <svg
      aria-hidden="true"
      data-morph={direction}
      className="pointer-events-none absolute inset-0"
      viewBox={`0 0 ${size.w} ${size.h}`}
      width={size.w}
      height={size.h}
    >
      <g transform={`translate(${fit.x} ${fit.y}) scale(${fit.k})`} opacity={markerOpacity(linear)}>
        {plan.points(t).map(point => (
          <rect
            key={point.ahnentafel}
            x={-MARK_W / 2}
            y={-MARK_H / 2}
            width={MARK_W}
            height={MARK_H}
            rx={3}
            style={{ fill: BRANCH_COLORS[point.branch].stroke }}
            transform={`translate(${point.x} ${point.y}) rotate(${point.rotation * DEG})`}
          />
        ))}
      </g>
    </svg>
  );
}
