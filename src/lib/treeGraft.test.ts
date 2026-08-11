import { describe, it, expect } from 'vitest';
import { applyExpansions, type Expansion } from './treeGraft';
import type { AncestorNode, DescendantNode, TreeData, TreePerson } from '../../lib/tree';

const P = (id: string): TreePerson => ({
  id, givenName: id, surname: 'X', birthYear: null, deathYear: null,
  birthDate: null, deathDate: null, sex: 'U', photoId: null, country: null,
});
const A = (id: string, parents: AncestorNode[] = [], hasMoreAncestors?: boolean): AncestorNode =>
  ({ person: P(id), parents, hasMoreAncestors });
const D = (id: string, children: DescendantNode[] = [], spouses: TreePerson[] = [], hasMoreDescendants?: boolean): DescendantNode =>
  ({ person: P(id), children, spouses, familyIndex: 0, hasMoreDescendants });

/** Focus with two parents and two children; both edges flagged as continuing. */
const base: TreeData = {
  focus: P('jag'),
  ancestors: A('jag', [A('far', [], true), A('mor', [], true)]),
  descendants: D('jag', [D('barn1', [], [], true), D('barn2')]),
};

const up = (path: number[], branch: AncestorNode): Expansion =>
  ({ direction: 'up', path, branch: { focus: branch.person, ancestors: branch, descendants: D(branch.person.id) } });
const down = (path: number[], branch: DescendantNode): Expansion =>
  ({ direction: 'down', path, branch: { focus: branch.person, ancestors: A(branch.person.id), descendants: branch } });

describe('applyExpansions', () => {
  it('inserts fetched ancestors in the right place', () => {
    const r = applyExpansions(base, [up([0], A('far', [A('farfar'), A('farmor')]))]);
    expect(r.ancestors.parents[0]!.parents.map(p => p.person.id)).toEqual(['farfar', 'farmor']);
    expect(r.ancestors.parents[1]!.parents).toEqual([]);      // the mother is untouched
  });

  it('inserts fetched descendants and their partners', () => {
    const r = applyExpansions(base, [down([0], D('barn1', [D('barnbarn')], [P('svärbarn')]))]);
    expect(r.descendants.children[0]!.children.map(c => c.person.id)).toEqual(['barnbarn']);
    expect(r.descendants.children[0]!.spouses.map(s => s.id)).toEqual(['svärbarn']);
    expect(r.descendants.children[1]!.children).toEqual([]);
  });

  it('clears the continuation flag where the branch is now drawn', () => {
    const r = applyExpansions(base, [up([0], A('far', [A('farfar')]))]);
    expect(r.ancestors.parents[0]!.hasMoreAncestors).toBeFalsy();
    expect(r.ancestors.parents[1]!.hasMoreAncestors).toBe(true);   // untouched
  });

  it('leaves the other branches unchanged, so their cards can glide rather than be redrawn', () => {
    const r = applyExpansions(base, [up([0], A('far', [A('farfar')]))]);
    expect(r.ancestors.parents[1]).toBe(base.ancestors.parents[1]);
    expect(r.descendants).toBe(base.descendants);
  });

  it('can expand inside a branch that is already expanded', () => {
    const r = applyExpansions(base, [
      up([0], A('far', [A('farfar', [], true)])),
      up([0, 0], A('farfar', [A('farfars far')])),
    ]);
    expect(r.ancestors.parents[0]!.parents[0]!.parents.map(p => p.person.id)).toEqual(['farfars far']);
  });

  it('ignores a branch whose host has been collapsed', () => {
    // 'far' was never expanded, so the path [0,0] does not exist
    const r = applyExpansions(base, [up([0, 0], A('farfar', [A('farfars far')]))]);
    expect(r.ancestors.parents[0]!.parents).toEqual([]);
  });
});
