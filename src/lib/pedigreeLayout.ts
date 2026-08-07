import { branchOf, generationOf, type AncestorSlot, type Branch } from './ahnentafel';
import type { ChartBounds } from './useChartViewport';
import type { NavMap } from './treeLayout';
import type { TreePerson } from '../../lib/tree';

export const PED_W = 244;
export const PED_H = 88;
const COL_STEP = PED_W + 74;
const ROW_STEP = PED_H + 16;

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
export interface PedigreeLayout {
  nodes: PedigreeNode[];
  links: PedigreeLink[];
  nav: NavMap;
  bounds: ChartBounds;
}

/**
 * Classic left-to-right ancestor chart. Positions come from the Ahnentafel
 * number alone, so a missing ancestor simply leaves its slot empty instead of
 * shifting everyone else — the grid is the same whether the tree is complete
 * or full of holes.
 */
export function layoutPedigree(slots: AncestorSlot[], generations: number): PedigreeLayout {
  const shown = slots.filter(s => generationOf(s.ahnentafel) <= generations);
  const byNumber = new Map(shown.map(s => [s.ahnentafel, s]));

  // The deepest generation defines the grid; every ancestor sits at the centre
  // of the span its own descendants-of-that-slot would occupy.
  const leafCount = 2 ** generations;
  const slotY = (ahnentafel: number): number => {
    const generation = generationOf(ahnentafel);
    const indexInGeneration = ahnentafel - 2 ** generation;
    const rowsPerSlot = leafCount / 2 ** generation;
    const firstRow = indexInGeneration * rowsPerSlot;
    return (firstRow + rowsPerSlot / 2 - 0.5) * ROW_STEP;
  };

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
    // right = further back in time (father first, mother if he is missing)
    entry.right = keyOf(node.ahnentafel * 2) ?? keyOf(node.ahnentafel * 2 + 1);
    entry.left = keyOf(Math.floor(node.ahnentafel / 2));
    nav[node.key] = entry;
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
    nav,
    bounds: {
      minX: Math.min(...xs, 0) - PED_W / 2 - 20,
      maxX: Math.max(...xs, 0) + PED_W / 2 + 20,
      minY: Math.min(...ys, 0) - PED_H / 2 - 20,
      maxY: Math.max(...ys, 0) + PED_H / 2 + 20,
    },
  };
}
