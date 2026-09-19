package io.github.mohamadjavadx.piechart.sample.model

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
        maxValue = 100,
    ),
    Slider(
        id = ChartSetting.CornerRadius.id,
        label = "Corner Radius %d%%",
        value = 50,
        maxValue = 100,
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
