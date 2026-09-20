package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import io.github.mohamadjavadx.piechart.sample.utils.dp

/**
 * A slider row with a [UnitToggleView] at the right end of its title. The toggle only takes the
 * touches that start on it; the slider's own touch area is the band around its track.
 */
internal class UnitSliderRow(context: Context, val slider: IntControlView) : FrameLayout(context) {

    val toggle = UnitToggleView(context)

    init {
        addView(slider, LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        addView(
            toggle,
            LayoutParams(WRAP_CONTENT, UNIT_TOGGLE_HEIGHT_DP.dp, Gravity.END or Gravity.TOP).apply {
                marginEnd = 16.dp
            }
        )
    }
}
