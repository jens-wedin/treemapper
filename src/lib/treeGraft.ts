import type { AncestorNode, DescendantNode, TreeData } from '../../lib/tree';

/**
 * Splicing separately fetched generations into the family chart.
 *
 * The family view keys its cards by their path through the tree rather than by
 * person — the same person can sit in two places. A graft therefore replaces
 * the node at one path and leaves every other path untouched, which is what
 * lets React keep those cards and animate them to their new positions instead
 * of tearing the chart down.
 */
export type Path = readonly number[];

export interface Expansion {
  /** 'up' unfolds parents, 'down' unfolds children. */
  direction: 'up' | 'down';
  path: Path;
  /** The freshly fetched tree, rooted at the person being unfolded. */
  branch: TreeData;
}

function replaceAncestor(node: AncestorNode, path: Path, sub: AncestorNode): AncestorNode {
  if (!path.length) return { ...node, parents: sub.parents, hasMoreAncestors: sub.hasMoreAncestors };
  const [step, ...rest] = path;
  if (!node.parents[step!]) return node;
  return {
    ...node,
    parents: node.parents.map((p, i) => (i === step ? replaceAncestor(p, rest, sub) : p)),
  };
}

function replaceDescendant(node: DescendantNode, path: Path, sub: DescendantNode): DescendantNode {
  if (!path.length) {
    // The fetched root carries the partners too: a leaf card is drawn without
    // them, so unfolding is where a couple first appears.
    return {
      ...node,
      spouses: sub.spouses,
      children: sub.children,
      hasMoreDescendants: sub.hasMoreDescendants,
    };
  }
  const [step, ...rest] = path;
  if (!node.children[step!]) return node;
  return {
    ...node,
    children: node.children.map((c, i) => (i === step ? replaceDescendant(c, rest, sub) : c)),
  };
}

/**
 * Applies expansions in order. One opened inside another only takes effect
 * once its host is in place, and silently does nothing if the host was folded
 * away — the caller can keep it around in case the host comes back.
 */
export function applyExpansions(data: TreeData, expansions: Iterable<Expansion>): TreeData {
  let result = data;
  for (const { direction, path, branch } of expansions) {
    result = direction === 'up'
      ? { ...result, ancestors: replaceAncestor(result.ancestors, path, branch.ancestors) }
      : { ...result, descendants: replaceDescendant(result.descendants, path, branch.descendants) };
  }
  return result;
}
