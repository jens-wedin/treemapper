import { useEffect, useRef, useState } from 'react';
import { SWITCH_MS } from '../lib/useChartTransitions';
import { usePrefersReducedMotion } from '../lib/useReducedMotion';

/**
 * Cross-fades one chart into the next instead of cutting between them.
 *
 * The chart that is leaving stays mounted for the length of the fade, stacked
 * on the one arriving. It is `aria-hidden` and `inert` throughout: a screen
 * reader must never find two trees, keyboard focus must never land in the one
 * on its way out, and a test looking for "the chart" must keep finding exactly
 * one.
 *
 * `morphing` hands the timing over to AncestorMorph, which runs longer and
 * fades the charts itself — without this the two animations would run over each
 * other.
 */
export default function ChartSwitcher({ viewKey, morphing = false, children }: {
  viewKey: string;
  morphing?: boolean;
  children: React.ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const [leaving, setLeaving] = useState<{ key: string; node: React.ReactNode } | null>(null);
  const shown = useRef<{ key: string; node: React.ReactNode }>({ key: viewKey, node: children });

  useEffect(() => {
    const previous = shown.current;
    shown.current = { key: viewKey, node: children };
    if (previous.key === viewKey || reduced || morphing) return;

    setLeaving(previous);
    const timer = setTimeout(() => setLeaving(null), SWITCH_MS);
    return () => clearTimeout(timer);
    // The node is captured with the key; re-running on every render of the same
    // view would restart the fade for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, reduced, morphing]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {leaving && (
        <div aria-hidden="true" inert className="chart-leaving absolute inset-0 flex flex-col">
          {leaving.node}
        </div>
      )}
      <div key={viewKey} className={leaving ? 'chart-entering flex min-h-0 flex-1 flex-col' : 'flex min-h-0 flex-1 flex-col'}>
        {children}
      </div>
    </div>
  );
}
