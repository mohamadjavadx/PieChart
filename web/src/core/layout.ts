import { computeCornerRadii, computeGapDeg, computeInnerGapDeg, computeTargetSweeps } from "./sliceMath.ts";
import { EXPANDED_BAND_SWEEP_DEG } from "./grouping.ts";
import { roundedSlicePath, sharpSlicePath, type OutlinePath, type Ring } from "./ringPath.ts";
import { totalOf } from "./slices.ts";
import type { Slice } from "./types.ts";

// From slices to shapes: where each slice lies, and the outline it is drawn with. The pieces of
// PieChartView that do not touch a canvas, ported.

/** The largest circle in a box of [width] by [height], with a hole of [holeRadiusRatio] of its radius. */
export function ringOf(width: number, height: number, holeRadiusRatio: number): Ring {
  const outerRadius = Math.max(Math.min(width, height) / 2, 0);
  return { cx: width / 2, cy: height / 2, outerRadius, innerRadius: outerRadius * holeRadiusRatio };
}

/**
 * The ring the selected slice's shadow is drawn on: the same ring shifted toward the hole by a share
 * of the hole's radius, never more than half the thickness, so that only a small part of it shows.
 */
export function shadowRingOf(ring: Ring, shadowOffsetRatio: number): Ring {
  const thickness = Math.max(ring.outerRadius - ring.innerRadius, 0);
  const offset = Math.min(ring.innerRadius * shadowOffsetRatio, thickness / 2);
  return { ...ring, outerRadius: ring.outerRadius - offset, innerRadius: ring.innerRadius - offset };
}

/** The bands of angle the slices lie in, once the chart is at rest. */
export interface SegmentLayout {
  /** The gap that is actually used between slices, in degrees. */
  readonly gapDeg: number;
  /** The gap on the hole side. */
  readonly innerGapDeg: number;
  /** The sweep of each slice, the gap included, adding up to 360. */
  readonly sweeps: readonly number[];
  /** Where each slice starts and ends, measured from the start angle, the gap included. */
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

export interface SegmentOptions {
  readonly visualGapDeg: number;
  readonly ensureRenderableSlices: boolean;
  readonly holeRadiusRatio: number;
  /** The first slices that are the band of an expanded group. */
  readonly bandCount: number;
}

/** The band of an expanded group is one slice as far as the gaps go: it has none inside. */
export const gapSliceCount = (size: number, bandCount: number): number =>
  bandCount > 0 ? size - bandCount + 1 : size;

/** Lays [dataset] out around [ring]. */
export function computeSegments(dataset: readonly Slice[], ring: Ring, options: SegmentOptions): SegmentLayout {
  const gapDeg = computeGapDeg(
    gapSliceCount(dataset.length, options.bandCount),
    options.visualGapDeg,
    options.ensureRenderableSlices,
  );
  const sweeps = computeTargetSweeps(
    dataset,
    totalOf(dataset),
    gapDeg,
    options.ensureRenderableSlices,
    options.bandCount,
    EXPANDED_BAND_SWEEP_DEG,
  );
  const innerGapDeg = computeInnerGapDeg(gapDeg, options.holeRadiusRatio, ring.innerRadius, sweeps.length > 0);

  const starts: number[] = [];
  const ends: number[] = [];
  let cursor = 0;
  for (const sweep of sweeps) {
    starts.push(cursor);
    cursor += sweep;
    ends.push(cursor);
  }
  return { gapDeg, innerGapDeg, sweeps, starts, ends };
}

export interface OutlineOptions {
  readonly holeRadiusRatio: number;
  readonly cornerRadiusRatio: number;
  readonly roundInnerCorners: boolean;
}

/**
 * The outline of one slice on [ring]. [sliceStart] is where the slice starts, its gap included (the
 * chart's start angle plus the sweeps before it), [sweep] is its sweep, and [fraction] (0..1) how
 * much of it is revealed. [renderedSliceCount] is how many slices are drawn, ghosts included: a single
 * one is a closed ring with no corners. Null when nothing is left to draw.
 */
export function slicePath(
  ring: Ring,
  options: OutlineOptions,
  layout: Pick<SegmentLayout, "gapDeg" | "innerGapDeg">,
  sliceStart: number,
  sweep: number,
  fraction: number,
  renderedSliceCount: number,
): OutlinePath | null {
  const outerSweep = (sweep - layout.gapDeg) * fraction;
  const innerSweep = (sweep - layout.innerGapDeg) * fraction;
  if (outerSweep <= 0 || innerSweep <= 0) return null;
  return outlineOf(
    ring, options, sliceStart + layout.gapDeg / 2, outerSweep, sliceStart + layout.innerGapDeg / 2, innerSweep,
    renderedSliceCount,
  );
}

/** A slice's outline for the given outer and inner angles, with the corners the style asks for. */
export function outlineOf(
  ring: Ring,
  options: OutlineOptions,
  outerStartAngle: number,
  outerSweep: number,
  innerStartAngle: number,
  innerSweep: number,
  renderedSliceCount: number,
): OutlinePath {
  const radii = computeCornerRadii(
    outerSweep, innerSweep, ring.outerRadius, ring.innerRadius, options.holeRadiusRatio,
    options.cornerRadiusRatio, options.roundInnerCorners, renderedSliceCount,
  );
  if (radii.outer <= 0 && radii.inner <= 0) {
    return sharpSlicePath(ring, outerStartAngle, outerSweep, innerStartAngle, innerSweep);
  }
  return roundedSlicePath(
    ring, radii.outer, radii.inner, outerStartAngle, outerSweep, innerStartAngle, innerSweep,
  );
}
