import type { AncestorNode, TreePerson } from '../../lib/tree';

/**
 * Ahnentafel numbering: the person is 1, their father is 2n and mother 2n+1.
 * It gives every ancestor slot a stable identity, which is what both the
 * pedigree grid and the fan's angular slices are built on.
 */
export type Branch = 'focus' | 'ff' | 'fm' | 'mf' | 'mm';

export interface AncestorSlot {
  ahnentafel: number;
  person: TreePerson;
}

export function generationOf(ahnentafel: number): number {
  return Math.floor(Math.log2(Math.max(1, ahnentafel)));
}

/** Which of the four grandparent lines an ancestor belongs to. */
export function branchOf(ahnentafel: number): Branch {
  const generation = generationOf(ahnentafel);
  if (generation === 0) return 'focus';
  // Drop the leading 1; the remaining bits are the path (0 = father, 1 = mother).
  const path = ahnentafel.toString(2).slice(1);
  const first = path[0] === '1';                       // mother's side?
  const second = path.length > 1 ? path[1] === '1' : first;
  if (!first) return second ? 'fm' : 'ff';
  return second ? 'mm' : 'mf';
}

/** The four branch hues used by both ancestor views. */
export const BRANCH_COLORS: Record<Branch, { stroke: string; fill: string; band: string }> = {
  focus: { stroke: '#334155', fill: '#ffffff', band: '#94a3b8' },
  ff: { stroke: '#38bdf8', fill: '#f0f9ff', band: '#38bdf8' },
  fm: { stroke: '#4ade80', fill: '#f0fdf4', band: '#4ade80' },
  mf: { stroke: '#fb7185', fill: '#fff1f2', band: '#fb7185' },
  mm: { stroke: '#fbbf24', fill: '#fffbeb', band: '#fbbf24' },
};

/**
 * Walks the ancestor tree into Ahnentafel slots.
 *
 * getTree returns parents husband-first, but a family may record only a
 * mother — so a lone parent is placed by sex rather than by array position,
 * otherwise every ancestor above her would be numbered on the father's side.
 */
export function flattenAncestors(root: AncestorNode, maxGenerations: number): AncestorSlot[] {
  const slots: AncestorSlot[] = [];

  const walk = (node: AncestorNode, ahnentafel: number) => {
    slots.push({ ahnentafel, person: node.person });
    if (generationOf(ahnentafel) >= maxGenerations) return;

    const parents = node.parents ?? [];
    if (parents.length === 1) {
      const only = parents[0]!;
      walk(only, only.person.sex === 'F' ? ahnentafel * 2 + 1 : ahnentafel * 2);
      return;
    }
    parents.slice(0, 2).forEach((parent, i) => walk(parent, ahnentafel * 2 + i));
  };

  walk(root, 1);
  return slots.sort((a, b) => a.ahnentafel - b.ahnentafel);
}
