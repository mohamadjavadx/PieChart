package io.github.mohamadjavadx.piechart.center

import android.graphics.Canvas
import io.github.mohamadjavadx.piechart.PieChartView
import io.github.mohamadjavadx.piechart.SelectedSlice

/**
 * Draws information about the selected slice in the hole of a [PieChartView]
 * (see [PieChartView.centerRenderer]).
 *
 * [DefaultCenterRenderer] draws a label and a value. Implement this interface for anything
 * else; the chart handles when to show it and fades it in and out, so a renderer only needs
 * to draw at full opacity.
 *
 * Both functions receive [slices], every slice of the chart (the same list instance until the
 * data changes), so a renderer can decide from all of them, for example whether its content
 * fits, and not only from the selected one.
 */
public interface CenterRenderer {

    /**
     * Whether [area] is big enough for this renderer. The chart calls it when its size, hole or
     * data changes and shows the renderer only while it returns true (with the default
     * [CenterVisibility.WhenFits]).
     *
     * Decide from the geometry and the data as a whole, not from the selected slice: otherwise
     * the center would come and go as the selection moves between slices.
     */
    public fun fits(area: CenterArea, slices: List<SelectedSlice>): Boolean = true

    /**
     * Draws [slice] inside [area]. Stay within the hole, and avoid allocating: this runs on
     * every frame while the chart animates.
     */
    public fun draw(canvas: Canvas, area: CenterArea, slice: SelectedSlice, slices: List<SelectedSlice>)
}
