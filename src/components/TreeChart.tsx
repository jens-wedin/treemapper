import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { NODE_W, NODE_H, type TreeLayoutResult } from '../lib/treeLayout';
import { useChartViewport } from '../lib/useChartViewport';
import { useFlagPreference } from '../lib/flagPreference';
import PersonCard, { cardLabel } from './PersonCard';
import ChartToolbar from './ChartToolbar';

export default function TreeChart({ layout, onSelect, selectedId }: {
  layout: TreeLayoutResult;
  /** A card was activated — the page opens the details panel. */
  onSelect: (personId: string) => void;
  selectedId: string | null;
}) {
  const viewport = useChartViewport(layout.bounds);
  const [showFlags, setShowFlags] = useFlagPreference();
  const [activeKey, setActiveKey] = useState(() => layout.nodes.find(n => n.isFocus)!.key);

  useEffect(() => {
    setActiveKey(layout.nodes.find(n => n.isFocus)!.key);
  }, [layout]);

  function moveFocus(key: string | undefined) {
    if (!key) return;
    const node = layout.nodes.find(n => n.key === key);
    setActiveKey(key);
    viewport.svgRef.current?.querySelector<SVGGElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus();
    if (node) viewport.ensureVisible(node.x, node.y);
  }

  function onNodeKeyDown(e: React.KeyboardEvent, key: string, personId: string) {
    const nav = layout.nav[key] ?? {};
    const actions: Record<string, () => void> = {
      ArrowUp: () => moveFocus(nav.up),
      ArrowDown: () => moveFocus(nav.down),
      ArrowLeft: () => moveFocus(nav.left),
      ArrowRight: () => moveFocus(nav.right),
      Enter: () => onSelect(personId),
      ' ': () => onSelect(personId),
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  const focusNode = layout.nodes.find(n => n.isFocus);

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <ChartToolbar
        zoomPercent={viewport.zoomPercent}
        onZoom={factor => viewport.zoomBy(factor, focusNode)}
        onReset={viewport.reset}
        showFlags={showFlags}
        onFlagsChange={setShowFlags}
      />
      <div ref={viewport.wrapRef} className="mt-2 min-h-[320px] w-full flex-1 overflow-hidden rounded-lg border bg-white">
        <svg
          ref={viewport.svgRef}
          role="group"
          aria-label={t('tree.chartLabel')}
          aria-describedby="trad-instruktioner"
          className="cursor-grab touch-none active:cursor-grabbing"
          {...viewport.svgProps}
        >
          <g transform={viewport.transform}>
            {layout.links.map((l, i) => (
              <path
                key={i}
                aria-hidden
                d={l.type === 'marriage'
                  // straight bar joining the two cards of a couple
                  ? `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`
                  : `M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`}
                className={l.type === 'marriage' ? 'fill-none stroke-gray-400' : 'fill-none stroke-gray-300'}
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
                aria-label={cardLabel(n.person)}
                transform={`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`}
                className="cursor-pointer outline-none"
                onClick={() => onSelect(n.person.id)}
                onFocus={() => setActiveKey(n.key)}
                onKeyDown={e => onNodeKeyDown(e, n.key, n.person.id)}
              >
                <PersonCard
                  person={n.person}
                  variant="compact"
                  showFlag={showFlags}
                  isFocus={n.isFocus}
                  active={n.key === activeKey}
                  selected={n.person.id === selectedId}
                  idKey={n.key}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
