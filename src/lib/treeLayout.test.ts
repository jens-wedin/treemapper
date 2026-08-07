import { describe, it, expect } from 'vitest';
import { layoutTree } from './treeLayout';
import type { DescendantNode, TreeData, TreePerson } from '../../lib/tree';

const P = (id: string): TreePerson => ({ id, givenName: id, surname: 'X', birthYear: null, deathYear: null, birthDate: null, deathDate: null, sex: 'U', photoId: null, country: null });

/** Descendant node with the boring fields defaulted. */
const D = (id: string, extra: Partial<Omit<DescendantNode, 'person'>> = {}): DescendantNode =>
  ({ person: P(id), spouses: [], children: [], familyIndex: 0, ...extra });

const data: TreeData = {
  focus: P('F'),
  ancestors: { person: P('F'), parents: [
    { person: P('far'), parents: [{ person: P('farfar'), parents: [] }] },
    { person: P('mor'), parents: [] },
  ] },
  descendants: D('F', { children: [
    D('barn1', { children: [D('barnbarn')] }),
    D('barn2'),
  ] }),
};

describe('layoutTree', () => {
  const r = layoutTree(data);
  const byId = (id: string) => r.nodes.filter(n => n.person.id === id);

  it('places focus once at origin, ancestors above, descendants below', () => {
    expect(byId('F')).toHaveLength(1);
    expect(byId('F')[0]).toMatchObject({ x: 0, y: 0, isFocus: true });
    expect(byId('far')[0].y).toBeLessThan(0);
    expect(byId('farfar')[0].y).toBeLessThan(byId('far')[0].y);
    expect(byId('barn1')[0].y).toBeGreaterThan(0);
    expect(byId('barnbarn')[0].y).toBeGreaterThan(byId('barn1')[0].y);
    expect(byId('far')[0].x).not.toBe(byId('mor')[0].x);
  });

  it('links every edge', () => {
    expect(r.links).toHaveLength(6); // F-far, F-mor, far-farfar, F-barn1, F-barn2, barn1-barnbarn
  });

  it('builds the keyboard nav map', () => {
    const focusKey = byId('F')[0].key;
    const farKey = byId('far')[0].key;
    const morKey = byId('mor')[0].key;
    expect(r.nav[focusKey].up).toBe(farKey);
    expect(r.nav[focusKey].down).toBe(byId('barn1')[0].key);
    expect(r.nav[farKey].down).toBe(focusKey);
    // far and mor sit in the same row: adjacency one way or the other
    const neighbour = r.nav[morKey].left ?? r.nav[morKey].right;
    expect(r.nodes.find(n => n.key === neighbour)?.person.id).toBe('far');
  });

  it('gives duplicate persons distinct keys (pedigree collapse)', () => {
    const dup: TreeData = {
      focus: P('F'),
      ancestors: { person: P('F'), parents: [
        { person: P('far'), parents: [{ person: P('anfader'), parents: [] }] },
        { person: P('mor'), parents: [{ person: P('anfader'), parents: [] }] },
      ] },
      descendants: D('F'),
    };
    const rr = layoutTree(dup);
    const keys = rr.nodes.filter(n => n.person.id === 'anfader').map(n => n.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('placerar partner bredvid personen och hänger barnen mellan dem', () => {
    const withSpouse: TreeData = {
      focus: P('F'),
      ancestors: { person: P('F'), parents: [] },
      descendants: D('F', { spouses: [P('make')], children: [D('barn')] }),
    };
    const r2 = layoutTree(withSpouse);
    const focusNode = r2.nodes.find(n => n.person.id === 'F')!;
    const spouseNode = r2.nodes.find(n => n.person.id === 'make')!;
    const child = r2.nodes.find(n => n.person.id === 'barn')!;

    expect(spouseNode.isSpouse).toBe(true);
    expect(spouseNode.y).toBe(focusNode.y);              // samma generation
    expect(spouseNode.x).toBeGreaterThan(focusNode.x);   // till höger om personen

    // vigsellinje mellan korten
    const marriage = r2.links.filter(l => l.type === 'marriage');
    expect(marriage).toHaveLength(1);
    expect(marriage[0]!.y1).toBe(marriage[0]!.y2);

    // barnets länk utgår från mitten mellan makarna, inte från ena kortet
    const childLink = r2.links.find(l => l.type !== 'marriage' && l.y2 === child.y)!;
    expect(childLink.x1).toBeCloseTo((focusNode.x + spouseNode.x) / 2, 5);

    // partnern kan nås med tangentbordet och leder ned till barnet
    expect(r2.nav[spouseNode.key]?.down).toBe(child.key);
  });

  it('hänger barn från rätt äktenskap när personen har flera partner', () => {
    const remarried: TreeData = {
      focus: P('F'),
      ancestors: { person: P('F'), parents: [] },
      descendants: D('F', {
        spouses: [P('make1'), P('make2')],
        children: [D('barn1', { familyIndex: 0 }), D('barn2', { familyIndex: 1 })],
      }),
    };
    const r2 = layoutTree(remarried);
    const focusNode = r2.nodes.find(n => n.person.id === 'F')!;
    const s1 = r2.nodes.find(n => n.person.id === 'make1')!;
    const s2 = r2.nodes.find(n => n.person.id === 'make2')!;
    const b1 = r2.nodes.find(n => n.person.id === 'barn1')!;
    const b2 = r2.nodes.find(n => n.person.id === 'barn2')!;

    const linkFor = (child: typeof b1) =>
      r2.links.find(l => l.type !== 'marriage' && l.x2 === child.x && l.y2 === child.y)!;

    // barn 1 utgår från vigselstrecket mellan F och make1
    expect(linkFor(b1).x1).toBeCloseTo((focusNode.x + s1.x) / 2, 5);
    // barn 2 från strecket mellan make1 och make2 — inte från första äktenskapet
    expect(linkFor(b2).x1).toBeCloseTo((s1.x + s2.x) / 2, 5);
    expect(linkFor(b2).x1).not.toBeCloseTo(linkFor(b1).x1, 5);
  });

  it('computes bounds covering all nodes', () => {
    expect(r.bounds.minY).toBeLessThan(0);
    expect(r.bounds.maxY).toBeGreaterThan(0);
    expect(r.bounds.minX).toBeLessThan(r.bounds.maxX);
  });
});
