package io.github.mohamadjavadx.piechart.geometry

import io.github.mohamadjavadx.piechart.PieChartData
import io.github.mohamadjavadx.piechart.utils.asin
import io.github.mohamadjavadx.piechart.utils.atan2
import io.github.mohamadjavadx.piechart.utils.sin
import io.github.mohamadjavadx.piechart.utils.sqrt
import io.github.mohamadjavadx.piechart.utils.toDegrees
import io.github.mohamadjavadx.piechart.utils.toRadians
import java.math.BigDecimal
import java.math.MathContext

// The pure math of the chart: angles, corner radii and hit testing. Nothing here touches a view.

internal const val MAX_DEG: Float = 360f
internal const val MIN_SWEEP: Float = 1f

/**
 * Threshold below which inner rounded corners are disabled.
 * Below this ratio, the inner hole is too small for visible rounded corners
 * and the geometry math can become numerically unstable.
 */
internal const val INNER_FEATURES_THRESHOLD: Float = 0.25f

/**
 * The ratio (0..1) that [px] is of [whole], both in px: what a size given in px is worth as one of
 * the chart's ratios. 0 when there is nothing to take a share of.
 */
internal fun ratioOfPx(px: Float, whole: Float): Float =
    if (whole > 0f) (px / whole).coerceIn(0f, 1f) else 0f

/**
 * The gap actually used for [sliceCount] slices: 0 for a single slice,
 * clamped so every slice can still show at least [MIN_SWEEP] when
 * [ensureRenderableSlices] is on.
 */
internal fun computeGapDeg(sliceCount: Int, visualGapDeg: Float, ensureRenderableSlices: Boolean): Float {
    if (sliceCount <= 1) return 0f
    val gap = visualGapDeg.coerceAtLeast(0f)
    if (!ensureRenderableSlices) return gap
    val effectiveMinSweep = gap + MIN_SWEEP
    if (sliceCount * effectiveMinSweep <= MAX_DEG) return gap
    val maxAffordableGap = (MAX_DEG / sliceCount) - MIN_SWEEP
    return maxAffordableGap.coerceAtLeast(0f)
}

/**
 * The inner angular gap that goes with [gapDeg]: none when the hole is too small for the
 * inner features, or when there is nothing to draw.
 */
internal fun computeInnerGapDeg(
    gapDeg: Float,
    holeRadiusRatio: Float,
    innerRadius: Float,
    hasSlices: Boolean,
): Float {
    if (holeRadiusRatio < INNER_FEATURES_THRESHOLD) return 0f
    if (innerRadius <= 0f || gapDeg <= 0f || !hasSlices) return 0f
    return gapDeg
}

/** Final sweep angles (degrees) for [data], whose values add up to [total]. Sums to 360. */
internal fun computeTargetSweeps(
    data: List<PieChartData>,
    total: BigDecimal,
    gapDeg: Float,
    ensureRenderableSlices: Boolean,
): FloatArray {
    val n = data.size
    val sweeps = FloatArray(n) { data[it].value.divide(total, MathContext.DECIMAL64).toFloat() * MAX_DEG }
    if (ensureRenderableSlices && n * (gapDeg + MIN_SWEEP) <= MAX_DEG) {
        enforceMinSweepAngle(sweeps, gapDeg + MIN_SWEEP)
    }
    return sweeps
}

/**
 * Ensures no slice in [sweeps] is smaller than [minAngle].
 * Slices below the minimum are bumped up, and the "stolen" angle is
 * proportionally subtracted from slices larger than the minimum.
 */
internal fun enforceMinSweepAngle(sweeps: FloatArray, minAngle: Float) {
    var offset = 0f
    var diff = 0f

    for (i in sweeps.indices) {
        val rawAngle = sweeps[i]
        if (rawAngle == 0f) continue

        val temp = rawAngle - minAngle
        if (temp <= 0f) {
            sweeps[i] = minAngle
            offset += -temp
        } else {
            diff += temp
        }
    }

    if (diff > 0f && offset > 0f) {
        for (i in sweeps.indices) {
            if (sweeps[i] > minAngle) {
                sweeps[i] -= (sweeps[i] - minAngle) / diff * offset
            }
        }
    }
}

/** Holds the independently calculated outer and inner corner radii. */
internal data class CornerRadii(val outer: Float, val inner: Float)

/**
 * Calculates the outer and inner corner radii independently based on their own constraints.
 * This allows a slice to have a large outer corner radius even if the inner corner radius
 * must be smaller to fit the inner sweep angle.
 *
 * [renderedSliceCount] is the number of slices being drawn, ghosts of a running morph included.
 */
internal fun computeCornerRadii(
    outerSweep: Float,
    innerSweep: Float,
    outerRadius: Float,
    innerRadius: Float,
    holeRadiusRatio: Float,
    cornerRadiusRatio: Float,
    roundInnerCorners: Boolean,
    renderedSliceCount: Int,
): CornerRadii {
    if (cornerRadiusRatio <= 0f || outerRadius <= 0f) return CornerRadii(0f, 0f)

    // A single slice is a closed ring — it has no corners to round.
    // We intentionally count ghosts too, because during a morph they are drawn
    // with corners as they shrink.
    if (renderedSliceCount == 1) return CornerRadii(0f, 0f)

    val thickness = (outerRadius - innerRadius).coerceAtLeast(0f)
    val maxBaseC = thickness / 2f
    val desiredC = maxBaseC * cornerRadiusRatio

    // --- Calculate Outer Corner ---
    var cOut = desiredC
    // Half-angle consumed by the outer corner cannot exceed half the outer sweep.
    val maxOuterAlphaRad = minOf(outerSweep / 2f, 90f).toRadians()
    val sinOut = maxOuterAlphaRad.sin()
    val maxCOut = (sinOut * outerRadius) / (1f + sinOut)
    cOut = minOf(cOut, maxCOut)

    // --- Calculate Inner Corner ---
    var cIn =
        if (holeRadiusRatio > INNER_FEATURES_THRESHOLD && roundInnerCorners && innerRadius > 0f && innerSweep > 0f)
            desiredC
        else
            0f
    if (cIn > 0f) {
        // Half-angle consumed by the inner corner cannot exceed half the inner sweep.
        val maxInnerBetaRad = minOf(innerSweep / 2f, 90f).toRadians()
        val sinIn = maxInnerBetaRad.sin()
        if (sinIn < 1f) { // Prevent division by zero if sweep is exactly 180+
            val maxCIn = (sinIn * innerRadius) / (1f - sinIn)
            cIn = minOf(cIn, maxCIn)
        }
    }

    // --- Ensure they don't overlap radially ---
    // If the sum of both radii exceeds the donut thickness, scale them down proportionally.
    if (cOut + cIn > thickness && thickness > 0) {
        val scale = thickness / (cOut + cIn)
        cOut *= scale
        cIn *= scale
    }

    return CornerRadii(cOut.coerceAtLeast(0f), cIn.coerceAtLeast(0f))
}

/**
 * Returns the index in the dataset of the slice under ([x], [y]), or -1 if none.
 * Considers radial distance and angular position. Taps on a shrinking "exiting" slice during
 * a data-change animation are ignored, and so are slices too small to be drawn (their sweep
 * does not exceed [gapDeg]).
 *
 * [segStarts] and [segEnds] are the angular range of each rendered slice, measured from
 * [startAngleDeg]; [renderIndexMap] maps a rendered slice to its dataset index (-1: exiting).
 */
internal fun sliceIndexAt(
    x: Float,
    y: Float,
    cx: Float,
    cy: Float,
    innerTouchBound: Float,
    outerTouchBound: Float,
    startAngleDeg: Float,
    gapDeg: Float,
    fullSweeps: FloatArray,
    segStarts: FloatArray,
    segEnds: FloatArray,
    renderIndexMap: IntArray,
): Int {
    val dx = x - cx
    val dy = y - cy
    val dist = (dx * dx + dy * dy).sqrt()

    if (dist !in innerTouchBound..outerTouchBound) return -1

    // Convert touch point into the chart's angular space.
    var angle = dy.atan2(dx).toDegrees()
    if (angle < 0f) angle += MAX_DEG

    // The remainder keeps the sign of its dividend, so it is taken before adding the period:
    // this is right for any start angle, positive or negative, however large.
    val rotated = ((angle - startAngleDeg) % MAX_DEG + MAX_DEG) % MAX_DEG

    for (i in segStarts.indices) {
        if (fullSweeps[i] - gapDeg <= 0f) continue   // not drawn, so not there to be tapped
        if (rotated in segStarts[i]..segEnds[i]) {
            return renderIndexMap[i]   // -1 for exiting slices -> not clickable
        }
    }
    return -1
}
