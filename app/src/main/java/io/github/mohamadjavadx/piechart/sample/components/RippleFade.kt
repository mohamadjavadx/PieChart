package io.github.mohamadjavadx.piechart.sample.components

import android.animation.ValueAnimator
import android.graphics.Color
import android.view.View
import android.view.animation.DecelerateInterpolator
import io.github.mohamadjavadx.piechart.sample.theme.Colors

/**
 * The press highlight of a custom view: while pressed it is drawn at [PRESSED_ALPHA]; after
 * release [fadeOut] animates [alpha] down to 0 and invalidates [view] on every step.
 */
internal class RippleFade(private val view: View) {

    var alpha = 0
        private set

    private val animator = ValueAnimator.ofInt(PRESSED_ALPHA, 0).apply {
        duration = 200
        interpolator = DecelerateInterpolator()
        addUpdateListener {
            alpha = it.animatedValue as Int
            view.invalidate()
        }
    }

    fun fadeOut() = animator.start()

    /** Ends any running fade and clears the highlight, e.g. when a new press starts. */
    fun reset() {
        animator.cancel()
        alpha = 0
    }

    companion object {
        val PRESSED_ALPHA = Color.alpha(Colors.colorRipple)
    }
}
