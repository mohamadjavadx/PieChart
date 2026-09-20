package io.github.mohamadjavadx.piechart.geometry

import io.github.mohamadjavadx.piechart.OtherSliceId
import io.github.mohamadjavadx.piechart.PieChartData
import java.math.BigDecimal
import java.math.MathContext

// Grouping of slices that are too small to be seen. Pure data: the chart draws the result like any other data.

/** A slice is grouped when less than this many degrees of it would remain after the gap is cut out. */
internal const val MIN_VISIBLE_SWEEP_DEG: Float = 2f

/**
 * The group is at least this wide once the gap is cut out of it, so that it can be seen and tapped:
 * the angle it is given is this plus the gap, as every slice loses the gap out of its own angle.
 */
internal const val MIN_GROUP_SWEEP_DEG: Float = 10f

/** While the group is expanded, all the slices that are not in it share an arc of this many degrees. */
internal const val EXPANDED_BAND_SWEEP_DEG: Float = 90f

/**
 * What the chart shows for its data: [slices], and whether small slices were found to group.
 * The first [bandCount] of the slices are the big ones of an expanded group, which share a band.
 */
internal class Grouping(val slices: List<PieChartData>, val hasGroup: Boolean, val bandCount: Int = 0)

/**
 * Groups the slices of [source] (values above zero) that would have less than
 * [MIN_VISIBLE_SWEEP_DEG] left once a gap of [gapDeg] is cut out of them.
 *
 * Collapsed, the big slices stay as they are, in order, followed by one slice for the group, in
 * [otherColor]. It is as big as the group's values say, but at least [MIN_GROUP_SWEEP_DEG] plus
 * the gap, so that [MIN_GROUP_SWEEP_DEG] of it is seen; the big slices give up the difference.
 *
 * Expanded, the big slices come first, in order, and are the band: the chart draws them together in
 * an arc of [EXPANDED_BAND_SWEEP_DEG]. They are followed by the members of the group, which share
 * the rest of the ring in proportion. Nobody's value changes: the layout is the chart's to do.
 *
 * Nothing is grouped unless at least two slices are small and at least one is not.
 */
internal fun groupSlices(
    source: List<PieChartData>,
    gapDeg: Float,
    expanded: Boolean,
    otherColor: Int,
): Grouping {
    if (source.size < 3) return Grouping(source, hasGroup = false)

    val total = source.sumOf { it.value }
    val limit = gapDeg + MIN_VISIBLE_SWEEP_DEG
    val big = ArrayList<PieChartData>(source.size)
    val small = ArrayList<PieChartData>()
    for (data in source) {
        val sweep = data.value.divide(total, MathContext.DECIMAL64).toFloat() * MAX_DEG
        if (sweep < limit) small += data else big += data
    }
    if (small.size < 2 || big.isEmpty()) return Grouping(source, hasGroup = false)

    if (expanded) return Grouping(big + small, hasGroup = true, bandCount = big.size)

    val smallTotal = small.sumOf { it.value }

    val bigTotal = total.subtract(smallTotal)
    // The gap is cut out of the group's angle like out of any slice's, so it comes on top. Never
    // more than half the ring, whatever the gap.
    val minGroupSweep = (MIN_GROUP_SWEEP_DEG + gapDeg).coerceAtMost(MAX_DEG / 2f)
    val minGroupValue = bigTotal.times(minGroupSweep, MAX_DEG - minGroupSweep)
    val groupValue = if (smallTotal >= minGroupValue) smallTotal else minGroupValue
    return Grouping(big + PieChartData(OtherSliceId, "Other", groupValue, otherColor), hasGroup = true)
}

/** This value scaled by [numerator] / [denominator], both in degrees. */
private fun BigDecimal.times(numerator: Float, denominator: Float): BigDecimal =
    multiply(BigDecimal(numerator.toDouble())).divide(BigDecimal(denominator.toDouble()), MathContext.DECIMAL64)
