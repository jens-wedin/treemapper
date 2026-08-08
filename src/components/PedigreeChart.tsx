import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AncestorNode, TreeData } from '../../lib/tree';
import { t, displayName } from '../lib/i18n';
import { fetchJson } from '../lib/api';
import { flattenAncestors, graftAt, type AncestorSlot } from '../lib/ahnentafel';
import {
  layoutPedigree, PED_W, PED_H, HANDLE_R, type PedigreeLink, type PedigreeNode,
} from '../lib/pedigreeLayout';
import { useChartViewport } from '../lib/useChartViewport';
import { useChartTransitions } from '../lib/useChartTransitions';
import { useFlagPreference, useIssueMarkPreference } from '../lib/chartPreferences';
import { useIssueMarks } from '../lib/issueMarks';
import PersonCard, { cardLabel } from './PersonCard';
import ChartZoom from './ChartZoom';

/** Generations added by one ▸ click: the parents and their parents. */
const EXPAND_BY = 2;

const linkKey = (link: PedigreeLink) => link.path;

/** Is this slot somewhere above `host` in the chart — i.e. inside its branch? */
function isAbove(slot: number, host: number): boolean {
  let n = Math.floor(slot / 2);
  while (n > host) n = Math.floor(n / 2);
  return n === host;
}

export default function PedigreeChart({ data, generations, onSelect, selectedId }: {
  data: TreeData;
  generations: number;
  onSelect: (personId: string) => void;
  selectedId: string | null;
}) {
  // Branches opened by hand, keyed by the Ahnentafel slot they hang under.
  // Insertion order matters: a branch opened inside another one can only be
  // grafted after its host.
  const [opened, setOpened] = useState<Map<number, AncestorNode>>(() => new Map());
  const [pending, setPending] = useState<number | null>(null);
  const [justOpened, setJustOpened] = useState<number | null>(null);

  // A new focus person or depth is a different chart; opened branches go with it.
  useEffect(() => { setOpened(new Map()); }, [data, generations]);

  const slots = useMemo(() => {
    const byNumber = new Map<number, AncestorSlot>();
    for (const slot of flattenAncestors(data.ancestors, generations)) byNumber.set(slot.ahnentafel, slot);
    for (const [under, branch] of opened) {
      if (!byNumber.has(under)) continue;              // its host was folded away
      for (const slot of graftAt(under, flattenAncestors(branch, EXPAND_BY))) {
        byNumber.set(slot.ahnentafel, slot);
      }
    }
    return [...byNumber.values()].sort((a, b) => a.ahnentafel - b.ahnentafel);
  }, [data, generations, opened]);

  const expandedSlots = useMemo(
    () => new Set([...opened.keys()].filter(n => slots.some(s => s.ahnentafel === n))),
    [opened, slots],
  );
  const layout = useMemo(() => layoutPedigree(slots, expandedSlots), [slots, expandedSlots]);

  const viewport = useChartViewport(layout.bounds);
  const [showFlags] = useFlagPreference();
  const [showIssues] = useIssueMarkPreference();
  const issueMarks = useIssueMarks(showIssues);
  const [activeKey, setActiveKey] = useState('a1');

  const { entering, ghosts, hasGhosts, markFolding, smoothPan, panSmoothly, cancelPan } =
    useChartTransitions(layout.nodes, layout.links, linkKey);

  // Only a genuinely different chart resets the keyboard position — expanding a
  // branch should leave you where you were.
  useEffect(() => { setActiveKey('a1'); }, [data, generations]);

  const { holdView, ensureVisible } = viewport;
  const expand = useCallback(async (ahnentafel: number, personId: string) => {
    setPending(ahnentafel);
    try {
      const more = await fetchJson<TreeData>(`/api/tree/${personId}?up=${EXPAND_BY}&down=0`);
      holdView();
      setOpened(prev => new Map(prev).set(ahnentafel, more.ancestors));
      setJustOpened(ahnentafel);
    } finally {
      setPending(null);
    }
  }, [holdView]);

  // Keep the zoom, but pan far enough that the branch you just opened is on
  // screen — it can otherwise unfold past the right edge, out of sight. The
  // target is the nearest new column, so the card you clicked stays in view.
  useEffect(() => {
    if (justOpened == null) return;
    setJustOpened(null);
    const revealed = layout.nodes.filter(n => isAbove(n.ahnentafel, justOpened));
    const nearest = revealed.reduce<PedigreeNode | undefined>(
      (near, n) => (!near || n.x < near.x ? n : near), undefined,
    );
    if (!nearest) return;
    panSmoothly();
    ensureVisible(nearest.x + PED_W / 2, nearest.y);
  }, [justOpened, layout, ensureVisible, panSmoothly]);

  const collapse = useCallback((ahnentafel: number) => {
    holdView();
    markFolding();
    setOpened(prev => {
      const next = new Map(prev);
      next.delete(ahnentafel);
      return next;
    });
  }, [holdView, markFolding]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p id="trad-instruktioner" className="sr-only">{`${t('tree.instructionsAncestors')} ${t('tree.expandHint')}`}</p>
      <div ref={viewport.wrapRef} className="relative min-h-[320px] w-full flex-1 overflow-hidden rounded-lg border bg-[var(--chart-canvas)]">
        <svg
          ref={viewport.svgRef}
          role="group"
          aria-label={t('tree.pedigreeLabel')}
          aria-describedby="trad-instruktioner"
          className="cursor-grab touch-none active:cursor-grabbing"
          {...viewport.svgProps}
          onPointerDown={e => {
            cancelPan();                  // dragging must not lag behind the pointer
            viewport.svgProps.onPointerDown(e);
          }}
        >
          <g transform={viewport.transform} className={smoothPan ? 'chart-pan' : viewport.transformClass}>
            {/* Cards and elbows folded away a moment ago, on their way out.
                Mounted only while they exist, so the fade starts when they do. */}
            {hasGhosts && (
            <g aria-hidden className="chart-node-leave">
              {ghosts.links.map(l => (
                <path key={l.path} d={l.path} className="fill-none" style={{ stroke: 'var(--chart-link)' }} strokeWidth={1.25} />
              ))}
              {ghosts.nodes.map(n => (
                <g key={n.key} transform={`translate(${n.x - PED_W / 2} ${n.y - PED_H / 2})`}>
                  <PersonCard
                    person={n.person}
                    variant="wide"
                    showFlag={showFlags}
                    isFocus={n.isFocus}
                    branch={n.branch}
                    idKey={`ghost-${n.key}`}
                    issue={issueMarks[n.person.id]}
                    born={n.person.birthDate ?? (n.person.birthYear != null ? String(n.person.birthYear) : null)}
                    died={n.person.deathDate ?? (n.person.deathYear != null ? String(n.person.deathYear) : null)}
                  />
                </g>
              ))}
            </g>
            )}

            {layout.links.map(l => (
              <path key={l.path} aria-hidden d={l.path} className="fill-none" style={{ stroke: 'var(--chart-link)' }} strokeWidth={1.25} />
            ))}
            {layout.nodes.map(n => (
              <g
                key={n.key}
                data-tree-node={n.person.id}
                data-node-key={n.key}
                tabIndex={n.key === activeKey ? 0 : -1}
                role="button"
                aria-label={cardLabel(n.person, issueMarks[n.person.id])}
                transform={`translate(${n.x - PED_W / 2} ${n.y - PED_H / 2})`}
                className={`chart-node chart-card cursor-pointer outline-none ${entering.has(n.key) ? 'chart-node-enter' : ''}`}
                onClick={() => onSelect(n.person.id)}
                onFocus={() => setActiveKey(n.key)}
                onKeyDown={e => onNodeKeyDown(e, n.key, () => onSelect(n.person.id))}
              >
                <PersonCard
                  person={n.person}
                  variant="wide"
                  showFlag={showFlags}
                  isFocus={n.isFocus}
                  active={n.key === activeKey}
                  selected={n.person.id === selectedId}
                  branch={n.branch}
                  idKey={n.key}
                  issue={issueMarks[n.person.id]}
                  born={n.person.birthDate ?? (n.person.birthYear != null ? String(n.person.birthYear) : null)}
                  died={n.person.deathDate ?? (n.person.deathYear != null ? String(n.person.deathYear) : null)}
                />
              </g>
            ))}

            {/* ▸ opens the two generations above this person, ‹ folds them away */}
            {layout.handles.map(h => {
              const isPending = pending === h.ahnentafel;
              const label = h.action === 'expand' ? 'tree.expandLine' : 'tree.collapseLine';
              return (
                <g
                  key={h.key}
                  data-handle={h.person.id}
                  data-handle-action={h.action}
                  data-node-key={h.key}
                  tabIndex={h.key === activeKey ? 0 : -1}
                  role="button"
                  aria-label={t(label).replace('{name}', displayName(h.person))}
                  aria-busy={isPending || undefined}
                  transform={`translate(${h.x} ${h.y})`}
                  className="chart-node group cursor-pointer outline-none"
                  onClick={() => (h.action === 'expand' ? expand(h.ahnentafel, h.person.id) : collapse(h.ahnentafel))}
                  onFocus={() => setActiveKey(h.key)}
                  onKeyDown={e => onNodeKeyDown(e, h.key, () => (
                    h.action === 'expand' ? expand(h.ahnentafel, h.person.id) : collapse(h.ahnentafel)
                  ))}
                >
                  <circle
                    r={HANDLE_R}
                    strokeWidth={h.key === activeKey ? 2.5 : 1.25}
                    className={`fill-[var(--card-fill)] group-hover:fill-blue-500/15 ${
                      h.key === activeKey ? 'stroke-amber-500' : 'stroke-[var(--chart-link-strong)] group-hover:stroke-blue-500'
                    }`}
                  />
                  <path
                    d={h.action === 'expand' ? 'M -3 -5 L 3 0 L -3 5' : 'M 3 -5 L -3 0 L 3 5'}
                    className={`fill-none group-hover:stroke-blue-500 ${isPending ? 'stroke-muted-foreground/40' : 'stroke-foreground/70'}`}
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
