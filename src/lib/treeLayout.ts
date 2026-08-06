import { hierarchy, tree, type HierarchyNode } from 'd3-hierarchy';
import type { AncestorNode, DescendantNode, TreeData, TreePerson } from '../../lib/tree';

export const NODE_W = 210;
export const NODE_H = 66;
/** Portrait circle on the left of each card. */
export const AVATAR_R = 21;
export const AVATAR_CX = 6 + AVATAR_R;
const STEP_X = NODE_W + 24;
const STEP_Y = NODE_H + 56;

export interface PositionedNode { key: string; person: TreePerson; x: number; y: number; isFocus: boolean }
export interface TreeEdge { x1: number; y1: number; x2: number; y2: number }
export interface NavMap { [key: string]: { up?: string; down?: string; left?: string; right?: string } }
export interface TreeLayoutResult {
  nodes: PositionedNode[];
  links: TreeEdge[];
  nav: NavMap;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * Pure layout math (spec: d3-hierarchy for layout only). Nodes are keyed by
 * their PATH in the tree, not by person id — the same person can appear twice
 * under pedigree collapse (cousin marriages) and each occurrence needs its own
 * DOM node and nav entry.
 */
export function layoutTree(data: TreeData): TreeLayoutResult {
  const nodes: PositionedNode[] = [];
  const links: TreeEdge[] = [];
  const nav: NavMap = {};
  const setNav = (key: string, dir: 'up' | 'down' | 'left' | 'right', target: string) => {
    nav[key] = { ...nav[key] };
    if (!nav[key][dir]) nav[key][dir] = target;
  };

  const keyOf = <T,>(prefix: string) => {
    const map = new Map<HierarchyNode<T>, string>();
    const get = (n: HierarchyNode<T>): string => {
      let k = map.get(n);
      if (!k) {
        k = n.depth === 0 ? 'focus' : `${prefix}${get(n.parent!)}.${(n.parent!.children ?? []).indexOf(n)}`;
        map.set(n, k);
      }
      return k;
    };
    return get;
  };

  // Ancestors: hierarchy "children" are the person's parents; rendered upward.
  const anc = hierarchy<AncestorNode>(data.ancestors, a => a.parents);
  tree<AncestorNode>().nodeSize([STEP_X, STEP_Y])(anc);
  const ancKey = keyOf<AncestorNode>('a');
  anc.each(n => {
    const y = n.depth === 0 ? 0 : -n.depth * STEP_Y;
    nodes.push({ key: ancKey(n), person: n.data.person, x: n.x!, y, isFocus: n.depth === 0 });
    if (n.parent) {
      links.push({ x1: n.parent.x!, y1: -(n.depth - 1) * STEP_Y, x2: n.x!, y2: y });
      setNav(ancKey(n.parent), 'up', ancKey(n));
      setNav(ancKey(n), 'down', ancKey(n.parent));
    }
  });

  // Descendants: rendered downward; depth 0 (focus) already emitted above.
  const desc = hierarchy<DescendantNode>(data.descendants, d => d.children);
  tree<DescendantNode>().nodeSize([STEP_X, STEP_Y])(desc);
  const descKey = keyOf<DescendantNode>('d');
  desc.each(n => {
    if (n.depth === 0) return;
    const y = n.depth * STEP_Y;
    nodes.push({ key: descKey(n), person: n.data.person, x: n.x!, y, isFocus: false });
    links.push({ x1: n.parent!.x!, y1: (n.depth - 1) * STEP_Y, x2: n.x!, y2: y });
    setNav(n.parent!.depth === 0 ? 'focus' : descKey(n.parent!), 'down', descKey(n));
    setNav(descKey(n), 'up', n.parent!.depth === 0 ? 'focus' : descKey(n.parent!));
  });

  // Left/right: adjacency within each generation row.
  const rows = new Map<number, PositionedNode[]>();
  for (const n of nodes) {
    const row = rows.get(n.y) ?? [];
    row.push(n);
    rows.set(n.y, row);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    row.forEach((n, i) => {
      if (row[i - 1]) setNav(n.key, 'left', row[i - 1].key);
      if (row[i + 1]) setNav(n.key, 'right', row[i + 1].key);
    });
  }

  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  return {
    nodes, links, nav,
    bounds: {
      minX: Math.min(...xs) - NODE_W / 2 - 20,
      maxX: Math.max(...xs) + NODE_W / 2 + 20,
      minY: Math.min(...ys) - NODE_H - 20,
      maxY: Math.max(...ys) + NODE_H + 20,
    },
  };
}
