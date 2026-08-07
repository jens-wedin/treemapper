import { branchOf, generationOf, type AncestorSlot, type Branch } from './ahnentafel';
import type { ChartBounds } from './useChartViewport';
import type { NavMap } from './treeLayout';
import type { TreePerson } from '../../lib/tree';

/**
 * Circular ancestor fan. Angles are radians measured clockwise from straight
 * up, so 0 points at 12 o'clock and negative angles go left — the same mental
 * model as the reference chart, where the father's line sweeps left.
 */
export const FAN_SPAN = (270 * Math.PI) / 180;
export const CENTRE_R = 96;
export const RING = 80;
const LABEL_MIN_ARC = 96;      // px of arc needed before a name is set along it
const FLAG_INSET = 15;

export interface FanSlice {
  key: string;
  ahnentafel: number;
  person: TreePerson;
  generation: number;
  branch: Branch;
  startAngle: number;
  endAngle: number;
  innerR: number;
  outerR: number;
  wedgePath: string;
  /** Arc for <textPath> when the slice is wide enough to read along. */
  labelPath?: string;
  /** How many characters fit in the space this label has. */
  labelMaxChars: number;
  /**
   * Otherwise the name runs radially. On the fan's left half that direction
   * would read upside down, so the text is turned around and anchored at its
   * end instead — same ring, still readable.
   */
  labelRadial?: { x: number; y: number; rotate: number; anchor: 'start' | 'end' };
  flag: { cx: number; cy: number };
  /** Outer edge arc, drawn in the branch colour. */
  bandPath: string;
}

export interface FanLayout {
  centre: { person: TreePerson; r: number };
  slices: FanSlice[];
  nav: NavMap;
  bounds: ChartBounds;
}

const pointAt = (angle: number, radius: number) => ({
  x: Math.sin(angle) * radius,
  y: -Math.cos(angle) * radius,
});

function wedge(startAngle: number, endAngle: number, innerR: number, outerR: number): string {
  const a = pointAt(startAngle, innerR);
  const b = pointAt(startAngle, outerR);
  const c = pointAt(endAngle, outerR);
  const d = pointAt(endAngle, innerR);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${a.x} ${a.y}`,
    `L ${b.x} ${b.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${c.x} ${c.y}`,
    `L ${d.x} ${d.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${a.x} ${a.y}`,
    'Z',
  ].join(' ');
}

function arc(startAngle: number, endAngle: number, radius: number, reversed = false): string {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  if (reversed) {
    // Text on a <textPath> follows the path direction — on the fan's lower
    // half a left-to-right arc would read upside down, so draw it backwards.
    const a = pointAt(endAngle, radius);
    const b = pointAt(startAngle, radius);
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 0 ${b.x} ${b.y}`;
  }
  const a = pointAt(startAngle, radius);
  const b = pointAt(endAngle, radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** Roughly how many characters fit in a given width at label size. */
const charsThatFit = (width: number) => Math.max(4, Math.floor(width / 6.4));

export function layoutFan(slots: AncestorSlot[], generations: number): FanLayout {
  const byNumber = new Map(slots.map(s => [s.ahnentafel, s]));
  const focus = byNumber.get(1);
  const slices: FanSlice[] = [];

  for (const slot of slots) {
    const generation = generationOf(slot.ahnentafel);
    if (generation === 0 || generation > generations) continue;

    const countInGeneration = 2 ** generation;
    const indexInGeneration = slot.ahnentafel - countInGeneration;
    const sliceAngle = FAN_SPAN / countInGeneration;
    const startAngle = -FAN_SPAN / 2 + indexInGeneration * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    const innerR = CENTRE_R + (generation - 1) * RING;
    const outerR = innerR + RING;
    const midAngle = (startAngle + endAngle) / 2;
    const midR = (innerR + outerR) / 2;

    const alongArc = sliceAngle * midR >= LABEL_MIN_ARC;
    let labelPath: string | undefined;
    let labelRadial: FanSlice['labelRadial'];
    let labelMaxChars: number;
    if (alongArc) {
      // Small inset so the text does not touch the slice edges.
      const inset = sliceAngle * 0.06;
      const radius = midR - 4;
      const lowerHalf = Math.abs(midAngle) > Math.PI / 2;
      labelPath = arc(startAngle + inset, endAngle - inset, radius, lowerHalf);
      labelMaxChars = charsThatFit((sliceAngle - inset * 2) * radius);
    } else {
      // Aligning text with the outward radial direction means rotating by
      // (angle − 90°); that reads upside down on the fan's left half.
      const base = (midAngle * 180) / Math.PI - 90;
      const normalized = ((base % 360) + 360) % 360;
      const upsideDown = normalized > 90 && normalized < 270;
      const point = pointAt(midAngle, upsideDown ? outerR - 10 : innerR + 10);
      labelRadial = {
        x: point.x,
        y: point.y,
        rotate: upsideDown ? base + 180 : base,
        anchor: upsideDown ? 'end' : 'start',
      };
      labelMaxChars = charsThatFit(RING - 22);
    }

    const flagPoint = pointAt(midAngle, innerR + FLAG_INSET);

    slices.push({
      key: `f${slot.ahnentafel}`,
      ahnentafel: slot.ahnentafel,
      person: slot.person,
      generation,
      branch: branchOf(slot.ahnentafel),
      startAngle, endAngle, innerR, outerR,
      wedgePath: wedge(startAngle, endAngle, innerR, outerR),
      bandPath: arc(startAngle, endAngle, outerR),
      labelPath,
      labelRadial,
      labelMaxChars,
      flag: { cx: flagPoint.x, cy: flagPoint.y },
    });
  }

  // Keyboard: out = towards the parents, in = towards the child, left/right
  // along the ring.
  const nav: NavMap = {};
  const keyOf = (n: number) => (byNumber.has(n) && generationOf(n) <= generations ? `f${n}` : undefined);
  for (const slice of slices) {
    nav[slice.key] = {
      right: keyOf(slice.ahnentafel + 1),
      left: keyOf(slice.ahnentafel - 1),
      up: keyOf(slice.ahnentafel * 2) ?? keyOf(slice.ahnentafel * 2 + 1),
      down: slice.generation === 1 ? undefined : keyOf(Math.floor(slice.ahnentafel / 2)),
    };
  }

  const outer = CENTRE_R + generations * RING + 16;
  return {
    centre: { person: focus?.person ?? slots[0]!.person, r: CENTRE_R },
    slices,
    nav,
    bounds: { minX: -outer, maxX: outer, minY: -outer, maxY: outer },
  };
}
