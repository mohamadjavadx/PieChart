import type { Decimal } from "./decimal.ts";
import { clamp, INNER_FEATURES_THRESHOLD, MAX_DEG, MIN_SWEEP, toDegrees, toRadians } from "./math.ts";
import { shareOf } from "./slices.ts";
import type { Slice } from "./types.ts";

// The pure math of the chart: angles, corner radii and hit testing. Nothing here touches the DOM.
// A port of the Android library's SliceMath.kt, function by function.

/**
 * The ratio (0..1) that [px] is of [whole], both in px: what a length is worth as one of the chart's
 * ratios. 0 when there is nothing to take a share of.
 */
export function ratioOfPx(px: number, whole: number): number {
  return whole > 0 ? clamp(px / whole, 0, 1) : 0;
}

/**
 * The angle (degrees) at which an arc of [arcPx] pixels lies on a circle of [radius] pixels: what a
 * gap given as a length is worth as an angle, at most a full turn. 0 when there is no circle.
 */
export function degreesOfArc(arcPx: number, radius: number): number {
  return radius > 0 ? clamp(toDegrees(arcPx / radius), 0, MAX_DEG) : 0;
}

/**
 * The gap actually used for [sliceCount] slices: 0 for a single slice, clamped so every slice can
 * still show at least [MIN_SWEEP] when [ensureRenderableSlices] is on.
 */
export function computeGapDeg(sliceCount: number, visualGapDeg: number, ensureRenderableSlices: boolean): number {
  if (sliceCount <= 1) return 0;
  const gap = Math.max(visualGapDeg, 0);
  if (!ensureRenderableSlices) return gap;
  const effectiveMinSweep = gap + MIN_SWEEP;
  if (sliceCount * effectiveMinSweep <= MAX_DEG) return gap;
  const maxAffordableGap = MAX_DEG / sliceCount - MIN_SWEEP;
  return Math.max(maxAffordableGap, 0);
}

/**
 * The inner angular gap that goes with [gapDeg]: none when the hole is too small for the inner
 * features, or when there is nothing to draw.
 */
export function computeInnerGapDeg(
  gapDeg: number,
  holeRadiusRatio: number,
  innerRadius: number,
  hasSlices: boolean,
): number {
  if (holeRadiusRatio < INNER_FEATURES_THRESHOLD) return 0;
  if (innerRadius <= 0 || gapDeg <= 0 || !hasSlices) return 0;
  return gapDeg;
}

/**
 * Final sweep angles (degrees) for [data], whose values add up to [total]. Sums to 360.
 *
 * The first [bandCount] slices are a band: together they take exactly [bandSweep] degrees, shared in
 * proportion to their values, and no minimum is enforced on them, as they are drawn without gaps.
 * The others share the rest of the ring.
 */
export function computeTargetSweeps(
  data: readonly Slice[],
  total: Decimal,
  gapDeg: number,
  ensureRenderableSlices: boolean,
  bandCount = 0,
  bandSweep = 0,
): number[] {
  const n = data.length;
  const band = bandCount >= 1 && bandCount < n ? bandCount : 0;
  const sweeps = new Array<number>(n).fill(0);

  const fill = (from: number, to: number, whole: Decimal, degrees: number): void => {
    for (let i = from; i < to; i++) sweeps[i] = shareOf(data[i]!.value, whole) * degrees;
  };

  if (band === 0) {
    fill(0, n, total, MAX_DEG);
  } else {
    let bandTotal = data[0]!.value;
    for (let i = 1; i < band; i++) bandTotal = bandTotal.add(data[i]!.value);
    fill(0, band, bandTotal, bandSweep);
    fill(band, n, total.subtract(bandTotal), MAX_DEG - bandSweep);
  }

  const rest = n - band;
  if (ensureRenderableSlices && rest * (gapDeg + MIN_SWEEP) <= MAX_DEG - (band > 0 ? bandSweep : 0)) {
    const tail = sweeps.slice(band);
    enforceMinSweepAngle(tail, gapDeg + MIN_SWEEP);
    for (let i = 0; i < tail.length; i++) sweeps[band + i] = tail[i]!;
  }
  return sweeps;
}

/**
 * Ensures no slice in [sweeps] is smaller than [minAngle]. Slices below the minimum are bumped up,
 * and the "stolen" angle is proportionally subtracted from slices larger than the minimum.
 */
export function enforceMinSweepAngle(sweeps: number[], minAngle: number): void {
  let offset = 0;
  let diff = 0;

  for (let i = 0; i < sweeps.length; i++) {
    const rawAngle = sweeps[i]!;
    if (rawAngle === 0) continue;

    const temp = rawAngle - minAngle;
    if (temp <= 0) {
      sweeps[i] = minAngle;
      offset += -temp;
    } else {
      diff += temp;
    }
  }

  if (diff > 0 && offset > 0) {
    for (let i = 0; i < sweeps.length; i++) {
      const sweep = sweeps[i]!;
      if (sweep > minAngle) sweeps[i] = sweep - ((sweep - minAngle) / diff) * offset;
    }
  }
}

/** The independently calculated outer and inner corner radii. */
export interface CornerRadii {
  readonly outer: number;
  readonly inner: number;
}

/**
 * Calculates the outer and inner corner radii independently based on their own constraints. This
 * allows a slice to have a large outer corner radius even if the inner corner radius must be smaller
 * to fit the inner sweep angle.
 *
 * [renderedSliceCount] is the number of slices being drawn, ghosts of a running morph included.
 */
export function computeCornerRadii(
  outerSweep: number,
  innerSweep: number,
  outerRadius: number,
  innerRadius: number,
  holeRadiusRatio: number,
  cornerRadiusRatio: number,
  roundInnerCorners: boolean,
  renderedSliceCount: number,
): CornerRadii {
  if (cornerRadiusRatio <= 0 || outerRadius <= 0) return { outer: 0, inner: 0 };

  // A single slice is a closed ring: it has no corners to round. Ghosts count too, because during a
  // morph they are drawn with corners as they shrink.
  if (renderedSliceCount === 1) return { outer: 0, inner: 0 };

  const thickness = Math.max(outerRadius - innerRadius, 0);
  const maxBaseC = thickness / 2;
  const desiredC = maxBaseC * cornerRadiusRatio;

  // Outer corner: the half-angle it consumes cannot exceed half the outer sweep.
  let cOut = desiredC;
  const sinOut = Math.sin(toRadians(Math.min(outerSweep / 2, 90)));
  const maxCOut = (sinOut * outerRadius) / (1 + sinOut);
  cOut = Math.min(cOut, maxCOut);

  // Inner corner: the half-angle it consumes cannot exceed half the inner sweep.
  let cIn =
    holeRadiusRatio > INNER_FEATURES_THRESHOLD && roundInnerCorners && innerRadius > 0 && innerSweep > 0
      ? desiredC
      : 0;
  if (cIn > 0) {
    const sinIn = Math.sin(toRadians(Math.min(innerSweep / 2, 90)));
    if (sinIn < 1) {
      // (Prevents a division by zero when the sweep is 180 or more.)
      const maxCIn = (sinIn * innerRadius) / (1 - sinIn);
      cIn = Math.min(cIn, maxCIn);
    }
  }

  // If the two radii together exceed the donut's thickness, scale them down proportionally.
  if (cOut + cIn > thickness && thickness > 0) {
    const scale = thickness / (cOut + cIn);
    cOut *= scale;
    cIn *= scale;
  }

  return { outer: Math.max(cOut, 0), inner: Math.max(cIn, 0) };
}

/** What [sliceIndexAt] needs to know about the chart. */
export interface HitTestInput {
  readonly x: number;
  readonly y: number;
  readonly cx: number;
  readonly cy: number;
  readonly innerTouchBound: number;
  readonly outerTouchBound: number;
  readonly startAngleDeg: number;
  readonly gapDeg: number;
  /** The sweep of each rendered slice. */
  readonly fullSweeps: readonly number[];
  /** The angular range of each rendered slice, measured from [startAngleDeg]. */
  readonly segStarts: readonly number[];
  readonly segEnds: readonly number[];
  /** A rendered slice's index in the dataset, or -1 for an exiting slice. */
  readonly renderIndexMap: readonly number[];
  /** The dataset's first slices that are drawn without gaps, so that however small they are, they are there. */
  readonly bandCount?: number;
}

/**
 * The index in the dataset of the slice under (x, y), or -1 if none. Considers radial distance and
 * angular position. Taps on a shrinking "exiting" slice during a data-change animation are ignored,
 * and so are slices too small to be drawn (their sweep does not exceed the gap).
 */
export function sliceIndexAt(input: HitTestInput): number {
  const { x, y, cx, cy, innerTouchBound, outerTouchBound, startAngleDeg, gapDeg } = input;
  const bandCount = input.bandCount ?? 0;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < innerTouchBound || dist > outerTouchBound) return -1;

  // Convert the touch point into the chart's angular space.
  let angle = toDegrees(Math.atan2(dy, dx));
  if (angle < 0) angle += MAX_DEG;

  // The remainder keeps the sign of its dividend, so it is taken before adding the period: this is
  // right for any start angle, positive or negative, however large.
  const rotated = (((angle - startAngleDeg) % MAX_DEG) + MAX_DEG) % MAX_DEG;

  for (let i = 0; i < input.segStarts.length; i++) {
    const datasetIndex = input.renderIndexMap[i]!;
    const isBand = datasetIndex >= 0 && datasetIndex < bandCount;
    if (!isBand && input.fullSweeps[i]! - gapDeg <= 0) continue; // not drawn, so not there to be tapped
    if (rotated >= input.segStarts[i]! && rotated <= input.segEnds[i]!) {
      return datasetIndex; // -1 for exiting slices: not clickable
    }
  }
  return -1;
}
