import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Keep in step with the durations in index.css. */
export const GLIDE_MS = 340;
export const FADE_OUT_MS = 200;
/** Cross-fading one chart for another. */
export const SWITCH_MS = 240;
/** Winding the antavla's columns into the solfjäder's rings. */
export const MORPH_MS = 420;

interface Keyed { key: string }
interface Snapshot<N, L> { nodes: N[]; links: L[] }

/**
 * Bookkeeping for animating a chart that grows and shrinks in place.
 *
 * Unfolding a branch re-flows the whole layout, so three things happen at once:
 * cards that stay glide to their new places (a CSS transition, no help needed
 * here), new ones fade in, and folded-away ones have to linger for a moment —
 * otherwise they vanish in the same frame the survivors start moving, which
 * reads as a glitch rather than a fold.
 *
 * Folding is opt-in via `markFolding` so that switching to a different person
 * entirely does not leave the old chart hanging around as ghosts.
 */
export function useChartTransitions<N extends Keyed, L>(
  nodes: N[], links: L[], linkKey: (link: L) => string,
) {
  const empty = useRef<Snapshot<N, L>>({ nodes: [], links: [] }).current;
  const previous = useRef<Snapshot<N, L>>(empty);
  const folding = useRef(false);
  const [ghosts, setGhosts] = useState<Snapshot<N, L>>(empty);
  const [smoothPan, setSmoothPan] = useState(false);

  const entering = useMemo(
    () => new Set(nodes.filter(n => !previous.current.nodes.some(p => p.key === n.key)).map(n => n.key)),
    [nodes],
  );

  useEffect(() => {
    const before = previous.current;
    previous.current = { nodes, links };
    if (!folding.current) return;
    folding.current = false;

    const gone: Snapshot<N, L> = {
      nodes: before.nodes.filter(n => !nodes.some(m => m.key === n.key)),
      links: before.links.filter(l => !links.some(m => linkKey(m) === linkKey(l))),
    };
    if (!gone.nodes.length && !gone.links.length) return;
    setGhosts(gone);
    const timer = setTimeout(() => setGhosts(empty), FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [nodes, links, linkKey, empty]);

  // The eased pan is only for revealing what was just opened: dragging must
  // stay glued to the pointer, so the caller cancels it on pointer down.
  useEffect(() => {
    if (!smoothPan) return;
    const timer = setTimeout(() => setSmoothPan(false), GLIDE_MS);
    return () => clearTimeout(timer);
  }, [smoothPan]);

  return {
    entering,
    ghosts,
    hasGhosts: ghosts.nodes.length > 0 || ghosts.links.length > 0,
    markFolding: useCallback(() => { folding.current = true; }, []),
    smoothPan,
    panSmoothly: useCallback(() => setSmoothPan(true), []),
    cancelPan: useCallback(() => setSmoothPan(false), []),
  };
}
