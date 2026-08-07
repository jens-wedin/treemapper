import { branchOf, generationOf, type AncestorSlot, type Branch } from './ahnentafel';
import type { ChartBounds } from './useChartViewport';
import type { NavMap } from './treeLayout';
import type { TreePerson } from '../../lib/tree';

export const PED_W = 244;
export const PED_H = 88;
const COL_STEP = PED_W + 74;
export const ROW_STEP = PED_H + 16;

export interface PedigreeNode {
  key: string;
  ahnentafel: number;
  person: TreePerson;
  x: number;
  y: number;
  branch: Branch;
  isFocus: boolean;
}
export interface PedigreeLink { path: string }
/**
 * A "continue from here" handle on a card whose parents exist but fall outside
 * the generations being drawn. Clicking it re-roots the chart on that person.
 */
export interface PedigreeExpander {
  key: string;
  person: TreePerson;
  x: number;
  y: number;
}
export interface PedigreeLayout {
  nodes: PedigreeNode[];
  links: PedigreeLink[];
  expanders: PedigreeExpander[];
  nav: NavMap;
  bounds: ChartBounds;
}

/** Gap between a card's right edge and the centre of its expander button. */
const EXPANDER_GAP = 22;
export const EXPANDER_R = 13;

/**
 * Classic left-to-right ancestor chart. Positions come from the Ahnentafel
 * number alone, so a missing ancestor simply leaves its slot empty instead of
 * shifting everyone else — the grid is the same whether the tree is complete
 * or full of holes.
 */
export function layoutPedigree(slots: AncestorSlot[], generations: number): PedigreeLayout {
  const shown = slots.filter(s => generationOf(s.ahnentafel) <= generations);
  const byNumber = new Map(shown.map(s => [s.ahnentafel, s]));

  /**
   * Rows are handed out father-before-mother down the tree, so an ancestor
   * always sits midway between the two rows its parents occupy.
   *
   * A parent we don't have still costs one blank row — that is what keeps a
   * lone mother below her missing husband instead of sliding into his place.
   * A branch that is missing entirely costs nothing beyond that one row: a
   * full grid of 2^generations rows would shrink a sparse line to an
   * unreadable sliver of the viewport.
   */
  const rows = new Map<number, number>();
  let nextRow = 0;
  const assignRow = (ahnentafel: number, generation: number): number => {
    const parents = [ahnentafel * 2, ahnentafel * 2 + 1];
    const anyDrawn = generation < generations && parents.some(p => byNumber.has(p));
    const row = anyDrawn
      ? parents
        .map(p => (byNumber.has(p) ? assignRow(p, generation + 1) : nextRow++))
        .reduce((a, b) => (a + b) / 2)
      : nextRow++;
    rows.set(ahnentafel, row);
    return row;
  };
  assignRow(1, 0);
  const slotY = (ahnentafel: number): number => (rows.get(ahnentafel) ?? 0) * ROW_STEP;

  const nodes: PedigreeNode[] = shown.map(s => ({
    key: `a${s.ahnentafel}`,
    ahnentafel: s.ahnentafel,
    person: s.person,
    x: generationOf(s.ahnentafel) * COL_STEP,
    y: slotY(s.ahnentafel),
    branch: branchOf(s.ahnentafel),
    isFocus: s.ahnentafel === 1,
  }));

  // Elbow from a child's right edge into its parent's left edge.
  const links: PedigreeLink[] = [];
  for (const node of nodes) {
    for (const parentNumber of [node.ahnentafel * 2, node.ahnentafel * 2 + 1]) {
      if (!byNumber.has(parentNumber)) continue;
      const x1 = node.x + PED_W / 2;
      const y1 = node.y;
      const x2 = node.x + COL_STEP - PED_W / 2;
      const y2 = slotY(parentNumber);
      const midX = (x1 + x2) / 2;
      links.push({ path: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` });
    }
  }

  // Only cards with no drawn parent get a handle: elsewhere the line already
  // continues on screen.
  const expanders: PedigreeExpander[] = shown
    .filter(s => s.hasMoreAncestors
      && !byNumber.has(s.ahnentafel * 2)
      && !byNumber.has(s.ahnentafel * 2 + 1))
    .map(s => ({
      key: `x${s.ahnentafel}`,
      person: s.person,
      x: generationOf(s.ahnentafel) * COL_STEP + PED_W / 2 + EXPANDER_GAP,
      y: slotY(s.ahnentafel),
    }));
  const expanderOf = new Map(expanders.map(x => [x.key, x]));

  const nav: NavMap = {};
  const keyOf = (n: number) => (byNumber.has(n) ? `a${n}` : undefined);
  const byGeneration = new Map<number, PedigreeNode[]>();
  for (const node of nodes) {
    const list = byGeneration.get(generationOf(node.ahnentafel)) ?? [];
    list.push(node);
    byGeneration.set(generationOf(node.ahnentafel), list);
  }
  for (const node of nodes) {
    const entry: NavMap[string] = {};
    // right = further back in time (father first, mother if he is missing);
    // with nobody drawn there, the expander takes that place instead.
    entry.right = keyOf(node.ahnentafel * 2)
      ?? keyOf(node.ahnentafel * 2 + 1)
      ?? (expanderOf.has(`x${node.ahnentafel}`) ? `x${node.ahnentafel}` : undefined);
    entry.left = keyOf(Math.floor(node.ahnentafel / 2));
    nav[node.key] = entry;
  }
  for (const expander of expanders) {
    nav[expander.key] = { left: expander.key.replace(/^x/, 'a') };
  }
  for (const list of byGeneration.values()) {
    list.sort((a, b) => a.y - b.y);
    list.forEach((n, i) => {
      if (list[i - 1]) nav[n.key]!.up = list[i - 1]!.key;
      if (list[i + 1]) nav[n.key]!.down = list[i + 1]!.key;
    });
  }

  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  return {
    nodes,
    links,
    expanders,
    nav,
    bounds: {
      minX: Math.min(...xs, 0) - PED_W / 2 - 20,
      maxX: Math.max(...xs.map(x => x + PED_W / 2), ...expanders.map(x => x.x + EXPANDER_R), 0) + 20,
      minY: Math.min(...ys, 0) - PED_H / 2 - 20,
      maxY: Math.max(...ys, 0) + PED_H / 2 + 20,
    },
  };
}
