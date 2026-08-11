import { describe, it, expect } from 'vitest';
import { layoutPedigree, PED_W, ROW_STEP } from './pedigreeLayout';
import type { AncestorSlot } from './ahnentafel';
import type { TreePerson } from '../../lib/tree';

const P = (id: string): TreePerson => ({
  id, givenName: id, surname: 'X', birthYear: null, deathYear: null, birthDate: null, deathDate: null, sex: 'U', photoId: null, country: null,
});
const slot = (n: number, id: string): AncestorSlot => ({ ahnentafel: n, person: P(id) });

/** Focus, both parents, all four grandparents. */
const full: AncestorSlot[] = [
  slot(1, 'jag'), slot(2, 'far'), slot(3, 'mor'),
  slot(4, 'farfar'), slot(5, 'farmor'), slot(6, 'morfar'), slot(7, 'mormor'),
];

describe('layoutPedigree', () => {
  const r = layoutPedigree(full);
  const at = (id: string) => r.nodes.find(n => n.person.id === id)!;

  it('lays the generations out in columns from the left', () => {
    expect(at('jag').x).toBe(0);
    expect(at('far').x).toBeGreaterThan(at('jag').x);
    expect(at('farfar').x).toBeGreaterThan(at('far').x);
    expect(at('far').x).toBe(at('mor').x);           // samma generation, samma kolumn
    expect(at('farfar').x).toBe(at('mormor').x);
  });

  it('puts the father above the mother', () => {
    expect(at('far').y).toBeLessThan(at('mor').y);
    expect(at('farfar').y).toBeLessThan(at('farmor').y);
    expect(at('morfar').y).toBeLessThan(at('mormor').y);
  });

  it('centres a child between its parents', () => {
    expect(at('far').y).toBeCloseTo((at('farfar').y + at('farmor').y) / 2, 5);
    expect(at('mor').y).toBeCloseTo((at('morfar').y + at('mormor').y) / 2, 5);
    expect(at('jag').y).toBeCloseTo((at('far').y + at('mor').y) / 2, 5);
  });

  it('colours the four branches', () => {
    expect(at('jag').branch).toBe('focus');
    expect(at('farfar').branch).toBe('ff');
    expect(at('farmor').branch).toBe('fm');
    expect(at('morfar').branch).toBe('mf');
    expect(at('mormor').branch).toBe('mm');
  });

  it('draws one link for each known parent', () => {
    expect(r.links).toHaveLength(6);
    expect(r.links.every(l => l.path.startsWith('M '))).toBe(true);
  });

  it('skips missing ancestors', () => {
    const gaps: AncestorSlot[] = [slot(1, 'jag'), slot(3, 'mor'), slot(6, 'morfar')];
    const g = layoutPedigree(gaps);
    expect(g.nodes.map(n => n.person.id).sort()).toEqual(['jag', 'mor', 'morfar']);
    expect(g.links).toHaveLength(2);                       // jag→mor, mor→morfar
  });

  it('holds an empty row for the parent that is missing', () => {
    // only the mother known → she sits below the empty father's slot
    const motherOnly = layoutPedigree([slot(1, 'jag'), slot(3, 'mor')]);
    const m = motherOnly.nodes.find(n => n.person.id === 'mor')!;
    expect(m.y).toBeGreaterThan(motherOnly.nodes.find(n => n.isFocus)!.y);

    // only the father known → he sits above the empty mother's slot
    const fatherOnly = layoutPedigree([slot(1, 'jag'), slot(2, 'far')]);
    const f = fatherOnly.nodes.find(n => n.person.id === 'far')!;
    expect(f.y).toBeLessThan(fatherOnly.nodes.find(n => n.isFocus)!.y);
  });

  it('reserves no room for branches that are missing entirely', () => {
    // a straight paternal line through five generations: the grid has 32 rows,
    // but the line needs only a handful — otherwise the chart shrinks past reading
    const line = [1, 2, 4, 8, 16, 32].map((n, i) => slot(n, `g${i}`));
    const l = layoutPedigree(line);
    const ys = l.nodes.map(n => n.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(6 * ROW_STEP);
  });

  it('gives unique keys even when the same person appears twice', () => {
    const collapse: AncestorSlot[] = [
      slot(1, 'jag'), slot(2, 'far'), slot(3, 'mor'),
      slot(4, 'anfader'), slot(6, 'anfader'),   // the same person in two branches
    ];
    const c = layoutPedigree(collapse);
    const keys = c.nodes.filter(n => n.person.id === 'anfader').map(n => n.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('bygger en navigeringskarta', () => {
    const jag = at('jag');
    const far = at('far');
    expect(r.nav[jag.key]?.right).toBe(far.key);          // right = up the family
    expect(r.nav[far.key]?.left).toBe(jag.key);
    expect(r.nav[far.key]?.down).toBe(at('mor').key);     // the next in the same generation
    expect(r.nav[at('mor').key]?.up).toBe(far.key);
  });

  it('covers every card with its bounds', () => {
    const xs = r.nodes.map(n => n.x);
    expect(r.bounds.minX).toBeLessThanOrEqual(Math.min(...xs));
    expect(r.bounds.maxX).toBeGreaterThanOrEqual(Math.max(...xs) + PED_W / 2);
  });

  describe('continuation buttons', () => {
    const edge: AncestorSlot[] = [
      slot(1, 'jag'), slot(2, 'far'), slot(3, 'mor'),
      { ...slot(4, 'farfar'), hasMoreAncestors: true },
      { ...slot(5, 'farmor'), hasMoreAncestors: false },
      { ...slot(7, 'mormor'), hasMoreAncestors: true },
    ];
    const e = layoutPedigree(edge);

    it('gives a button only to outermost cards that have more ancestors', () => {
      expect(e.handles.map(h => h.person.id).sort()).toEqual(['farfar', 'mormor']);
      expect(e.handles.every(h => h.action === 'expand')).toBe(true);
    });

    it('puts the button to the right of its card, at the same height', () => {
      const node = e.nodes.find(n => n.person.id === 'farfar')!;
      const button = e.handles.find(h => h.person.id === 'farfar')!;
      expect(button.y).toBe(node.y);
      expect(button.x).toBeGreaterThan(node.x + PED_W / 2);
    });

    it('fits inside the chart\'s bounds', () => {
      expect(e.bounds.maxX).toBeGreaterThanOrEqual(Math.max(...e.handles.map(h => h.x)));
    });

    it('is reached with the right arrow from the card, and the left arrow back', () => {
      const node = e.nodes.find(n => n.person.id === 'farfar')!;
      const button = e.handles.find(h => h.person.id === 'farfar')!;
      expect(e.nav[node.key]?.right).toBe(button.key);
      expect(e.nav[button.key]?.left).toBe(node.key);
    });

    it('lets the right arrow go to a real ancestor when one is drawn', () => {
      const far = r.nodes.find(n => n.person.id === 'far')!;
      expect(r.nav[far.key]?.right).toBe(r.nodes.find(n => n.person.id === 'farfar')!.key);
      expect(r.handles).toEqual([]);   // no flagged endings in the complete tree
    });

    it('switches to a collapse button for the branch that was opened', () => {
      // the paternal grandfather (4) is expanded: his parents are drawn now
      const opened: AncestorSlot[] = [
        ...edge,
        slot(8, 'farfars far'), { ...slot(9, 'farfars mor'), hasMoreAncestors: true },
      ];
      const o = layoutPedigree(opened, new Set([4]));
      const farfar = o.handles.find(h => h.person.id === 'farfar')!;
      expect(farfar.action).toBe('collapse');
      // and the new outermost cards offer to continue in their turn
      expect(o.handles.filter(h => h.action === 'expand').map(h => h.person.id).sort())
        .toEqual(['farfars mor', 'mormor']);
    });

    it('puts the collapse button between the card and the expanded branch', () => {
      const opened = layoutPedigree([...edge, slot(8, 'farfars far')], new Set([4]));
      const node = opened.nodes.find(n => n.person.id === 'farfar')!;
      const button = opened.handles.find(h => h.person.id === 'farfar')!;
      const parent = opened.nodes.find(n => n.person.id === 'farfars far')!;
      expect(button.x).toBeGreaterThan(node.x + PED_W / 2);
      expect(button.x).toBeLessThan(parent.x - PED_W / 2);
      // the right arrow stops at the button, then carries on to the parent
      expect(opened.nav[node.key]?.right).toBe(button.key);
      expect(opened.nav[button.key]?.right).toBe(parent.key);
    });
  });
});
