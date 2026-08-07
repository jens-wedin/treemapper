import { describe, it, expect } from 'vitest';
import { generationOf, branchOf, flattenAncestors } from './ahnentafel';
import type { AncestorNode, TreePerson } from '../../lib/tree';

const P = (id: string, sex: 'M' | 'F' | 'U' = 'U'): TreePerson => ({
  id, givenName: id, surname: 'X', birthYear: null, deathYear: null, birthDate: null, deathDate: null, sex, photoId: null, country: null,
});
const A = (id: string, sex: 'M' | 'F' | 'U', parents: AncestorNode[] = []): AncestorNode =>
  ({ person: P(id, sex), parents });

describe('generationOf', () => {
  it('följer anfarsnumreringen', () => {
    expect(generationOf(1)).toBe(0);       // personen själv
    expect(generationOf(2)).toBe(1);       // far
    expect(generationOf(3)).toBe(1);       // mor
    expect(generationOf(4)).toBe(2);
    expect(generationOf(7)).toBe(2);
    expect(generationOf(8)).toBe(3);
    expect(generationOf(255)).toBe(7);
  });
});

describe('branchOf', () => {
  it('ger de fyra mor-/farföräldragrenarna', () => {
    expect(branchOf(1)).toBe('focus');
    expect(branchOf(2)).toBe('ff');   // far
    expect(branchOf(3)).toBe('mm');   // mor
    expect(branchOf(4)).toBe('ff');   // farfar
    expect(branchOf(5)).toBe('fm');   // farmor
    expect(branchOf(6)).toBe('mf');   // morfar
    expect(branchOf(7)).toBe('mm');   // mormor
  });

  it('ärver grenen nedåt i djupare led', () => {
    // 10 = 1010b → efter ledande 1: 010 → första två bitarna 01 = farmors gren
    expect(branchOf(10)).toBe('fm');
    expect(branchOf(11)).toBe('fm');
    expect(branchOf(21)).toBe('fm');
    expect(branchOf(12)).toBe('mf');
    expect(branchOf(15)).toBe('mm');
  });
});

describe('flattenAncestors', () => {
  it('numrerar far till 2n och mor till 2n+1', () => {
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

  it('placerar en ensam mor på 2n+1, inte på faderns plats', () => {
    const tree = A('barn', 'U', [A('ensam mor', 'F')]);
    const slots = flattenAncestors(tree, 2);
    expect(slots.find(s => s.person.id === 'ensam mor')!.ahnentafel).toBe(3);
  });

  it('placerar en ensam far på 2n', () => {
    const tree = A('barn', 'U', [A('ensam far', 'M')]);
    expect(flattenAncestors(tree, 2).find(s => s.person.id === 'ensam far')!.ahnentafel).toBe(2);
  });

  it('respekterar maxgenerationer', () => {
    const tree = A('barn', 'M', [A('far', 'M', [A('farfar', 'M')])]);
    expect(flattenAncestors(tree, 1).map(s => s.ahnentafel)).toEqual([1, 2]);
    expect(flattenAncestors(tree, 0).map(s => s.ahnentafel)).toEqual([1]);
  });

  it('klarar luckor utan att flytta syskonplatser', () => {
    // ingen far alls, men mor med sina föräldrar
    const tree = A('barn', 'U', [A('mor', 'F', [A('morfar', 'M'), A('mormor', 'F')])]);
    const byNumber = Object.fromEntries(flattenAncestors(tree, 3).map(s => [s.ahnentafel, s.person.id]));
    expect(byNumber).toEqual({ 1: 'barn', 3: 'mor', 6: 'morfar', 7: 'mormor' });
  });
});
