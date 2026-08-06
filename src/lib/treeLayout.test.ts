import { describe, it, expect } from 'vitest';
import { layoutTree } from './treeLayout';
import type { TreeData, TreePerson } from '../../lib/tree';

const P = (id: string): TreePerson => ({ id, givenName: id, surname: 'X', birthYear: null, deathYear: null, sex: 'U', photoId: null });
const data: TreeData = {
  focus: P('F'),
  ancestors: { person: P('F'), parents: [
    { person: P('far'), parents: [{ person: P('farfar'), parents: [] }] },
    { person: P('mor'), parents: [] },
  ] },
  descendants: { person: P('F'), children: [
    { person: P('barn1'), children: [{ person: P('barnbarn'), children: [] }] },
    { person: P('barn2'), children: [] },
  ] },
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
      descendants: { person: P('F'), children: [] },
    };
    const rr = layoutTree(dup);
    const keys = rr.nodes.filter(n => n.person.id === 'anfader').map(n => n.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('computes bounds covering all nodes', () => {
    expect(r.bounds.minY).toBeLessThan(0);
    expect(r.bounds.maxY).toBeGreaterThan(0);
    expect(r.bounds.minX).toBeLessThan(r.bounds.maxX);
  });
});
