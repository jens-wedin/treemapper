import { describe, it, expect } from 'vitest';
import { computeFit, MIN_K, MAX_K } from './useChartViewport';

const size = { w: 1000, h: 600 };

describe('computeFit', () => {
  it('shrinks large content so that it fits', () => {
    const fit = computeFit({ minX: -2000, maxX: 2000, minY: -600, maxY: 600 }, size);
    expect(fit.k).toBeCloseTo(1000 / 4000, 5);
    // the content's centre lands in the view's centre
    expect(fit.x).toBeCloseTo(size.w / 2, 5);
    expect(fit.y).toBeCloseTo(size.h / 2, 5);
  });

  it('never enlarges small content beyond its real size', () => {
    const fit = computeFit({ minX: -50, maxX: 50, minY: -50, maxY: 50 }, size);
    expect(fit.k).toBe(1);
  });

  it('centres content that does not sit around the origin', () => {
    const fit = computeFit({ minX: 0, maxX: 400, minY: 0, maxY: 200 }, size);
    // mitten (200,100) ska hamna mitt i vyn
    expect(200 * fit.k + fit.x).toBeCloseTo(size.w / 2, 5);
    expect(100 * fit.k + fit.y).toBeCloseTo(size.h / 2, 5);
  });

  it('clamps to the permitted zoom range', () => {
    const huge = computeFit({ minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 }, size);
    expect(huge.k).toBeGreaterThanOrEqual(MIN_K);
    expect(huge.k).toBeLessThanOrEqual(MAX_K);
  });

  it('copes with empty bounds without dividing by zero', () => {
    const fit = computeFit({ minX: 0, maxX: 0, minY: 0, maxY: 0 }, size);
    expect(Number.isFinite(fit.k)).toBe(true);
    expect(Number.isFinite(fit.x)).toBe(true);
  });
});
