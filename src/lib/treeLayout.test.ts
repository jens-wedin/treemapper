import { describe, it, expect } from 'vitest';
import { layoutTree, NODE_W } from './treeLayout';
import { branchOf, flattenAncestors } from './ahnentafel';
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

  it('places a partner beside the person and hangs the children between them', () => {
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

  /**
   * Partner cards sit to the right of the person, so the gap to the next
   * sibling has to cover them. d3 calls separation(a, b) with the current node
   * and its *previous* sibling in one place and the other way round in
   * another, so a rule that reads only `a` reserved the space on the wrong
   * side — and a partner card landed 121 px inside the next sibling.
   */
  describe('cards do not collide', () => {
    const rowOverlap = (children: DescendantNode[]) => {
      const r2 = layoutTree({
        focus: P('F'), ancestors: { person: P('F'), parents: [] }, descendants: D('F', { children }),
      });
      const row = r2.nodes.filter(n => n.y > 0).sort((a, b) => a.x - b.x);
      let worst = 0;
      for (let i = 0; i + 1 < row.length; i++) {
        worst = Math.min(worst, (row[i + 1]!.x - NODE_W / 2) - (row[i]!.x + NODE_W / 2));
      }
      return worst;
    };

    it('leaves room for the partner whichever sibling has one', () => {
      expect(rowOverlap([D('a', { spouses: [P('make') ] }), D('b')])).toBeGreaterThanOrEqual(0);
      expect(rowOverlap([D('a'), D('b', { spouses: [P('make')] })])).toBeGreaterThanOrEqual(0);
    });

    it('leaves room for several partners and several siblings too', () => {
      expect(rowOverlap([
        D('a', { spouses: [P('m1'), P('m2')] }),
        D('b', { spouses: [P('m3')] }),
        D('c'),
        D('d', { spouses: [P('m4')] }),
      ])).toBeGreaterThanOrEqual(0);
    });

    it('leaves room for cousins in different families', () => {
      // syskonen ligger i skilda undergrenar — d3 jämför då konturer, inte syskon
      const r2 = layoutTree({
        focus: P('F'),
        ancestors: { person: P('F'), parents: [] },
        descendants: D('F', { children: [
          D('gren1', { children: [D('x', { spouses: [P('mx')] })] }),
          D('gren2', { children: [D('y')] }),
        ] }),
      });
      const deepest = Math.max(...r2.nodes.map(n => n.y));
      const row = r2.nodes.filter(n => n.y === deepest).sort((a, b) => a.x - b.x);
      for (let i = 0; i + 1 < row.length; i++) {
        expect((row[i + 1]!.x - NODE_W / 2) - (row[i]!.x + NODE_W / 2)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('hangs children from the right marriage when a person has several partners', () => {
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

  describe('branch colours', () => {
    it('colours the ancestors as the pedigree and fan charts do', () => {
      expect(byId('F')[0]!.branch).toBe('focus');
      expect(byId('far')[0]!.branch).toBe('ff');
      expect(byId('mor')[0]!.branch).toBe('mm');
      expect(byId('farfar')[0]!.branch).toBe('ff');
    });

    it('leaves the descendants uncoloured — they belong to no grandparent branch', () => {
      expect(byId('barn1')[0]!.branch).toBe('focus');
      expect(byId('barnbarn')[0]!.branch).toBe('focus');
    });

    it('places a lone parent by sex, exactly as ahnentafel numbering does', () => {
      // bara modern känd: hon hör till mödernet, inte fädernet
      const motherOnly: TreeData = {
        focus: P('F'),
        ancestors: { person: P('F'), parents: [{ person: { ...P('mor'), sex: 'F' }, parents: [
          { person: { ...P('mormor'), sex: 'F' }, parents: [] },
        ] }] },
        descendants: D('F'),
      };
      const m = layoutTree(motherOnly);
      expect(m.nodes.find(n => n.person.id === 'mor')!.branch).toBe('mm');
      expect(m.nodes.find(n => n.person.id === 'mormor')!.branch).toBe('mm');
    });

    it('gives the same branch as the pedigree chart for the same person', () => {
      // Vyerna räknar ut grenen var för sig; går de isär färgas samma
      // förfader olika beroende på vilken vy man råkar titta i.
      const mixed: TreeData = {
        focus: P('F'),
        ancestors: { person: P('F'), parents: [
          { person: { ...P('far'), sex: 'M' }, parents: [
            { person: { ...P('farmor'), sex: 'F' }, parents: [] },   // ensam mor i sin tur
          ] },
          { person: { ...P('mor'), sex: 'F' }, parents: [
            { person: { ...P('morfar'), sex: 'M' }, parents: [] },
            { person: { ...P('mormor'), sex: 'F' }, parents: [] },
          ] },
        ] },
        descendants: D('F'),
      };
      const fromTree = new Map(layoutTree(mixed).nodes.map(n => [n.person.id, n.branch]));
      const fromPedigree = new Map(
        flattenAncestors(mixed.ancestors, 5).map(s => [s.person.id, branchOf(s.ahnentafel)]),
      );
      for (const [id, branch] of fromPedigree) expect([id, fromTree.get(id)]).toEqual([id, branch]);
      expect(fromTree.get('farmor')).toBe('fm');     // placerad efter kön, inte position
    });

    it('tells the four grandparent branches apart', () => {
      const four: TreeData = {
        focus: P('F'),
        ancestors: { person: P('F'), parents: [
          { person: { ...P('far'), sex: 'M' }, parents: [
            { person: { ...P('farfar'), sex: 'M' }, parents: [] },
            { person: { ...P('farmor'), sex: 'F' }, parents: [] },
          ] },
          { person: { ...P('mor'), sex: 'F' }, parents: [
            { person: { ...P('morfar'), sex: 'M' }, parents: [] },
            { person: { ...P('mormor'), sex: 'F' }, parents: [] },
          ] },
        ] },
        descendants: D('F'),
      };
      const r4 = layoutTree(four);
      const branchOfId = (id: string) => r4.nodes.find(n => n.person.id === id)!.branch;
      expect([branchOfId('farfar'), branchOfId('farmor'), branchOfId('morfar'), branchOfId('mormor')])
        .toEqual(['ff', 'fm', 'mf', 'mm']);
    });
  });

  it('gives no buttons where nothing has flagged that the family continues', () => {
    expect(r.handles).toEqual([]);
  });

  describe('expand buttons', () => {
    const edges: TreeData = {
      focus: P('F'),
      ancestors: { person: P('F'), parents: [
        { person: P('far'), parents: [], hasMoreAncestors: true },
        { person: P('mor'), parents: [] },
      ] },
      descendants: D('F', { children: [
        D('barn1', { hasMoreDescendants: true }),
        D('barn2'),
      ] }),
    };
    const e = layoutTree(edges);
    const handleFor = (id: string) => e.handles.find(h => h.person.id === id);
    const nodeFor = (id: string) => e.nodes.find(n => n.person.id === id)!;

    it('puts an upward button above ancestors and a downward one below descendants', () => {
      expect(handleFor('far')).toMatchObject({ direction: 'up', action: 'expand' });
      expect(handleFor('barn1')).toMatchObject({ direction: 'down', action: 'expand' });
      expect(handleFor('mor')).toBeUndefined();       // ingen flagga, ingen knapp
      expect(handleFor('barn2')).toBeUndefined();
    });

    it('puts the button above or below its own card', () => {
      expect(handleFor('far')!.y).toBeLessThan(nodeFor('far').y);
      expect(handleFor('far')!.x).toBe(nodeFor('far').x);
      expect(handleFor('barn1')!.y).toBeGreaterThan(nodeFor('barn1').y);
    });

    it('points out where in the tree a fetched branch should be inserted', () => {
      expect(handleFor('far')!.path).toEqual([0]);        // första föräldern
      expect(handleFor('barn1')!.path).toEqual([0]);      // första barnet
    });

    it('makes the button a stop on the keyboard path', () => {
      const far = nodeFor('far');
      const barn1 = nodeFor('barn1');
      expect(e.nav[far.key]?.up).toBe(handleFor('far')!.key);
      expect(e.nav[handleFor('far')!.key]?.down).toBe(far.key);
      expect(e.nav[barn1.key]?.down).toBe(handleFor('barn1')!.key);
      expect(e.nav[handleFor('barn1')!.key]?.up).toBe(barn1.key);
    });

    it('switches to collapse for the branch that was opened, and passes the arrow on', () => {
      const opened: TreeData = {
        ...edges,
        ancestors: { person: P('F'), parents: [
          { person: P('far'), parents: [{ person: P('farfar'), parents: [] }] },
          { person: P('mor'), parents: [] },
        ] },
      };
      const o = layoutTree(opened, new Set(['hup:afocus.0']));
      const handle = o.handles.find(h => h.person.id === 'far')!;
      const far = o.nodes.find(n => n.person.id === 'far')!;
      const farfar = o.nodes.find(n => n.person.id === 'farfar')!;
      expect(handle.action).toBe('collapse');
      expect(handle.y).toBeLessThan(far.y);
      expect(handle.y).toBeGreaterThan(farfar.y);
      expect(o.nav[far.key]?.up).toBe(handle.key);
      expect(o.nav[handle.key]?.up).toBe(farfar.key);
    });

    it('puts the button below the marriage line when the person has a partner', () => {
      const couple: TreeData = {
        focus: P('F'),
        ancestors: { person: P('F'), parents: [] },
        descendants: D('F', { spouses: [P('make')], hasMoreDescendants: true }),
      };
      const c = layoutTree(couple);
      const focusNode = c.nodes.find(n => n.person.id === 'F')!;
      const spouse = c.nodes.find(n => n.person.id === 'make')!;
      expect(c.handles[0]!.x).toBeCloseTo((focusNode.x + spouse.x) / 2, 5);
    });

    it('covers the buttons with its bounds', () => {
      expect(e.bounds.minY).toBeLessThanOrEqual(Math.min(...e.handles.map(h => h.y)));
      expect(e.bounds.maxY).toBeGreaterThanOrEqual(Math.max(...e.handles.map(h => h.y)));
    });
  });
});
