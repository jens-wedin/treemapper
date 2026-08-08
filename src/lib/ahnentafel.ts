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
  /** The chart stops here but the person has parents on record. */
  hasMoreAncestors?: boolean;
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

/**
 * The four branch hues used by both ancestor views.
 *
 * These are CSS variables rather than literals so the charts follow light and
 * dark mode; index.css holds both palettes. They must be applied through
 * `style`, not as SVG presentation attributes — `fill="var(--x)"` does not
 * resolve as an attribute.
 */
export const BRANCH_COLORS: Record<Branch, { stroke: string; fill: string; band: string }> = {
  focus: { stroke: 'var(--branch-focus-stroke)', fill: 'var(--branch-focus-fill)', band: 'var(--branch-focus-band)' },
  ff: { stroke: 'var(--branch-ff-stroke)', fill: 'var(--branch-ff-fill)', band: 'var(--branch-ff-stroke)' },
  fm: { stroke: 'var(--branch-fm-stroke)', fill: 'var(--branch-fm-fill)', band: 'var(--branch-fm-stroke)' },
  mf: { stroke: 'var(--branch-mf-stroke)', fill: 'var(--branch-mf-fill)', band: 'var(--branch-mf-stroke)' },
  mm: { stroke: 'var(--branch-mm-stroke)', fill: 'var(--branch-mm-fill)', band: 'var(--branch-mm-stroke)' },
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
    const atEdge = generationOf(ahnentafel) >= maxGenerations;
    slots.push({
      ahnentafel,
      person: node.person,
      // Either the payload stopped here, or we are trimming it ourselves.
      hasMoreAncestors: atEdge ? (node.hasMoreAncestors ?? node.parents.length > 0) : node.hasMoreAncestors,
    });
    if (atEdge) return;

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

/**
 * Re-numbers a separately fetched ancestor tree as if it had always hung at
 * `under` in the main chart, so an expanded branch keeps the same numbering —
 * and therefore the same branch colour and grid position — as the rest.
 *
 * A slot's own number carries its generation in the leading bit; stripping that
 * bit leaves the path, which is what gets appended below `under`.
 */
export function graftAt(under: number, slots: AncestorSlot[]): AncestorSlot[] {
  return slots.map(slot => {
    const generation = generationOf(slot.ahnentafel);
    const path = slot.ahnentafel - 2 ** generation;
    return { ...slot, ahnentafel: under * 2 ** generation + path };
  });
}
