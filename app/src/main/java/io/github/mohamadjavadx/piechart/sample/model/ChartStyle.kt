package io.github.mohamadjavadx.piechart.sample.model

/** The chart appearance chosen with the setting controls. */
internal data class ChartStyle(
    val holeRadiusRatio: Float,
    val cornerRadiusRatio: Float,
    val visualGapDeg: Float,
    val selectedShadowOffsetRatio: Float,
    val ensureRenderableSlices: Boolean,
    val dimsOtherSlices: Boolean,
)

internal fun List<Control>.toChartStyle() = ChartStyle(
    holeRadiusRatio = intValue(ChartSetting.HoleRatio) / 100f,
    cornerRadiusRatio = intValue(ChartSetting.CornerRadius) / 100f,
    visualGapDeg = intValue(ChartSetting.GapDeg).toFloat(),
    selectedShadowOffsetRatio = intValue(ChartSetting.ShadowOffset) / 100f,
    ensureRenderableSlices = (control(ChartSetting.EnsureRenderableSlices) as BooleanControl).value,
    dimsOtherSlices = (control(ChartSetting.DimOtherSlices) as BooleanControl).value,
)

private fun List<Control>.intValue(setting: ChartSetting) =
    (control(setting) as IntControl).value

private fun List<Control>.control(setting: ChartSetting) = first { it.id == setting.id }
