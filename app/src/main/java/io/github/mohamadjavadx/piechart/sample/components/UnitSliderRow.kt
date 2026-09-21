package io.github.mohamadjavadx.piechart.sample.components

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Rect
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import androidx.core.view.isVisible
import io.github.mohamadjavadx.piechart.sample.utils.dp

/**
 * A slider row with a [UnitToggleView] at the right end of its title. The toggle only takes the
 * touches that start on it; the slider's own touch area is the band around its track.
 */
// Only ever built in code, around the slider it holds; there is nothing to inflate.
@SuppressLint("ViewConstructor")
internal class UnitSliderRow(context: Context, val slider: IntControlView) : FrameLayout(context), EdgeSwipeControl {

    val toggle = UnitToggleView(context)

    // The toggle is next to the edge of the screen, and only tapped: the lowest priority for the back gesture.
    private val toggleArea = Rect()
    private val edgeAreas = ArrayList<EdgeSwipeArea>()

    init {
        addView(slider, LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        addView(
            toggle,
            LayoutParams(WRAP_CONTENT, UNIT_TOGGLE_HEIGHT_DP.dp, Gravity.END or Gravity.TOP).apply {
                marginEnd = 16.dp
            }
        )
    }

    /** The slider's areas, if it is a control with any, and the toggle's, when it shows. */
    override fun edgeSwipeAreas(): List<EdgeSwipeArea> {
        edgeAreas.clear()
        (slider as? EdgeSwipeControl)?.edgeSwipeAreas()?.forEach { area ->
            edgeAreas += EdgeSwipeArea(Rect(area.bounds).apply { offset(slider.left, slider.top) }, area.priority)
        }
        if (toggle.isVisible) {
            toggleArea.set(toggle.left, toggle.top, width, toggle.bottom)
            edgeAreas += EdgeSwipeArea(toggleArea, EdgeSwipePriority.TAPPED)
        }
        return edgeAreas
    }
}
