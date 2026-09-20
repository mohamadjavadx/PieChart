package io.github.mohamadjavadx.piechart

import java.math.BigDecimal

/** The slice the user selected: what [PieChartView] reports and what a center renderer draws. */
public data class SelectedSlice(
    /** Index in [PieChartView.currentDataset]. */
    val index: Int,
    val data: PieChartData,
    /** Sum of all the slice values given to the chart, exact; also while small slices are grouped. */
    val total: BigDecimal,
    /** Share of all the data given to the chart, 0..1; only meant for drawing and rounding. */
    val fraction: Float,
)
