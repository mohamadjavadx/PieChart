import { computeCornerRadii, computeGapDeg, computeInnerGapDeg, computeTargetSweeps } from "./sliceMath.js";
import { EXPANDED_BAND_SWEEP_DEG } from "./grouping.js";
import { roundedSlicePath, sharpSlicePath } from "./ringPath.js";
import { totalOf } from "./slices.js";
// From slices to shapes: where each slice lies, and the outline it is drawn with. The pieces of
// PieChartView that do not touch a canvas, ported.
/** The largest circle in a box of [width] by [height], with a hole of [holeRadiusRatio] of its radius. */
export function ringOf(width, height, holeRadiusRatio) {
    const outerRadius = Math.max(Math.min(width, height) / 2, 0);
    return { cx: width / 2, cy: height / 2, outerRadius, innerRadius: outerRadius * holeRadiusRatio };
}
/**
 * The ring the selected slice's shadow is drawn on: the same ring shifted toward the hole by a share
 * of the hole's radius, never more than half the thickness, so that only a small part of it shows.
 */
export function shadowRingOf(ring, shadowOffsetRatio) {
    const thickness = Math.max(ring.outerRadius - ring.innerRadius, 0);
    const offset = Math.min(ring.innerRadius * shadowOffsetRatio, thickness / 2);
    return { ...ring, outerRadius: ring.outerRadius - offset, innerRadius: ring.innerRadius - offset };
}
/** The band of an expanded group is one slice as far as the gaps go: it has none inside. */
export const gapSliceCount = (size, bandCount) => bandCount > 0 ? size - bandCount + 1 : size;
/** Lays [dataset] out around [ring]. */
export function computeSegments(dataset, ring, options) {
    const gapDeg = computeGapDeg(gapSliceCount(dataset.length, options.bandCount), options.visualGapDeg, options.ensureRenderableSlices);
    const sweeps = computeTargetSweeps(dataset, totalOf(dataset), gapDeg, options.ensureRenderableSlices, options.bandCount, EXPANDED_BAND_SWEEP_DEG);
    const innerGapDeg = computeInnerGapDeg(gapDeg, options.holeRadiusRatio, ring.innerRadius, sweeps.length > 0);
    const starts = [];
    const ends = [];
    let cursor = 0;
    for (const sweep of sweeps) {
        starts.push(cursor);
        cursor += sweep;
        ends.push(cursor);
    }
    return { gapDeg, innerGapDeg, sweeps, starts, ends };
}
/**
 * The outline of one slice on [ring]. [sliceStart] is where the slice starts, its gap included (the
 * chart's start angle plus the sweeps before it), [sweep] is its sweep, and [fraction] (0..1) how
 * much of it is revealed. [renderedSliceCount] is how many slices are drawn, ghosts included: a single
 * one is a closed ring with no corners. Null when nothing is left to draw.
 */
export function slicePath(ring, options, layout, sliceStart, sweep, fraction, renderedSliceCount) {
    const outerSweep = (sweep - layout.gapDeg) * fraction;
    const innerSweep = (sweep - layout.innerGapDeg) * fraction;
    if (outerSweep <= 0 || innerSweep <= 0)
        return null;
    return outlineOf(ring, options, sliceStart + layout.gapDeg / 2, outerSweep, sliceStart + layout.innerGapDeg / 2, innerSweep, renderedSliceCount);
}
/** A slice's outline for the given outer and inner angles, with the corners the style asks for. */
export function outlineOf(ring, options, outerStartAngle, outerSweep, innerStartAngle, innerSweep, renderedSliceCount) {
    const radii = computeCornerRadii(outerSweep, innerSweep, ring.outerRadius, ring.innerRadius, options.holeRadiusRatio, options.cornerRadiusRatio, options.roundInnerCorners, renderedSliceCount);
    if (radii.outer <= 0 && radii.inner <= 0) {
        return sharpSlicePath(ring, outerStartAngle, outerSweep, innerStartAngle, innerSweep);
    }
    return roundedSlicePath(ring, radii.outer, radii.inner, outerStartAngle, outerSweep, innerStartAngle, innerSweep);
}
