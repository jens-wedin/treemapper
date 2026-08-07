import { describe, it, expect } from 'vitest';
import { layoutPedigree, PED_W } from './pedigreeLayout';
import type { AncestorSlot } from './ahnentafel';
import type { TreePerson } from '../../lib/tree';

const P = (id: string): TreePerson => ({
  id, givenName: id, surname: 'X', birthYear: null, deathYear: null, sex: 'U', photoId: null, country: null,
});
const slot = (n: number, id: string): AncestorSlot => ({ ahnentafel: n, person: P(id) });

/** Focus, both parents, all four grandparents. */
const full: AncestorSlot[] = [
  slot(1, 'jag'), slot(2, 'far'), slot(3, 'mor'),
  slot(4, 'farfar'), slot(5, 'farmor'), slot(6, 'morfar'), slot(7, 'mormor'),
];

describe('layoutPedigree', () => {
  const r = layoutPedigree(full, 2);
  const at = (id: string) => r.nodes.find(n => n.person.id === id)!;

  it('lägger generationerna i kolumner från vänster', () => {
    expect(at('jag').x).toBe(0);
    expect(at('far').x).toBeGreaterThan(at('jag').x);
    expect(at('farfar').x).toBeGreaterThan(at('far').x);
    expect(at('far').x).toBe(at('mor').x);           // samma generation, samma kolumn
    expect(at('farfar').x).toBe(at('mormor').x);
  });

  it('sätter fadern över modern', () => {
    expect(at('far').y).toBeLessThan(at('mor').y);
    expect(at('farfar').y).toBeLessThan(at('farmor').y);
    expect(at('morfar').y).toBeLessThan(at('mormor').y);
  });

  it('centrerar ett barn mellan sina föräldrar', () => {
    expect(at('far').y).toBeCloseTo((at('farfar').y + at('farmor').y) / 2, 5);
    expect(at('mor').y).toBeCloseTo((at('morfar').y + at('mormor').y) / 2, 5);
    expect(at('jag').y).toBeCloseTo((at('far').y + at('mor').y) / 2, 5);
  });

  it('färgar de fyra grenarna', () => {
    expect(at('jag').branch).toBe('focus');
    expect(at('farfar').branch).toBe('ff');
    expect(at('farmor').branch).toBe('fm');
    expect(at('morfar').branch).toBe('mf');
    expect(at('mormor').branch).toBe('mm');
  });

  it('ritar en länk per känd förälder', () => {
    expect(r.links).toHaveLength(6);
    expect(r.links.every(l => l.path.startsWith('M '))).toBe(true);
  });

  it('hoppar över saknade förfäder utan att flytta de kända', () => {
    const gaps: AncestorSlot[] = [slot(1, 'jag'), slot(3, 'mor'), slot(6, 'morfar')];
    const g = layoutPedigree(gaps, 2);
    expect(g.nodes.map(n => n.person.id).sort()).toEqual(['jag', 'mor', 'morfar']);
    expect(g.links).toHaveLength(2);                       // jag→mor, mor→morfar
    // moderns plats i rutnätet är densamma som när fadern finns
    expect(g.nodes.find(n => n.person.id === 'mor')!.y).toBe(at('mor').y);
  });

  it('ger unika nycklar även när samma person förekommer två gånger', () => {
    const collapse: AncestorSlot[] = [
      slot(1, 'jag'), slot(2, 'far'), slot(3, 'mor'),
      slot(4, 'anfader'), slot(6, 'anfader'),   // samma person i två grenar
    ];
    const c = layoutPedigree(collapse, 2);
    const keys = c.nodes.filter(n => n.person.id === 'anfader').map(n => n.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('bygger en navigeringskarta', () => {
    const jag = at('jag');
    const far = at('far');
    expect(r.nav[jag.key]?.right).toBe(far.key);          // höger = uppåt i släkten
    expect(r.nav[far.key]?.left).toBe(jag.key);
    expect(r.nav[far.key]?.down).toBe(at('mor').key);     // nästa i samma generation
    expect(r.nav[at('mor').key]?.up).toBe(far.key);
  });

  it('täcker alla kort med sina gränser', () => {
    const xs = r.nodes.map(n => n.x);
    expect(r.bounds.minX).toBeLessThanOrEqual(Math.min(...xs));
    expect(r.bounds.maxX).toBeGreaterThanOrEqual(Math.max(...xs) + PED_W / 2);
  });
});
