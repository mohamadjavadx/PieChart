package io.github.mohamadjavadx.piechart

import java.math.BigDecimal

/**
 * One slice of a [PieChartView].
 *
 * @property id Identifies the slice across data changes: a slice that keeps its id animates from its old size to its
 * new one, and stays selected. Any object with a stable `equals` works, and ids should be unique.
 * @property label What the slice is called, for example in the center of the chart.
 * @property value The size of the slice, exact. Slices are drawn in proportion to the sum of the values; a
 * slice whose value is not above zero is left out.
 * @property color The slice's color, including its alpha (a color that is not opaque draws partly transparent).
 */
public data class PieChartData(
    val id: Any,
    val label: String,
    val value: BigDecimal,
    val color: Int,
)

/**
 * The id of the slice that stands for the small slices while [PieChartView] has them grouped
 * ([PieChartView.groupSmallSlices]). It is in [PieChartView.currentDataset], never in the data
 * that was given to the chart.
 */
public data object OtherSliceId

/**
 * The id of the slice that stands for all the other slices while the small ones are expanded
 * ([PieChartView.isGroupExpanded]).
 */
public data object MainSliceId
