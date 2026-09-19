package io.github.mohamadjavadx.piechart.center

/** When a [CenterRenderer] is shown; see [io.github.mohamadjavadx.piechart.PieChartView.centerVisibility]. */
public sealed interface CenterVisibility {

    /** Only while [CenterRenderer.fits] says the hole is big enough. The default. */
    public data object WhenFits : CenterVisibility

    /** Whenever there is a hole and a selected slice, however small the hole is. */
    public data object Always : CenterVisibility

    public data object Never : CenterVisibility

    /** Only while the hole is at least [ratio] of the chart radius, regardless of the chart's size. */
    public data class MinHoleRatio(val ratio: Float) : CenterVisibility

    /** Only while the hole's radius is at least [px] pixels, regardless of the chart's size. */
    public data class MinHoleRadiusPx(val px: Float) : CenterVisibility
}
