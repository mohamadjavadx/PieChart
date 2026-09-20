package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import io.github.mohamadjavadx.piechart.sample.model.IntControl
import io.github.mohamadjavadx.piechart.sample.model.Slider
import io.github.mohamadjavadx.piechart.sample.utils.dp

/**
 * The row of a setting that is measured in either of two units: a [UnitToggleView] at the right
 * end of the title and, under it, the slider or the stepped slider of the unit that is picked.
 *
 * It holds both kinds of slider and shows one, so that a change of unit happens inside the row: the
 * toggle stays and slides, the new content fades in, and the row keeps the height of the taller
 * slider, so nothing below it moves. The toggle only takes the touches that start on it.
 */
internal class UnitSliderRow(context: Context) : FrameLayout(context) {

    private val percentSlider = SliderView(context)
    private val steppedSlider = SteppedSliderView(context)
    val toggle = UnitToggleView(context)

    /** The slider that is shown, and that the value is read from and written to. */
    var activeSlider: IntControlView = percentSlider
        private set

    init {
        addView(percentSlider, LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        addView(steppedSlider, LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        // The one that is not shown is invisible, not gone, so that it still counts for the height.
        steppedSlider.visibility = View.INVISIBLE
        addView(
            toggle,
            LayoutParams(WRAP_CONTENT, UNIT_TOGGLE_HEIGHT_DP.dp, Gravity.END or Gravity.TOP).apply {
                marginEnd = 16.dp
            }
        )
    }

    fun setOnValueChangeListener(listener: (Int) -> Unit) {
        percentSlider.setOnValueChangeListener(listener)
        steppedSlider.setOnValueChangeListener(listener)
    }

    /** Shows [item] in the slider of its kind; with [fade] the content fades in instead of appearing. */
    fun show(item: IntControl, fade: Boolean) {
        val target = if (item is Slider) percentSlider else steppedSlider
        val other = if (target === percentSlider) steppedSlider else percentSlider

        target.animate().cancel()
        other.animate().cancel()
        other.visibility = View.INVISIBLE
        target.visibility = View.VISIBLE
        activeSlider = target

        target.maxValue = item.maxValue
        target.value = item.value
        target.setLabelFormat(item.label)

        if (fade) {
            target.alpha = 0f
            target.animate().alpha(1f).setDuration(FADE_MS).start()
        } else {
            target.alpha = 1f
        }
    }

    private companion object {
        const val FADE_MS = 150L
    }
}
