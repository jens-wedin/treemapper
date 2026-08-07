import { hierarchy, tree, type HierarchyNode } from 'd3-hierarchy';
import type { AncestorNode, DescendantNode, TreeData, TreePerson } from '../../lib/tree';
import { branchOf, type Branch } from './ahnentafel';

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
  /**
   * Which grandparent line an ancestor belongs to, coloured the same way as
   * the pedigree and the fan. Descendants have no such line, so they stay
   * 'focus' — neutral.
   */
  branch: Branch;
}
export interface TreeEdge { x1: number; y1: number; x2: number; y2: number; type?: 'parent' | 'marriage' }
export interface NavMap { [key: string]: { up?: string; down?: string; left?: string; right?: string } }

/**
 * The button above the topmost ancestors and below the outermost descendants:
 * ⌃ unfolds two more generations of parents, ⌄ two more of children, and both
 * turn into the opposite arrow once opened.
 */
export interface TreeHandle {
  key: string;
  /** Card the handle belongs to. */
  nodeKey: string;
  person: TreePerson;
  x: number;
  y: number;
  direction: 'up' | 'down';
  action: 'expand' | 'collapse';
  /** Where in the ancestor or descendant tree an unfold gets spliced in. */
  path: number[];
}

export interface TreeLayoutResult {
  nodes: PositionedNode[];
  links: TreeEdge[];
  handles: TreeHandle[];
  nav: NavMap;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Gap between a card's edge and the centre of its handle. */
const HANDLE_GAP = 20;
export const TREE_HANDLE_R = 12;

/**
 * Pure layout math (spec: d3-hierarchy for layout only). Nodes are keyed by
 * their PATH in the tree, not by person id — the same person can appear twice
 * under pedigree collapse (cousin marriages) and each occurrence needs its own
 * DOM node and nav entry.
 */
export function layoutTree(data: TreeData, expanded: ReadonlySet<string> = new Set()): TreeLayoutResult {
  const nodes: PositionedNode[] = [];
  const links: TreeEdge[] = [];
  const handles: TreeHandle[] = [];
  const nav: NavMap = {};

  /** Child indices from the root down to this node — where a graft goes. */
  const pathOf = <T,>(node: HierarchyNode<T>): number[] => {
    const steps: number[] = [];
    let cur = node;
    while (cur.parent) {
      steps.unshift((cur.parent.children ?? []).indexOf(cur));
      cur = cur.parent;
    }
    return steps;
  };

  const addHandle = (
    node: PositionedNode, direction: 'up' | 'down', path: number[], hasMore: boolean | undefined, x = node.x,
  ) => {
    const key = `h${direction}:${node.key}`;
    const isOpen = expanded.has(key);
    if (!isOpen && !hasMore) return;
    handles.push({
      key,
      nodeKey: node.key,
      person: node.person,
      x,
      y: node.y + (direction === 'up' ? -(NODE_H / 2 + HANDLE_GAP) : NODE_H / 2 + HANDLE_GAP),
      direction,
      action: isOpen ? 'collapse' : 'expand',
      path,
    });
  };
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

  /**
   * Ahnentafel numbers for the ancestors, so their cards take the same branch
   * colours as the pedigree and the fan. A family that records only a mother
   * puts her at 2n+1 by her sex rather than by her position in the array —
   * otherwise everyone above her would be coloured as the father's side.
   * `each` walks parents before children, so the number is always ready.
   */
  const ahnentafel = new Map<HierarchyNode<AncestorNode>, number>([[anc, 1]]);
  anc.each(n => {
    const base = ahnentafel.get(n) ?? 1;
    const parents = n.children ?? [];
    if (parents.length === 1) {
      ahnentafel.set(parents[0]!, parents[0]!.data.person.sex === 'F' ? base * 2 + 1 : base * 2);
    } else {
      parents.forEach((p, i) => ahnentafel.set(p, base * 2 + i));
    }
  });

  anc.each(n => {
    const y = n.depth === 0 ? 0 : -n.depth * STEP_Y;
    const node: PositionedNode = {
      key: ancKey(n), person: n.data.person, x: n.x!, y, isFocus: n.depth === 0,
      branch: branchOf(ahnentafel.get(n) ?? 1),
    };
    nodes.push(node);
    // Parents already on screen continue the line themselves; the handle is
    // for where the chart stops but the family does not.
    addHandle(node, 'up', pathOf(n), !n.children?.length && n.data.hasMoreAncestors);
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
    /**
     * A person with partners occupies their own card plus one per partner, so
     * neighbours have to stand that much further apart.
     *
     * The width is taken from whichever of the two is wider, because the
     * partners sit to the *right* of their person and only the left-hand node
     * needs the extra room — and d3 does not say which argument that is. It
     * passes (node, previous sibling) when placing siblings and (left, right)
     * when comparing subtree contours. Reading one side alone reserved the
     * space on the wrong side half the time, and partner cards ended up 121 px
     * inside the next sibling.
     */
    .separation((a, b) => {
      const widest = Math.max(a.data.spouses?.length ?? 0, b.data.spouses?.length ?? 0);
      return 1 + widest + (a.parent === b.parent ? 0.12 : 0.5);
    })(desc);
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
    // The focus card was emitted by the ancestor pass; reuse it so the handle
    // hangs under the card that is actually drawn.
    let node = nodes.find(m => m.key === key)!;
    if (n.depth > 0) {
      node = { key, person: n.data.person, x: n.x!, y, isFocus: false, branch: 'focus' };
      nodes.push(node);
      links.push({ x1: familyAnchor(n.parent!, n.data.familyIndex ?? 0), y1: (n.depth - 1) * STEP_Y, x2: n.x!, y2: y });
      setNav(n.parent!.depth === 0 ? 'focus' : descKey(n.parent!), 'down', key);
      setNav(key, 'up', n.parent!.depth === 0 ? 'focus' : descKey(n.parent!));
    }
    // Children hang from the marriage bar, so the handle sits under it too.
    addHandle(
      node, 'down', pathOf(n), !n.children?.length && n.data.hasMoreDescendants,
      node.x + (n.data.spouses?.length ? COUPLE_STEP / 2 : 0),
    );
    (n.data.spouses ?? []).forEach((spouse, i) => {
      const spouseKey = `p${key}.${i}`;
      const x = n.x! + COUPLE_STEP * (i + 1);
      nodes.push({ key: spouseKey, person: spouse, x, y, isSpouse: true, isFocus: false, branch: 'focus' });
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

  // A handle is drawn between its card and the generation it opens, so that is
  // where it sits in the keyboard order too.
  for (const handle of handles) {
    const card = nav[handle.nodeKey] ?? {};
    if (handle.direction === 'up') {
      nav[handle.key] = { down: handle.nodeKey, up: card.up };
      nav[handle.nodeKey] = { ...card, up: handle.key };
    } else {
      nav[handle.key] = { up: handle.nodeKey, down: card.down };
      nav[handle.nodeKey] = { ...card, down: handle.key };
    }
  }

  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  return {
    nodes, links, handles, nav,
    bounds: {
      minX: Math.min(...xs, ...handles.map(h => h.x)) - NODE_W / 2 - 20,
      maxX: Math.max(...xs, ...handles.map(h => h.x)) + NODE_W / 2 + 20,
      minY: Math.min(...ys, ...handles.map(h => h.y)) - NODE_H - 20,
      maxY: Math.max(...ys, ...handles.map(h => h.y)) + NODE_H + 20,
    },
  };
}
