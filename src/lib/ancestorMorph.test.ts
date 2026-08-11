import { describe, expect, it } from 'vitest';
import type { TreePerson } from '../../lib/tree';
import type { AncestorSlot } from './ahnentafel';
import { layoutPedigree } from './pedigreeLayout';
import { layoutFan } from './fanLayout';
import { planMorph, shortestTurn } from './ancestorMorph';

const person = (id: string): TreePerson => ({
  id, givenName: id, surname: 'Test', birthYear: 1900, deathYear: 1980,
  birthDate: null, deathDate: null, sex: 'U', photoId: null, country: null,
});

/** A full three-generation ancestor set: 1..7. */
const slots: AncestorSlot[] = [1, 2, 3, 4, 5, 6, 7].map(n => ({ ahnentafel: n, person: person(`I${n}`) }));

const plan = () => planMorph(layoutPedigree(slots), layoutFan(slots, 3));

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('the two ends of the morph', () => {
  it('starts every ancestor exactly where the antavla draws them', () => {
    const pedigree = layoutPedigree(slots);
    const focus = pedigree.nodes.find(n => n.isFocus)!;
    const points = plan().points(0);

    for (const point of points) {
      const node = pedigree.nodes.find(n => n.ahnentafel === point.ahnentafel)!;
      // x and y are card centres, and the whole chart is shifted so the focus
      // card sits on the fan's centre.
      near(point.x, node.x - focus.x);
      near(point.y, node.y - focus.y);
    }
  });

  it('ends every ancestor exactly on their fan-chart slice', () => {
    const fan = layoutFan(slots, 3);
    const points = plan().points(1);

    for (const slice of fan.slices) {
      const point = points.find(p => p.ahnentafel === slice.ahnentafel)!;
      const r = (slice.innerR + slice.outerR) / 2;
      const angle = (slice.startAngle + slice.endAngle) / 2;
      near(point.x, Math.sin(angle) * r);
      near(point.y, -Math.cos(angle) * r);
    }
  });

  it('leaves the focus person at the centre, where the fan chart puts them', () => {
    for (const t of [0, 0.5, 1]) {
      const focus = plan().points(t).find(p => p.ahnentafel === 1)!;
      near(focus.x, 0);
      near(focus.y, 0);
    }
  });
});

describe('the path between them', () => {
  it('turns the short way round', () => {
    // Straight interpolation from +3.0 to -3.0 would sweep almost the whole
    // circle the wrong way; the turn is 0.28 rad across π, not 6.0 rad.
    near(shortestTurn(3.0, -3.0), 2 * Math.PI - 6.0);
    near(shortestTurn(-3.0, 3.0), 6.0 - 2 * Math.PI);
    near(shortestTurn(0.2, 0.5), 0.3);
  });

  it('moves the radius steadily outwards, never doubling back', () => {
    const p = plan();
    const radii = (t: number) => new Map(p.points(t).map(x => [x.ahnentafel, Math.hypot(x.x, x.y)]));
    const steps = [0, 0.25, 0.5, 0.75, 1].map(radii);

    for (const { ahnentafel } of p.points(0)) {
      const series = steps.map(m => m.get(ahnentafel)!);
      const rising = series[4]! >= series[0]!;
      for (let i = 1; i < series.length; i++) {
        if (rising) expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]! - 1e-9);
        else expect(series[i]).toBeLessThanOrEqual(series[i - 1]! + 1e-9);
      }
    }
  });

  it('turns each marker to face the way its wedge does', () => {
    const fan = layoutFan(slots, 3);
    const slice = fan.slices[0]!;
    const at = (t: number) => plan().points(t).find(p => p.ahnentafel === slice.ahnentafel)!;

    near(at(0).rotation, 0);                                            // upright, like the card
    near(at(1).rotation, (slice.startAngle + slice.endAngle) / 2);       // along its ring
  });
});

describe('what is left out', () => {
  it('skips an ancestor the fan chart does not draw', () => {
    // One generation of rings: the parents get slices, the grandparents (4..7,
    // which is generation 2) have nothing to land on.
    const shallow = planMorph(layoutPedigree(slots), layoutFan(slots, 1));
    expect(shallow.points(0).map(p => p.ahnentafel).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('skips an ancestor the antavla does not draw', () => {
    const fewer = slots.filter(s => s.ahnentafel !== 5);
    const plan = planMorph(layoutPedigree(fewer), layoutFan(slots, 3));
    expect(plan.points(0).some(p => p.ahnentafel === 5)).toBe(false);
  });

  it('covers both charts, so nothing flies outside the box', () => {
    const { bounds } = plan();
    for (const t of [0, 0.5, 1]) {
      for (const point of plan().points(t)) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.minX);
        expect(point.x).toBeLessThanOrEqual(bounds.maxX);
        expect(point.y).toBeGreaterThanOrEqual(bounds.minY);
        expect(point.y).toBeLessThanOrEqual(bounds.maxY);
      }
    }
  });

  it('carries the person and their branch colour along', () => {
    const point = plan().points(0.5).find(p => p.ahnentafel === 4)!;
    expect(point.person.id).toBe('I4');
    expect(point.branch).toBe('ff');
  });
});
