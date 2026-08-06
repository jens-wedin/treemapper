import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { t, displayName, lifespan } from '../lib/i18n';
import { NODE_W, NODE_H, AVATAR_R, AVATAR_CX, type TreeLayoutResult } from '../lib/treeLayout';
import type { TreePerson } from '../../lib/tree';

/** Up to two initials, for people without a downloaded photo. */
function initials(person: TreePerson): string {
  return [person.givenName, person.surname]
    .map(part => part.trim()[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// A hard cut mid-name reads like broken data — mark it with an ellipsis
// instead. The full name is always in the node's aria-label.
const MAX_NAME = 20;
const truncate = (name: string) =>
  name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1).trimEnd()}…` : name;

export default function TreeChart({ layout, depthQuery }: { layout: TreeLayoutResult; depthQuery: string }) {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [activeKey, setActiveKey] = useState(() => layout.nodes.find(n => n.isFocus)!.key);
  const drag = useRef<{ px: number; py: number } | null>(null);

  useEffect(() => {
    setActiveKey(layout.nodes.find(n => n.isFocus)!.key);
    setView({ x: 0, y: 0, k: 1 });
  }, [layout]);

  // React's synthetic wheel handler is passive — attach a real one to preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView(v => {
        const k = Math.min(2.5, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const rect = svg.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  function moveFocus(key: string | undefined) {
    if (!key) return;
    setActiveKey(key);
    svgRef.current?.querySelector<SVGGElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus();
  }

  function onNodeKeyDown(e: React.KeyboardEvent, key: string, personId: string) {
    const nav = layout.nav[key] ?? {};
    const actions: Record<string, () => void> = {
      ArrowUp: () => moveFocus(nav.up),
      ArrowDown: () => moveFocus(nav.down),
      ArrowLeft: () => moveFocus(nav.left),
      ArrowRight: () => moveFocus(nav.right),
      Enter: () => navigate(`/trad/${personId}${depthQuery}`),
      ' ': () => navigate(`/trad/${personId}${depthQuery}`),
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  const { bounds } = layout;
  const vb = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;

  return (
    <div className="mt-4">
      <p id="trad-instruktioner" className="text-sm text-gray-600">{t('tree.instructions')}</p>
      <div className="mt-2 flex gap-1">
        <Button variant="outline" size="sm" aria-label={t('tree.zoomIn')} onClick={() => setView(v => ({ ...v, k: Math.min(2.5, v.k * 1.25) }))}>+</Button>
        <Button variant="outline" size="sm" aria-label={t('tree.zoomOut')} onClick={() => setView(v => ({ ...v, k: Math.max(0.25, v.k / 1.25) }))}>−</Button>
        <Button variant="outline" size="sm" onClick={() => setView({ x: 0, y: 0, k: 1 })}>{t('tree.zoomReset')}</Button>
      </div>
      <svg
        ref={svgRef}
        role="group"
        aria-label={t('tree.chartLabel')}
        aria-describedby="trad-instruktioner"
        viewBox={vb}
        className="mt-2 h-[70vh] w-full cursor-grab touch-none rounded-lg border bg-white active:cursor-grabbing"
        onPointerDown={e => {
          drag.current = { px: e.clientX, py: e.clientY };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={e => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.px;
          const dy = e.clientY - drag.current.py;
          drag.current = { px: e.clientX, py: e.clientY };
          setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {layout.links.map((l, i) => (
            <path
              key={i}
              aria-hidden
              d={`M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`}
              className="fill-none stroke-gray-300"
            />
          ))}
          {layout.nodes.map(n => (
            <g
              key={n.key}
              data-tree-node={n.person.id}
              data-node-key={n.key}
              tabIndex={n.key === activeKey ? 0 : -1}
              role="button"
              aria-label={`${displayName(n.person)}, ${lifespan(n.person.birthYear, n.person.deathYear) || '?'}`}
              transform={`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`}
              className="cursor-pointer outline-none"
              onClick={() => navigate(`/trad/${n.person.id}${depthQuery}`)}
              onFocus={() => setActiveKey(n.key)}
              onKeyDown={e => onNodeKeyDown(e, n.key, n.person.id)}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={10}
                className={`fill-white ${n.key === activeKey ? 'stroke-amber-500' : n.isFocus ? 'stroke-blue-700' : 'stroke-gray-300'}`}
                strokeWidth={n.isFocus || n.key === activeKey ? 2.5 : 1.5}
              />
              {n.person.photoId != null ? (
                <>
                  <clipPath id={`avatar-${n.key}`}>
                    <circle cx={AVATAR_CX} cy={NODE_H / 2} r={AVATAR_R} />
                  </clipPath>
                  <image
                    href={`/api/media/${n.person.photoId}`}
                    x={AVATAR_CX - AVATAR_R}
                    y={NODE_H / 2 - AVATAR_R}
                    width={AVATAR_R * 2}
                    height={AVATAR_R * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#avatar-${n.key})`}
                  />
                  <circle
                    cx={AVATAR_CX} cy={NODE_H / 2} r={AVATAR_R}
                    className="fill-none stroke-gray-200"
                    strokeWidth={1}
                  />
                </>
              ) : (
                <>
                  <circle cx={AVATAR_CX} cy={NODE_H / 2} r={AVATAR_R} className="fill-gray-100 stroke-gray-200" strokeWidth={1} />
                  <text
                    x={AVATAR_CX} y={NODE_H / 2 + 5}
                    textAnchor="middle"
                    className="fill-gray-400 text-[14px] font-medium"
                  >
                    {initials(n.person)}
                  </text>
                </>
              )}
              <text x={AVATAR_CX + AVATAR_R + 12} y={NODE_H / 2 - 3} className="fill-gray-900 text-[13px] font-medium">
                {truncate(displayName(n.person))}
              </text>
              <text x={AVATAR_CX + AVATAR_R + 12} y={NODE_H / 2 + 15} className="fill-gray-500 text-[12px]">
                {lifespan(n.person.birthYear, n.person.deathYear)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
