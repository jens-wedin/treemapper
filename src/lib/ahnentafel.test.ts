import { describe, it, expect } from 'vitest';
import { generationOf, branchOf, flattenAncestors, graftAt } from './ahnentafel';
import type { AncestorNode, TreePerson } from '../../lib/tree';

const P = (id: string, sex: 'M' | 'F' | 'U' = 'U'): TreePerson => ({
  id, givenName: id, surname: 'X', birthYear: null, deathYear: null, birthDate: null, deathDate: null, sex, photoId: null, country: null,
});
const A = (id: string, sex: 'M' | 'F' | 'U', parents: AncestorNode[] = []): AncestorNode =>
  ({ person: P(id, sex), parents });

describe('generationOf', () => {
  it('follows ahnentafel numbering', () => {
    expect(generationOf(1)).toBe(0);       // the person themselves
    expect(generationOf(2)).toBe(1);       // far
    expect(generationOf(3)).toBe(1);       // mor
    expect(generationOf(4)).toBe(2);
    expect(generationOf(7)).toBe(2);
    expect(generationOf(8)).toBe(3);
    expect(generationOf(255)).toBe(7);
  });
});

describe('branchOf', () => {
  it('gives the four grandparent branches', () => {
    expect(branchOf(1)).toBe('focus');
    expect(branchOf(2)).toBe('ff');   // far
    expect(branchOf(3)).toBe('mm');   // mor
    expect(branchOf(4)).toBe('ff');   // farfar
    expect(branchOf(5)).toBe('fm');   // farmor
    expect(branchOf(6)).toBe('mf');   // morfar
    expect(branchOf(7)).toBe('mm');   // mormor
  });

  it('inherits the branch downward through deeper generations', () => {
    // 10 = 1010b → after the leading 1: 010 → the first two bits 01 = the paternal grandmother's branch
    expect(branchOf(10)).toBe('fm');
    expect(branchOf(11)).toBe('fm');
    expect(branchOf(21)).toBe('fm');
    expect(branchOf(12)).toBe('mf');
    expect(branchOf(15)).toBe('mm');
  });
});

describe('flattenAncestors', () => {
  it('numbers the father 2n and the mother 2n+1', () => {
    const tree = A('barn', 'M', [
      A('far', 'M', [A('farfar', 'M'), A('farmor', 'F')]),
      A('mor', 'F', [A('morfar', 'M'), A('mormor', 'F')]),
    ]);
    const slots = flattenAncestors(tree, 3);
    const byNumber = Object.fromEntries(slots.map(s => [s.ahnentafel, s.person.id]));
    expect(byNumber).toEqual({
      1: 'barn', 2: 'far', 3: 'mor', 4: 'farfar', 5: 'farmor', 6: 'morfar', 7: 'mormor',
    });
  });

  it('places a lone mother at 2n+1, not in the father\'s slot', () => {
    const tree = A('barn', 'U', [A('ensam mor', 'F')]);
    const slots = flattenAncestors(tree, 2);
    expect(slots.find(s => s.person.id === 'ensam mor')!.ahnentafel).toBe(3);
  });

  it('places a lone father at 2n', () => {
    const tree = A('barn', 'U', [A('ensam far', 'M')]);
    expect(flattenAncestors(tree, 2).find(s => s.person.id === 'ensam far')!.ahnentafel).toBe(2);
  });

  it('respekterar maxgenerationer', () => {
    const tree = A('barn', 'M', [A('far', 'M', [A('farfar', 'M')])]);
    expect(flattenAncestors(tree, 1).map(s => s.ahnentafel)).toEqual([1, 2]);
    expect(flattenAncestors(tree, 0).map(s => s.ahnentafel)).toEqual([1]);
  });

  it('copes with gaps without moving sibling slots', () => {
    // no father at all, but a mother with her own parents
    const tree = A('barn', 'U', [A('mor', 'F', [A('morfar', 'M'), A('mormor', 'F')])]);
    const byNumber = Object.fromEntries(flattenAncestors(tree, 3).map(s => [s.ahnentafel, s.person.id]));
    expect(byNumber).toEqual({ 1: 'barn', 3: 'mor', 6: 'morfar', 7: 'mormor' });
  });
});

describe('graftAt', () => {
  const sub = flattenAncestors(
    A('rot', 'M', [A('far', 'M', [A('farfar', 'M'), A('farmor', 'F')]), A('mor', 'F')]),
    2,
  );

  it('renumbers a fetched branch as though it had been there all along', () => {
    // the branch hangs under the maternal grandmother (7): her father becomes 14, her grandfather 28
    const grafted = Object.fromEntries(graftAt(7, sub).map(s => [s.ahnentafel, s.person.id]));
    expect(grafted).toEqual({ 7: 'rot', 14: 'far', 15: 'mor', 28: 'farfar', 29: 'farmor' });
  });

  it('lets the root keep its place', () => {
    expect(graftAt(5, sub).find(s => s.person.id === 'rot')!.ahnentafel).toBe(5);
    expect(graftAt(1, sub).map(s => s.ahnentafel)).toEqual(sub.map(s => s.ahnentafel));
  });

  it('keeps the branch colour from the main chart', () => {
    // everything hung under a maternal grandfather (6) belongs to the mf branch
    for (const slot of graftAt(6, sub)) expect(branchOf(slot.ahnentafel)).toBe('mf');
  });
});
