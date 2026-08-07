import { hierarchy, tree, type HierarchyNode } from 'd3-hierarchy';
import type { AncestorNode, DescendantNode, TreeData, TreePerson } from '../../lib/tree';

// Portrait on top, name and years centred underneath — narrow cards fit far
// more people across a generation than the old wide ones.
export const NODE_W = 150;
export const NODE_H = 106;
export const AVATAR_R = 20;
export const AVATAR_CX = NODE_W / 2;
export const AVATAR_CY = 12 + AVATAR_R;
const STEP_X = NODE_W + 22;
const STEP_Y = NODE_H + 48;
/** Gap between the two cards of a couple. */
export const COUPLE_GAP = 14;
const COUPLE_STEP = NODE_W + COUPLE_GAP;

export interface PositionedNode {
  key: string;
  person: TreePerson;
  x: number;
  y: number;
  isFocus: boolean;
  /** Partner card placed beside the person it belongs to. */
  isSpouse?: boolean;
}
export interface TreeEdge { x1: number; y1: number; x2: number; y2: number; type?: 'parent' | 'marriage' }
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
  tree<DescendantNode>()
    .nodeSize([STEP_X, STEP_Y])
    // A person with partners occupies their own card plus one per partner, so
    // neighbouring siblings have to stand that much further apart.
    .separation((a, b) => (1 + (a.data.spouses?.length ?? 0)) + (a.parent === b.parent ? 0.12 : 0.5))(desc);
  const descKey = keyOf<DescendantNode>('d');
  /**
   * Where a child's line starts on the parent row: the marriage bar of the
   * family the child actually belongs to, so children of a second marriage
   * hang from that couple rather than the first one.
   */
  const familyAnchor = (parent: { x?: number; data: DescendantNode }, familyIndex: number) =>
    parent.data.spouses?.length
      ? parent.x! + COUPLE_STEP * (Math.min(familyIndex, parent.data.spouses.length - 1) + 0.5)
      : parent.x!;

  desc.each(n => {
    const y = n.depth * STEP_Y;
    const key = n.depth === 0 ? 'focus' : descKey(n);
    if (n.depth > 0) {
      nodes.push({ key, person: n.data.person, x: n.x!, y, isFocus: false });
      links.push({ x1: familyAnchor(n.parent!, n.data.familyIndex ?? 0), y1: (n.depth - 1) * STEP_Y, x2: n.x!, y2: y });
      setNav(n.parent!.depth === 0 ? 'focus' : descKey(n.parent!), 'down', key);
      setNav(key, 'up', n.parent!.depth === 0 ? 'focus' : descKey(n.parent!));
    }
    (n.data.spouses ?? []).forEach((spouse, i) => {
      const spouseKey = `p${key}.${i}`;
      const x = n.x! + COUPLE_STEP * (i + 1);
      nodes.push({ key: spouseKey, person: spouse, x, y, isSpouse: true, isFocus: false });
      // marriage bar between the previous card and this one
      links.push({ x1: n.x! + COUPLE_STEP * i, y1: y, x2: x, y2: y, type: 'marriage' });
      // the partner shares the couple's children for keyboard navigation
      const firstChild = n.children?.[0];
      if (firstChild) setNav(spouseKey, 'down', descKey(firstChild));
    });
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
