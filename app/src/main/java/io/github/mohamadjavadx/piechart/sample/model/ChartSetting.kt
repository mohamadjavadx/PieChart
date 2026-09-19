package io.github.mohamadjavadx.piechart.sample.model

import kotlin.math.ln
import kotlin.math.roundToInt

/** The chart settings, each edited by the [Control] with the same [id]. */
internal enum class ChartSetting {
    Segments,
    HoleRatio,
    CornerRadius,
    GapDeg,
    ShadowOffset,
    EnsureRenderableSlices,
    DimOtherSlices,
    Restore;

    val id: String get() = name
}

private const val HoleRatioMax = 95
private const val CornerRadiusMax = 100

// The curve of maxCornerRadius passes through these two points, and through the two maximums.
private const val LowHoleRatio = 25
private const val CornerRadiusAtLowHoleRatio = 5

/**
 * The largest corner radius (in %) for a hole ratio (in %), so that a thick ring doesn't get
 * blobby corners. It is a logarithmic curve, from [CornerRadiusAtLowHoleRatio] at [LowHoleRatio]
 * up to [CornerRadiusMax] at [HoleRatioMax]: the smaller the hole, the faster it falls.
 */
internal fun maxCornerRadius(holeRatio: Int): Int {
    val position = ln(holeRatio.toDouble() / LowHoleRatio) / ln(HoleRatioMax.toDouble() / LowHoleRatio)
    val radius = CornerRadiusAtLowHoleRatio + (CornerRadiusMax - CornerRadiusAtLowHoleRatio) * position
    return radius.coerceIn(0.0, CornerRadiusMax.toDouble()).roundToInt()
}

internal val DefaultControls: List<Control> = listOf(
    Stepper(
        id = ChartSetting.Segments.id,
        label = "Number of Segments %d",
        value = 5,
        maxValue = 100,
    ),
    Slider(
        id = ChartSetting.HoleRatio.id,
        label = "Hole Ratio %d%%",
        value = 85,
        maxValue = HoleRatioMax,
    ),
    Slider(
        id = ChartSetting.CornerRadius.id,
        label = "Corner Radius %d%%",
        value = 50,
        maxValue = CornerRadiusMax,
    ),
    SteppedSlider(
        id = ChartSetting.GapDeg.id,
        label = "Gap %d°",
        value = 1,
        maxValue = 10,
    ),
    SteppedSlider(
        id = ChartSetting.ShadowOffset.id,
        label = "Shadow Offset %d%%",
        value = 6,
        maxValue = 15,
    ),
    Switch(
        id = ChartSetting.EnsureRenderableSlices.id,
        label = "Ensure Renderable Slices",
        value = false,
    ),
    Switch(
        id = ChartSetting.DimOtherSlices.id,
        label = "Dim Other Slices",
        value = false,
    ),
    Button(
        id = ChartSetting.Restore.id,
        label = "Restore Default",
    ),
)
