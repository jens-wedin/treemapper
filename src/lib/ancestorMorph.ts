import { branchOf, type Branch } from './ahnentafel';
import type { PedigreeLayout } from './pedigreeLayout';
import type { FanLayout } from './fanLayout';
import type { ChartBounds } from './useChartViewport';
import type { TreePerson } from '../../lib/tree';

/**
 * Where each ancestor travels when the pedigree chart becomes the fan chart.
 *
 * The two charts draw the same people under the same Ahnentafel numbers, so
 * every person has a real start and a real end — which is what makes a morph
 * meaningful here and nowhere else in the app.
 *
 * The motion is interpolated in **polar coordinates about the fan's centre**,
 * not in x and y. Straight lines would look like boxes sliding into a circle;
 * moving along radius and angle instead makes every path curve outward on its
 * own, and the columns wind themselves into rings.
 *
 * Pure: no React, no DOM, no time. The caller decides what `t` is, and running
 * it from 1 down to 0 is the other direction.
 */

export interface MorphPoint {
  ahnentafel: number;
  person: TreePerson;
  branch: Branch;
  x: number;
  y: number;
  /** Radians. 0 is upright like a card, the target angle lies along its ring. */
  rotation: number;
}

export interface MorphPlan {
  points: (t: number) => MorphPoint[];
  /** Everything the travel touches, both charts included. */
  bounds: ChartBounds;
  /**
   * Each chart's own extent, so the overlay can zoom from one to the other.
   * Fitting the union instead would shrink everything mid-flight and pop back
   * to size at the end.
   */
  from: ChartBounds;
  to: ChartBounds;
}

/**
 * The way round from one angle to another that costs least — always at most
 * half a turn. Without this an ancestor at +3.0 rad heading for −3.0 rad would
 * sweep almost the whole circle backwards instead of stepping across π.
 */
export function shortestTurn(from: number, to: number): number {
  const full = 2 * Math.PI;
  return ((((to - from) % full) + full + Math.PI) % full) - Math.PI;
}

/** How finely the travel is sampled when measuring how much room it needs. */
const SAMPLES = 16;

/** The fan's convention: 0 radians points at 12 o'clock, and turns clockwise. */
const toCartesian = (angle: number, radius: number) => ({
  x: Math.sin(angle) * radius,
  y: -Math.cos(angle) * radius,
});

interface Travel {
  ahnentafel: number;
  person: TreePerson;
  branch: Branch;
  fromR: number;
  fromAngle: number;
  toR: number;
  toAngle: number;
}

export function planMorph(pedigree: PedigreeLayout, fan: FanLayout): MorphPlan {
  // The fan chart is built around the origin; the pedigree's focus card is
  // wherever its rows put it. Shifting the antavla so the two centres coincide
  // gives one space, and one point to be polar about.
  const focus = pedigree.nodes.find(node => node.isFocus);
  const dx = -(focus?.x ?? 0);
  const dy = -(focus?.y ?? 0);

  const byNumber = new Map(pedigree.nodes.map(node => [node.ahnentafel, node]));
  const travels: Travel[] = [];

  // The focus person is not a slice — the fan draws them as its centre disc —
  // so they are their own case, and they simply stay put.
  if (focus) {
    travels.push({
      ahnentafel: 1, person: focus.person, branch: branchOf(1),
      fromR: 0, fromAngle: 0, toR: 0, toAngle: 0,
    });
  }

  for (const slice of fan.slices) {
    const node = byNumber.get(slice.ahnentafel);
    if (!node) continue;   // drawn by one chart only; it fades rather than travels

    const x = node.x + dx;
    const y = node.y + dy;
    const fromR = Math.hypot(x, y);
    const toAngle = (slice.startAngle + slice.endAngle) / 2;

    travels.push({
      ahnentafel: slice.ahnentafel,
      person: node.person,
      branch: branchOf(slice.ahnentafel),
      fromR,
      // At the centre there is no direction to start from; borrowing the
      // target angle makes such a person move straight out instead of spinning.
      fromAngle: fromR === 0 ? toAngle : Math.atan2(x, -y),
      toR: (slice.innerR + slice.outerR) / 2,
      toAngle,
    });
  }

  const points = (t: number): MorphPoint[] =>
    travels.map(travel => {
      const r = travel.fromR + (travel.toR - travel.fromR) * t;
      const angle = travel.fromAngle + shortestTurn(travel.fromAngle, travel.toAngle) * t;
      return {
        ahnentafel: travel.ahnentafel,
        person: travel.person,
        branch: travel.branch,
        ...toCartesian(angle, r),
        rotation: travel.toAngle * t,
      };
    });

  // Both charts' extents — and the paths themselves, which is the part that is
  // easy to get wrong: a curving path can swing outside the box that holds its
  // own two ends, so the travel has to be sampled rather than assumed.
  const from: ChartBounds = {
    minX: pedigree.bounds.minX + dx, maxX: pedigree.bounds.maxX + dx,
    minY: pedigree.bounds.minY + dy, maxY: pedigree.bounds.maxY + dy,
  };
  const to = fan.bounds;
  const bounds: ChartBounds = {
    minX: Math.min(from.minX, to.minX),
    maxX: Math.max(from.maxX, to.maxX),
    minY: Math.min(from.minY, to.minY),
    maxY: Math.max(from.maxY, to.maxY),
  };
  for (let step = 0; step <= SAMPLES; step++) {
    for (const point of points(step / SAMPLES)) {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    }
  }

  return { points, bounds, from, to };
}
