import { describe, it, expect } from 'vitest';
import { layoutFan, FAN_SPAN, RING } from './fanLayout';
import type { AncestorSlot } from './ahnentafel';
import type { TreePerson } from '../../lib/tree';

const P = (id: string): TreePerson => ({
  id, givenName: id, surname: 'X', birthYear: null, deathYear: null,
  birthDate: null, deathDate: null, sex: 'U', photoId: null, country: null,
});
const slot = (n: number, id: string): AncestorSlot => ({ ahnentafel: n, person: P(id) });

const full: AncestorSlot[] = [
  slot(1, 'jag'), slot(2, 'far'), slot(3, 'mor'),
  slot(4, 'farfar'), slot(5, 'farmor'), slot(6, 'morfar'), slot(7, 'mormor'),
];

describe('layoutFan', () => {
  const r = layoutFan(full, 2);
  const at = (id: string) => r.slices.find(s => s.person.id === id)!;

  it('lägger fokuspersonen i mitten, inte som en skiva', () => {
    expect(r.centre.person.id).toBe('jag');
    expect(r.slices.some(s => s.person.id === 'jag')).toBe(false);
  });

  it('delar solfjädern lika inom varje generation', () => {
    const gen1 = r.slices.filter(s => s.generation === 1).sort((a, b) => a.startAngle - b.startAngle);
    expect(gen1).toHaveLength(2);
    const width = gen1[0]!.endAngle - gen1[0]!.startAngle;
    expect(width).toBeCloseTo(FAN_SPAN / 2, 6);
    // skivorna gränsar till varandra och håller sig inom solfjäderns vinkel
    expect(gen1[0]!.endAngle).toBeCloseTo(gen1[1]!.startAngle, 6);
    expect(gen1[0]!.startAngle).toBeCloseTo(-FAN_SPAN / 2, 6);
    expect(gen1[1]!.endAngle).toBeCloseTo(FAN_SPAN / 2, 6);
  });

  it('sätter fadern till vänster och modern till höger', () => {
    expect(at('far').startAngle).toBeLessThan(at('mor').startAngle);
    // och far-/morföräldrarna hamnar inom respektive förälders sektor
    expect(at('farfar').startAngle).toBeGreaterThanOrEqual(at('far').startAngle - 1e-9);
    expect(at('farmor').endAngle).toBeLessThanOrEqual(at('far').endAngle + 1e-9);
    expect(at('morfar').startAngle).toBeGreaterThanOrEqual(at('mor').startAngle - 1e-9);
  });

  it('lägger varje generation i en egen ring', () => {
    expect(at('far').innerR).toBeLessThan(at('farfar').innerR);
    expect(at('farfar').innerR - at('far').innerR).toBeCloseTo(RING, 6);
    expect(at('far').outerR - at('far').innerR).toBeCloseTo(RING, 6);
  });

  it('lämnar hål för saknade förfäder i stället för att flytta grannarna', () => {
    const gaps = layoutFan([slot(1, 'jag'), slot(3, 'mor'), slot(7, 'mormor')], 2);
    expect(gaps.slices.map(s => s.person.id).sort()).toEqual(['mor', 'mormor']);
    const mor = gaps.slices.find(s => s.person.id === 'mor')!;
    expect(mor.startAngle).toBeCloseTo(at('mor').startAngle, 6);   // samma plats som förut
  });

  it('ger varje skiva en ritbar kil och grenfärg', () => {
    for (const s of r.slices) {
      expect(s.wedgePath.startsWith('M ')).toBe(true);
      expect(s.wedgePath).toContain('A');           // bågsegment
    }
    expect(at('farfar').branch).toBe('ff');
    expect(at('mormor').branch).toBe('mm');
  });

  it('skriver aldrig text upp och ned', () => {
    const deep = layoutFan(
      Array.from({ length: 63 }, (_, i) => slot(i + 1, `p${i + 1}`)),
      5,
    );
    for (const s of deep.slices) {
      if (!s.labelRadial) continue;
      const r0 = ((s.labelRadial.rotate % 360) + 360) % 360;
      expect(r0 > 90 && r0 < 270).toBe(false);
    }
  });

  it('vänder bågtexten på nedre halvan så den inte står upp och ned', () => {
    // 3 generationer ger skivor både uppe och nere med bågtext
    const deep = layoutFan(
      Array.from({ length: 15 }, (_, i) => slot(i + 1, `p${i + 1}`)),
      3,
    );
    const withArc = deep.slices.filter(s => s.labelPath);
    expect(withArc.length).toBeGreaterThan(0);
    for (const s of withArc) {
      const mid = (s.startAngle + s.endAngle) / 2;
      const sweep = /A [\d.]+ [\d.]+ 0 \d (\d)/.exec(s.labelPath!)![1];
      // nedre halvan ritas moturs (sweep 0), övre medurs (sweep 1)
      expect(sweep).toBe(Math.abs(mid) > Math.PI / 2 ? '0' : '1');
    }
  });

  it('anger hur många tecken som får plats i varje etikett', () => {
    for (const s of r.slices) {
      expect(s.labelMaxChars).toBeGreaterThan(3);
      expect(Number.isFinite(s.labelMaxChars)).toBe(true);
    }
    // yttre generationen har smalare skivor än den inre
    const gen1 = r.slices.find(s => s.generation === 1)!;
    const gen2 = r.slices.find(s => s.generation === 2)!;
    expect(gen1.labelMaxChars).toBeGreaterThan(gen2.labelMaxChars);
  });

  it('täcker hela solfjädern med sina gränser', () => {
    const outer = Math.max(...r.slices.map(s => s.outerR));
    expect(r.bounds.maxX).toBeGreaterThanOrEqual(outer);
    expect(r.bounds.minY).toBeLessThanOrEqual(-outer);
  });
});
