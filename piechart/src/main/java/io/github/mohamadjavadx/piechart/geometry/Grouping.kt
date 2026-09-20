package io.github.mohamadjavadx.piechart.geometry

import io.github.mohamadjavadx.piechart.MainSliceId
import io.github.mohamadjavadx.piechart.OtherSliceId
import io.github.mohamadjavadx.piechart.PieChartData
import java.math.BigDecimal
import java.math.MathContext

// Grouping of slices that are too small to be seen. Pure data: the chart draws the result like any other data.

/** A slice is grouped when less than this many degrees of it would remain after the gap is cut out. */
internal const val MIN_VISIBLE_SWEEP_DEG: Float = 1f

/** The group is drawn at least this wide, so that it can be seen and tapped. */
internal const val MIN_GROUP_SWEEP_DEG: Float = 8f

/** While the group is expanded, everything that is not in it is one slice of this many degrees. */
internal const val EXPANDED_MAIN_SWEEP_DEG: Float = 90f

/** What the chart shows for its data: [slices], and whether small slices were found to group. */
internal class Grouping(val slices: List<PieChartData>, val hasGroup: Boolean)

/**
 * Groups the slices of [source] (values above zero) that would have less than
 * [MIN_VISIBLE_SWEEP_DEG] left once a gap of [gapDeg] is cut out of them.
 *
 * Collapsed, the big slices stay as they are, in order, followed by one slice for the group, in
 * [otherColor]. It is as big as the group's values say, but at least [MIN_GROUP_SWEEP_DEG]; the big
 * slices give up the difference.
 *
 * Expanded, there is one slice for all the big slices, in [mainColor] and [EXPANDED_MAIN_SWEEP_DEG]
 * wide, followed by the members of the group, which share the rest of the ring in proportion.
 *
 * Nothing is grouped unless at least two slices are small and at least one is not.
 */
internal fun groupSlices(
    source: List<PieChartData>,
    gapDeg: Float,
    expanded: Boolean,
    otherColor: Int,
    mainColor: Int,
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

    val smallTotal = small.sumOf { it.value }
    if (expanded) {
        // Its share of the ring is EXPANDED_MAIN_SWEEP_DEG out of 360, the group's is the rest.
        val mainValue = smallTotal.times(EXPANDED_MAIN_SWEEP_DEG, MAX_DEG - EXPANDED_MAIN_SWEEP_DEG)
        return Grouping(listOf(PieChartData(MainSliceId, "", mainValue, mainColor)) + small, hasGroup = true)
    }

    val bigTotal = total.subtract(smallTotal)
    val minGroupValue = bigTotal.times(MIN_VISIBLE_SWEEP_DEG, MAX_DEG - MIN_GROUP_SWEEP_DEG)
    val groupValue = if (smallTotal >= minGroupValue) smallTotal else minGroupValue
    return Grouping(big + PieChartData(OtherSliceId, "Other", groupValue, otherColor), hasGroup = true)
}

/** This value scaled by [numerator] / [denominator], both in degrees. */
private fun BigDecimal.times(numerator: Float, denominator: Float): BigDecimal =
    multiply(BigDecimal(numerator.toDouble())).divide(BigDecimal(denominator.toDouble()), MathContext.DECIMAL64)
