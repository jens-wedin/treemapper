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
 * The button just past a card's right edge: ▸ opens the two generations above
 * someone whose parents are on record but not drawn, ‹ folds them away again.
 */
export interface PedigreeHandle {
  key: string;
  ahnentafel: number;
  person: TreePerson;
  x: number;
  y: number;
  action: 'expand' | 'collapse';
}
export interface PedigreeLayout {
  nodes: PedigreeNode[];
  links: PedigreeLink[];
  handles: PedigreeHandle[];
  nav: NavMap;
  bounds: ChartBounds;
}

/** Gap between a card's right edge and the centre of its handle. */
const HANDLE_GAP = 22;
export const HANDLE_R = 13;

/**
 * Classic left-to-right ancestor chart. Columns come from the Ahnentafel
 * number, so a missing ancestor leaves its slot empty instead of shifting
 * everyone else. Whatever slots are handed in are drawn — the caller decides
 * how deep the chart goes, including branches it has expanded by hand.
 *
 * `expanded` names the slots the caller opened, which is what turns their ▸
 * into a ‹.
 */
export function layoutPedigree(slots: AncestorSlot[], expanded: ReadonlySet<number> = new Set()): PedigreeLayout {
  const shown = slots;
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
  const assignRow = (ahnentafel: number): number => {
    const parents = [ahnentafel * 2, ahnentafel * 2 + 1];
    const row = parents.some(p => byNumber.has(p))
      ? parents
        .map(p => (byNumber.has(p) ? assignRow(p) : nextRow++))
        .reduce((a, b) => (a + b) / 2)
      : nextRow++;
    rows.set(ahnentafel, row);
    return row;
  };
  assignRow(1);
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

  // A card offers ▸ when its parents are on record but off the chart, and ‹
  // once the caller has opened them. Everyone else already shows their line.
  const handles: PedigreeHandle[] = shown
    .filter(s => expanded.has(s.ahnentafel)
      || (s.hasMoreAncestors && !byNumber.has(s.ahnentafel * 2) && !byNumber.has(s.ahnentafel * 2 + 1)))
    .map(s => ({
      key: `x${s.ahnentafel}`,
      ahnentafel: s.ahnentafel,
      person: s.person,
      x: generationOf(s.ahnentafel) * COL_STEP + PED_W / 2 + HANDLE_GAP,
      y: slotY(s.ahnentafel),
      action: expanded.has(s.ahnentafel) ? 'collapse' as const : 'expand' as const,
    }));
  const handleOf = new Map(handles.map(h => [h.key, h]));

  const nav: NavMap = {};
  const keyOf = (n: number) => (byNumber.has(n) ? `a${n}` : undefined);
  const byGeneration = new Map<number, PedigreeNode[]>();
  for (const node of nodes) {
    const list = byGeneration.get(generationOf(node.ahnentafel)) ?? [];
    list.push(node);
    byGeneration.set(generationOf(node.ahnentafel), list);
  }
  // right = further back in time (father first, mother if he is missing). A
  // handle is drawn between a card and its parents, so it is a stop on the way.
  const parentKeyOf = (n: number) => keyOf(n * 2) ?? keyOf(n * 2 + 1);
  for (const node of nodes) {
    nav[node.key] = {
      right: (handleOf.has(`x${node.ahnentafel}`) ? `x${node.ahnentafel}` : undefined)
        ?? parentKeyOf(node.ahnentafel),
      left: keyOf(Math.floor(node.ahnentafel / 2)),
    };
  }
  for (const handle of handles) {
    nav[handle.key] = { left: `a${handle.ahnentafel}`, right: parentKeyOf(handle.ahnentafel) };
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
    handles,
    nav,
    bounds: {
      minX: Math.min(...xs, 0) - PED_W / 2 - 20,
      maxX: Math.max(...xs.map(x => x + PED_W / 2), ...handles.map(h => h.x + HANDLE_R), 0) + 20,
      minY: Math.min(...ys, 0) - PED_H / 2 - 20,
      maxY: Math.max(...ys, 0) + PED_H / 2 + 20,
    },
  };
}
