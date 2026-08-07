import { useEffect, useMemo, useState } from 'react';
import type { TreeData } from '../../lib/tree';
import { t } from '../lib/i18n';
import { flattenAncestors } from '../lib/ahnentafel';
import { layoutPedigree, PED_W, PED_H, EXPANDER_R } from '../lib/pedigreeLayout';
import { useChartViewport } from '../lib/useChartViewport';
import { useFlagPreference } from '../lib/flagPreference';
import PersonCard, { cardLabel } from './PersonCard';
import ChartToolbar from './ChartToolbar';
import { displayName } from '../lib/i18n';

export default function PedigreeChart({ data, generations, onSelect, onExpand, selectedId }: {
  data: TreeData;
  generations: number;
  onSelect: (personId: string) => void;
  /** Re-roots the chart on an ancestor whose own parents are off the edge. */
  onExpand: (personId: string) => void;
  selectedId: string | null;
}) {
  const layout = useMemo(
    () => layoutPedigree(flattenAncestors(data.ancestors, generations), generations),
    [data, generations],
  );
  const viewport = useChartViewport(layout.bounds);
  const [showFlags, setShowFlags] = useFlagPreference();
  const [activeKey, setActiveKey] = useState('a1');

  useEffect(() => { setActiveKey('a1'); }, [layout]);

  function moveFocus(key: string | undefined) {
    if (!key) return;
    const target = layout.nodes.find(n => n.key === key) ?? layout.expanders.find(x => x.key === key);
    setActiveKey(key);
    viewport.svgRef.current?.querySelector<SVGGElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus();
    if (target) viewport.ensureVisible(target.x, target.y);
  }

  /** `activate` is what Enter and Space do: open a card, or follow a handle. */
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
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <ChartToolbar
        zoomPercent={viewport.zoomPercent}
        onZoom={factor => viewport.zoomBy(factor, focusNode)}
        onReset={viewport.reset}
        showFlags={showFlags}
        onFlagsChange={setShowFlags}
        hint={`${t('tree.instructionsAncestors')} ${t('tree.expandHint')}`}
      />
      <div ref={viewport.wrapRef} className="mt-2 min-h-[320px] w-full flex-1 overflow-hidden rounded-lg border bg-white">
        <svg
          ref={viewport.svgRef}
          role="group"
          aria-label={t('tree.pedigreeLabel')}
          aria-describedby="trad-instruktioner"
          className="cursor-grab touch-none active:cursor-grabbing"
          {...viewport.svgProps}
        >
          <g transform={viewport.transform}>
            {layout.links.map((l, i) => (
              <path key={i} aria-hidden d={l.path} className="fill-none stroke-gray-300" strokeWidth={1.25} />
            ))}
            {layout.nodes.map(n => (
              <g
                key={n.key}
                data-tree-node={n.person.id}
                data-node-key={n.key}
                tabIndex={n.key === activeKey ? 0 : -1}
                role="button"
                aria-label={cardLabel(n.person)}
                transform={`translate(${n.x - PED_W / 2} ${n.y - PED_H / 2})`}
                className="cursor-pointer outline-none"
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
                  born={n.person.birthDate ?? (n.person.birthYear != null ? String(n.person.birthYear) : null)}
                  died={n.person.deathDate ?? (n.person.deathYear != null ? String(n.person.deathYear) : null)}
                />
              </g>
            ))}

            {/* the line continues past the edge of the chart — click to follow it */}
            {layout.expanders.map(x => (
              <g
                key={x.key}
                data-expander={x.person.id}
                data-node-key={x.key}
                tabIndex={x.key === activeKey ? 0 : -1}
                role="button"
                aria-label={t('tree.expandLine').replace('{name}', displayName(x.person))}
                transform={`translate(${x.x} ${x.y})`}
                className="group cursor-pointer outline-none"
                onClick={() => onExpand(x.person.id)}
                onFocus={() => setActiveKey(x.key)}
                onKeyDown={e => onNodeKeyDown(e, x.key, () => onExpand(x.person.id))}
              >
                <circle
                  r={EXPANDER_R}
                  strokeWidth={x.key === activeKey ? 2.5 : 1.25}
                  className={`fill-white group-hover:fill-blue-50 ${
                    x.key === activeKey ? 'stroke-amber-500' : 'stroke-gray-400 group-hover:stroke-blue-600'
                  }`}
                />
                <path
                  d="M -3 -5 L 3 0 L -3 5"
                  className="fill-none stroke-gray-600 group-hover:stroke-blue-700"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
