import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

// The viewBox is the container in CSS pixels, so scale 1 means "cards at their
// designed size" no matter how wide the tree is. A viewBox spanning the whole
// tree would shrink a wide generation to unreadable and cap zoom far too low.
const MIN_K = 0.04;
const MAX_K = 3;
const ZOOM_STEP = 1.25;
const EDGE_MARGIN = 70;

interface View { x: number; y: number; k: number }

export default function TreeChart({ layout, depthQuery }: { layout: TreeLayoutResult; depthQuery: string }) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number } | null>(null);
  const adjusted = useRef(false);   // has the user panned/zoomed since the last fit?

  const [size, setSize] = useState({ w: 900, h: 600 });
  const [view, setView] = useState<View>({ x: 450, y: 300, k: 1 });
  const [activeKey, setActiveKey] = useState(() => layout.nodes.find(n => n.isFocus)!.key);

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

  /** Scale and offset that bring the whole tree into view. */
  const fit = useMemo((): View => {
    const { bounds } = layout;
    const contentW = Math.max(bounds.maxX - bounds.minX, 1);
    const contentH = Math.max(bounds.maxY - bounds.minY, 1);
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(size.w / contentW, size.h / contentH, 1)));
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return { k, x: size.w / 2 - centerX * k, y: size.h / 2 - centerY * k };
  }, [layout, size]);

  // Fit on a new tree or a resize, but never yank the view out from under
  // someone who has already zoomed or panned.
  useEffect(() => {
    adjusted.current = false;
    setActiveKey(layout.nodes.find(n => n.isFocus)!.key);
  }, [layout]);

  useEffect(() => {
    if (!adjusted.current) setView(fit);
  }, [fit]);

  const zoomAround = useCallback((factor: number, px: number, py: number) => {
    adjusted.current = true;
    setView(v => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      if (k === v.k) return v;
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });
  }, []);

  // React's synthetic wheel handler is passive — attach a real one to preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAround(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  /** Keeps the keyboard-focused card inside the viewport on big trees. */
  const ensureVisible = useCallback((key: string) => {
    const node = layout.nodes.find(n => n.key === key);
    if (!node) return;
    setView(v => {
      const sx = node.x * v.k + v.x;
      const sy = node.y * v.k + v.y;
      let { x, y } = v;
      if (sx < EDGE_MARGIN) x += EDGE_MARGIN - sx;
      else if (sx > size.w - EDGE_MARGIN) x -= sx - (size.w - EDGE_MARGIN);
      if (sy < EDGE_MARGIN) y += EDGE_MARGIN - sy;
      else if (sy > size.h - EDGE_MARGIN) y -= sy - (size.h - EDGE_MARGIN);
      if (x === v.x && y === v.y) return v;
      adjusted.current = true;
      return { ...v, x, y };
    });
  }, [layout, size]);

  function moveFocus(key: string | undefined) {
    if (!key) return;
    setActiveKey(key);
    svgRef.current?.querySelector<SVGGElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus();
    ensureVisible(key);
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

  const zoomPercent = Math.round(view.k * 100);

  // Buttons zoom around the focus person (kept on screen), not the viewport
  // centre — on a wide tree centre-zoom pushes them straight out of view.
  // The wheel still zooms at the pointer, which is what people expect.
  function zoomWithButton(factor: number) {
    const focus = layout.nodes.find(n => n.isFocus);
    const sx = focus ? focus.x * view.k + view.x : size.w / 2;
    const sy = focus ? focus.y * view.k + view.y : size.h / 2;
    const inside = sx >= 0 && sx <= size.w && sy >= 0 && sy <= size.h;
    zoomAround(factor, inside ? sx : size.w / 2, inside ? sy : size.h / 2);
  }

  return (
    <div className="mt-4">
      <p id="trad-instruktioner" className="text-sm text-gray-600">{t('tree.instructions')}</p>
      <div className="mt-2 flex items-center gap-1">
        <Button
          variant="outline" size="sm" aria-label={t('tree.zoomIn')}
          onClick={() => zoomWithButton(ZOOM_STEP)}
        >
          +
        </Button>
        <Button
          variant="outline" size="sm" aria-label={t('tree.zoomOut')}
          onClick={() => zoomWithButton(1 / ZOOM_STEP)}
        >
          −
        </Button>
        <Button
          variant="outline" size="sm"
          onClick={() => { adjusted.current = false; setView(fit); }}
        >
          {t('tree.zoomReset')}
        </Button>
        <span aria-live="polite" className="ml-2 text-sm tabular-nums text-gray-500">
          {zoomPercent}%
        </span>
      </div>
      <div ref={wrapRef} className="mt-2 h-[70vh] w-full overflow-hidden rounded-lg border bg-white">
        <svg
          ref={svgRef}
          role="group"
          aria-label={t('tree.chartLabel')}
          aria-describedby="trad-instruktioner"
          viewBox={`0 0 ${size.w} ${size.h}`}
          width={size.w}
          height={size.h}
          className="cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={e => {
            drag.current = { px: e.clientX, py: e.clientY };
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={e => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.px;
            const dy = e.clientY - drag.current.py;
            drag.current = { px: e.clientX, py: e.clientY };
            adjusted.current = true;
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
    </div>
  );
}
