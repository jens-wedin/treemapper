import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MORPH_MS, SWITCH_MS } from '../lib/useChartTransitions';
import { usePrefersReducedMotion } from '../lib/useReducedMotion';

/**
 * Cross-fades one chart into the next instead of cutting between them.
 *
 * The chart that is leaving stays mounted for the length of the transition,
 * stacked on the one arriving. It is `aria-hidden` and `inert` throughout: a
 * screen reader must never find two trees, keyboard focus must never land in
 * the one on its way out, and a test looking for "the chart" must keep finding
 * exactly one.
 *
 * `morphing` hands the choreography to the longer morph: the outgoing chart is
 * gone within the first quarter and the incoming one only appears in the last,
 * leaving the middle to the travelling markers. It is a different pair of CSS
 * animations rather than opacity threaded through JavaScript per frame.
 *
 * `overlay` is given the measured box, since this component owns it.
 */
export default function ChartSwitcher({ viewKey, morphing = false, overlay, children }: {
  viewKey: string;
  morphing?: boolean;
  overlay?: (size: { w: number; h: number }) => React.ReactNode;
  children: React.ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The mode is captured when the transition starts. Reading `morphing` later
  // would let the classes flip mid-flight, when the morph reports itself done a
  // frame before or after this timer.
  const [leaving, setLeaving] = useState<{ key: string; node: React.ReactNode; morph: boolean } | null>(null);
  const shown = useRef<{ key: string; node: React.ReactNode }>({ key: viewKey, node: children });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0) setSize({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previous = shown.current;
    shown.current = { key: viewKey, node: children };
    if (previous.key === viewKey || reduced) return;

    setLeaving({ ...previous, morph: morphing });
    const timer = setTimeout(() => setLeaving(null), morphing ? MORPH_MS : SWITCH_MS);
    return () => clearTimeout(timer);
    // The node travels with the key; re-running for every render of the same
    // view would restart the fade for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, reduced]);

  const enter = leaving?.morph ? 'chart-entering-morph' : 'chart-entering';
  const leave = leaving?.morph ? 'chart-leaving-morph' : 'chart-leaving';

  return (
    // min-w-0 matters: without it this flex item refuses to shrink below its
    // content, so opening the person panel widens the row past the viewport and
    // scrolls the heading and tabs off the side.
    <div ref={boxRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {leaving && (
        <div aria-hidden="true" inert className={`${leave} absolute inset-0 flex flex-col`}>
          {leaving.node}
        </div>
      )}
      <div key={viewKey} className={`flex min-h-0 flex-1 flex-col ${leaving ? enter : ''}`}>
        {children}
      </div>
      {overlay && size.w > 0 && overlay(size)}
    </div>
  );
}
