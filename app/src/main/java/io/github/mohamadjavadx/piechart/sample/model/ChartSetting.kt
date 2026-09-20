package io.github.mohamadjavadx.piechart.sample.model

import kotlin.math.ln
import kotlin.math.roundToInt

/** How a [SizedSetting] is measured. Relative means a ratio, or degrees for the gap. */
internal enum class SizeUnit { Relative, Dp }

/** The settings that are measured in either unit, each on its own. */
internal enum class SizedSetting { Corner, Gap, ShadowOffset }

/**
 * The chart settings, each edited by the [Control] with the same [id]. A [sized] setting has one
 * control per [unit]; only the one for the unit that is picked is shown and used.
 */
internal enum class ChartSetting(val sized: SizedSetting? = null, val unit: SizeUnit? = null) {
    Segments,
    HoleRatio,
    CornerRadius(SizedSetting.Corner, SizeUnit.Relative),
    CornerRadiusDp(SizedSetting.Corner, SizeUnit.Dp),
    GapDeg(SizedSetting.Gap, SizeUnit.Relative),
    GapDp(SizedSetting.Gap, SizeUnit.Dp),
    ShadowOffset(SizedSetting.ShadowOffset, SizeUnit.Relative),
    ShadowOffsetDp(SizedSetting.ShadowOffset, SizeUnit.Dp),
    GroupSmallSlices,
    DimOtherSlices,
    Restore;

    val id: String get() = name
}

/** The settings that start out measured in dp; the others start relative (a ratio, or degrees). */
internal val DefaultDpSettings: Set<SizedSetting> = SizedSetting.entries.toSet()

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
        value = 7,
        maxValue = 30,
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
        unitChoice = UnitChoice(SizedSetting.Corner, "%", SizeUnit.Relative),
    ),
    SteppedSlider(
        id = ChartSetting.CornerRadiusDp.id,
        label = "Corner Radius %d.dp",
        value = 4,
        maxValue = 16,
        unitChoice = UnitChoice(SizedSetting.Corner, "%", SizeUnit.Dp),
    ),
    SteppedSlider(
        id = ChartSetting.GapDeg.id,
        label = "Gap %d°",
        value = 1,
        maxValue = 8,
        unitChoice = UnitChoice(SizedSetting.Gap, "deg", SizeUnit.Relative),
    ),
    SteppedSlider(
        id = ChartSetting.GapDp.id,
        label = "Gap %d.dp",
        value = 2,
        maxValue = 16,
        unitChoice = UnitChoice(SizedSetting.Gap, "deg", SizeUnit.Dp),
    ),
    SteppedSlider(
        id = ChartSetting.ShadowOffset.id,
        label = "Shadow Offset %d%%",
        value = 6,
        maxValue = 15,
        unitChoice = UnitChoice(SizedSetting.ShadowOffset, "%", SizeUnit.Relative),
    ),
    SteppedSlider(
        id = ChartSetting.ShadowOffsetDp.id,
        label = "Shadow Offset %d.dp",
        value = 6,
        maxValue = 12,
        unitChoice = UnitChoice(SizedSetting.ShadowOffset, "%", SizeUnit.Dp),
    ),
    Switch(
        id = ChartSetting.GroupSmallSlices.id,
        label = "Group Small Slices",
        value = true,
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
