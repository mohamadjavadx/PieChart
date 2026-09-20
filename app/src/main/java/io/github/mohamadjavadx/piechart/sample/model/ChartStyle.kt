package io.github.mohamadjavadx.piechart.sample.model

/** The chart appearance chosen with the setting controls. */
internal data class ChartStyle(
    val holeRadiusRatio: Float,
    val cornerRadius: ChartSize,
    val shadowOffset: ChartSize,
    val gap: ChartSize,
    val ensureRenderableSlices: Boolean,
    val dimsOtherSlices: Boolean,
)

/** A size in one of the two units the chart takes; each setting has its own. */
internal sealed interface ChartSize {

    /** A ratio, or degrees for the gap. */
    data class Relative(val value: Float) : ChartSize

    data class Dp(val value: Float) : ChartSize
}

/** The size when it is relative, else null; one of this and [dpValue] is null. */
internal val ChartSize.relativeValue: Float? get() = (this as? ChartSize.Relative)?.value

/** The size when it is in dp, else null. */
internal val ChartSize.dpValue: Float? get() = (this as? ChartSize.Dp)?.value

/** The style for the controls, with the [dpSettings] measured in dp and the others relatively. */
internal fun List<Control>.toChartStyle(dpSettings: Set<SizedSetting>) = ChartStyle(
    holeRadiusRatio = intValue(ChartSetting.HoleRatio) / 100f,
    cornerRadius = if (SizedSetting.Corner in dpSettings) {
        ChartSize.Dp(intValue(ChartSetting.CornerRadiusDp).toFloat())
    } else {
        ChartSize.Relative(intValue(ChartSetting.CornerRadius) / 100f)
    },
    shadowOffset = if (SizedSetting.ShadowOffset in dpSettings) {
        ChartSize.Dp(intValue(ChartSetting.ShadowOffsetDp).toFloat())
    } else {
        ChartSize.Relative(intValue(ChartSetting.ShadowOffset) / 100f)
    },
    gap = if (SizedSetting.Gap in dpSettings) {
        ChartSize.Dp(intValue(ChartSetting.GapDp).toFloat())
    } else {
        ChartSize.Relative(intValue(ChartSetting.GapDeg).toFloat())
    },
    ensureRenderableSlices = (control(ChartSetting.EnsureRenderableSlices) as BooleanControl).value,
    dimsOtherSlices = (control(ChartSetting.DimOtherSlices) as BooleanControl).value,
)

private fun List<Control>.intValue(setting: ChartSetting) =
    (control(setting) as IntControl).value

private fun List<Control>.control(setting: ChartSetting) = first { it.id == setting.id }
