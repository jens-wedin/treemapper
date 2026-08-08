import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TreeData } from '../../lib/tree';
import { t, displayName } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import { applyExpansions, type Expansion } from '../lib/treeGraft';
import {
  layoutTree, NODE_W, NODE_H, TREE_HANDLE_R,
  type TreeEdge, type TreeHandle, type PositionedNode,
} from '../lib/treeLayout';
import { useChartViewport } from '../lib/useChartViewport';
import { useChartTransitions } from '../lib/useChartTransitions';
import { useFlagPreference, useIssueMarkPreference } from '../lib/chartPreferences';
import { useIssueMarks } from '../lib/issueMarks';
import PersonCard, { cardLabel } from './PersonCard';
import ChartZoom from './ChartZoom';

/** Generations added by one click, in whichever direction was clicked. */
const EXPAND_BY = 2;

const linkKey = (l: TreeEdge) => `${l.type ?? 'parent'}:${l.x1},${l.y1},${l.x2},${l.y2}`;

const edgePath = (l: TreeEdge) => (l.type === 'marriage'
  // straight bar joining the two cards of a couple
  ? `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`
  : `M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`);

export default function TreeChart({ data, onSelect, selectedId }: {
  data: TreeData;
  /** A card was activated — the page opens the details panel. */
  onSelect: (personId: string) => void;
  selectedId: string | null;
}) {
  // Branches opened by hand, keyed by the handle that opened them. Insertion
  // order matters: one opened inside another only grafts after its host.
  const [opened, setOpened] = useState<Map<string, Expansion>>(() => new Map());
  const [pending, setPending] = useState<string | null>(null);
  const [justOpened, setJustOpened] = useState<TreeHandle | null>(null);

  // A new focus person or depth is a different chart; opened branches go with it.
  useEffect(() => { setOpened(new Map()); }, [data]);

  const grafted = useMemo(() => applyExpansions(data, opened.values()), [data, opened]);
  const layout = useMemo(() => layoutTree(grafted, new Set(opened.keys())), [grafted, opened]);

  const viewport = useChartViewport(layout.bounds);
  const [showFlags] = useFlagPreference();
  const [showIssues] = useIssueMarkPreference();
  const issueMarks = useIssueMarks(showIssues);
  const [activeKey, setActiveKey] = useState('focus');

  const { entering, ghosts, hasGhosts, markFolding, smoothPan, panSmoothly, cancelPan } =
    useChartTransitions(layout.nodes, layout.links, linkKey);

  // Only a genuinely different chart resets the keyboard position — unfolding a
  // branch should leave you where you were.
  useEffect(() => { setActiveKey('focus'); }, [data]);

  const { holdView, ensureVisible } = viewport;
  const expand = useCallback(async (handle: TreeHandle) => {
    setPending(handle.key);
    try {
      const [up, down] = handle.direction === 'up' ? [EXPAND_BY, 0] : [0, EXPAND_BY];
      const branch = await fetchJson<TreeData>(`/api/tree/${handle.person.id}?up=${up}&down=${down}`);
      holdView();
      setOpened(prev => new Map(prev).set(handle.key, {
        direction: handle.direction, path: handle.path, branch,
      }));
      setJustOpened(handle);
    } finally {
      setPending(null);
    }
  }, [holdView]);

  const collapse = useCallback((handle: TreeHandle) => {
    holdView();
    markFolding();
    setOpened(prev => {
      const next = new Map(prev);
      next.delete(handle.key);
      return next;
    });
  }, [holdView, markFolding]);

  // Keep the zoom, but pan far enough that what was just opened is on screen.
  // The target is the *nearest* new generation, not the furthest: two
  // generations of descendants are a deep, wide fan, and chasing its far edge
  // would scroll the person you clicked off the screen entirely.
  useEffect(() => {
    if (!justOpened) return;
    setJustOpened(null);
    const beyond = justOpened.direction === 'up'
      ? layout.nodes.filter(n => n.y < justOpened.y)
      : layout.nodes.filter(n => n.y > justOpened.y);
    const nearest = beyond.reduce<PositionedNode | undefined>(
      (near, n) => (!near || Math.abs(n.y - justOpened.y) < Math.abs(near.y - justOpened.y) ? n : near), undefined,
    );
    if (!nearest) return;
    panSmoothly();
    ensureVisible(nearest.x, nearest.y + (justOpened.direction === 'up' ? -NODE_H / 2 : NODE_H / 2));
  }, [justOpened, layout, ensureVisible, panSmoothly]);

  function moveFocus(key: string | undefined) {
    if (!key) return;
    const target = layout.nodes.find(n => n.key === key) ?? layout.handles.find(h => h.key === key);
    setActiveKey(key);
    viewport.svgRef.current?.querySelector<SVGGElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus();
    if (target) viewport.ensureVisible(target.x, target.y);
  }

  /** `activate` is what Enter and Space do: open a card, or work a handle. */
  function onNodeKeyDown(e: React.KeyboardEvent, key: string, activate: () => void) {
    const nav = layout.nav[key] ?? {};
    const actions: Record<string, () => void> = {
      ArrowUp: () => moveFocus(nav.up),
      ArrowDown: () => moveFocus(nav.down),
      ArrowLeft: () => moveFocus(nav.left),
      ArrowRight: () => moveFocus(nav.right),
      Enter: activate,
      ' ': activate,
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  const focusNode = layout.nodes.find(n => n.isFocus);
  const work = (h: TreeHandle) => (h.action === 'expand' ? expand(h) : collapse(h));

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <p id="trad-instruktioner" className="sr-only">{`${t('tree.instructionsPanel')} ${t('tree.expandHintFamily')}`}</p>
      <div ref={viewport.wrapRef} className="relative mt-2 min-h-[320px] w-full flex-1 overflow-hidden rounded-lg border bg-[var(--chart-canvas)]">
        <svg
          ref={viewport.svgRef}
          role="group"
          aria-label={t('tree.chartLabel')}
          aria-describedby="trad-instruktioner"
          className="cursor-grab touch-none active:cursor-grabbing"
          {...viewport.svgProps}
          onPointerDown={e => {
            cancelPan();                  // dragging must not lag behind the pointer
            viewport.svgProps.onPointerDown(e);
          }}
        >
          <g transform={viewport.transform} className={smoothPan ? 'chart-pan' : undefined}>
            {/* Cards and lines folded away a moment ago, on their way out.
                Mounted only while they exist, so the fade starts when they do. */}
            {hasGhosts && (
              <g aria-hidden className="chart-node-leave">
                {ghosts.links.map(l => (
                  <path
                    key={linkKey(l)}
                    d={edgePath(l)}
                    className="fill-none"
                    style={{ stroke: l.type === 'marriage' ? 'var(--chart-link-strong)' : 'var(--chart-link)' }}
                    strokeWidth={l.type === 'marriage' ? 1.5 : 1}
                  />
                ))}
                {ghosts.nodes.map(n => (
                  <g key={n.key} transform={`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`}>
                    <PersonCard
                      person={n.person}
                      variant="compact"
                      showFlag={showFlags}
                      isFocus={n.isFocus}
                      branch={n.branch}
                      idKey={`ghost-${n.key}`}
                      issue={issueMarks[n.person.id]}
                    />
                  </g>
                ))}
              </g>
            )}

            {layout.links.map(l => (
              <path
                key={linkKey(l)}
                aria-hidden
                d={edgePath(l)}
                className="fill-none"
                    style={{ stroke: l.type === 'marriage' ? 'var(--chart-link-strong)' : 'var(--chart-link)' }}
                strokeWidth={l.type === 'marriage' ? 1.5 : 1}
              />
            ))}
            {layout.nodes.map(n => (
              <g
                key={n.key}
                data-tree-node={n.person.id}
                data-node-key={n.key}
                tabIndex={n.key === activeKey ? 0 : -1}
                role="button"
                aria-label={cardLabel(n.person, issueMarks[n.person.id])}
                transform={`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`}
                className={`chart-node chart-card cursor-pointer outline-none ${entering.has(n.key) ? 'chart-node-enter' : ''}`}
                onClick={() => onSelect(n.person.id)}
                onFocus={() => setActiveKey(n.key)}
                onKeyDown={e => onNodeKeyDown(e, n.key, () => onSelect(n.person.id))}
              >
                <PersonCard
                  person={n.person}
                  variant="compact"
                  showFlag={showFlags}
                  isFocus={n.isFocus}
                  active={n.key === activeKey}
                  selected={n.person.id === selectedId}
                  branch={n.branch}
                  idKey={n.key}
                  issue={issueMarks[n.person.id]}
                />
              </g>
            ))}

            {/* ⌃ unfolds two more generations of parents, ⌄ two more of
                children; each turns into the opposite arrow once opened */}
            {layout.handles.map(h => {
              const opens = h.action === 'expand';
              const pointsUp = (h.direction === 'up') === opens;
              const label = opens
                ? (h.direction === 'up' ? 'tree.expandUp' : 'tree.expandDown')
                : (h.direction === 'up' ? 'tree.collapseUp' : 'tree.collapseDown');
              return (
                <g
                  key={h.key}
                  data-handle={h.person.id}
                  data-handle-direction={h.direction}
                  data-handle-action={h.action}
                  data-node-key={h.key}
                  tabIndex={h.key === activeKey ? 0 : -1}
                  role="button"
                  aria-label={t(label).replace('{name}', displayName(h.person))}
                  aria-busy={pending === h.key || undefined}
                  transform={`translate(${h.x} ${h.y})`}
                  className="chart-node group cursor-pointer outline-none"
                  onClick={() => work(h)}
                  onFocus={() => setActiveKey(h.key)}
                  onKeyDown={e => onNodeKeyDown(e, h.key, () => work(h))}
                >
                  <circle
                    r={TREE_HANDLE_R}
                    strokeWidth={h.key === activeKey ? 2.5 : 1.25}
                    className={`fill-[var(--card-fill)] group-hover:fill-blue-500/15 ${
                      h.key === activeKey ? 'stroke-amber-500' : 'stroke-[var(--chart-link-strong)] group-hover:stroke-blue-500'
                    }`}
                  />
                  <path
                    d={pointsUp ? 'M -4.5 2.5 L 0 -2.5 L 4.5 2.5' : 'M -4.5 -2.5 L 0 2.5 L 4.5 -2.5'}
                    className={`fill-none group-hover:stroke-blue-500 ${
                      pending === h.key ? 'stroke-muted-foreground/40' : 'stroke-foreground/70'
                    }`}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
          </g>
        </svg>
        <ChartZoom zoomPercent={viewport.zoomPercent} onZoom={factor => viewport.zoomBy(factor, focusNode)} onReset={viewport.reset} />
      </div>
    </div>
  );
}
