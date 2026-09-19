package io.github.mohamadjavadx.piechart.center

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.view.View
import android.view.animation.LinearInterpolator
import io.github.mohamadjavadx.piechart.SelectedSlice

/**
 * Decides what the center shows and how visible it is. A change of slice fades the old content
 * out, then the new content in; new content for the same slice replaces the old at once. The
 * center also fades when it stops or starts fitting.
 */
internal class CenterPresenter(private val view: View) {

    /** The slice whose content is drawn, which lags behind the selection during a fade-out. */
    var displayed: SelectedSlice? = null
        private set

    /** 0..1, applied to everything the renderer draws. */
    var alpha = 0f
        private set

    private var wanted: SelectedSlice? = null
    private var isAvailable = false
    private var animator: ValueAnimator? = null

    fun update(slice: SelectedSlice?, isAvailable: Boolean) {
        wanted = slice
        this.isAvailable = isAvailable
        apply()
    }

    /** Stops any fade and jumps to where it was heading, so nothing stays half-faded. */
    fun cancel() {
        animator?.cancel()
        animator = null
        displayed = wanted
        alpha = if (isAvailable && wanted != null) 1f else 0f
    }

    private fun apply() {
        if (displayed?.data?.id != wanted?.data?.id && alpha > 0f) {
            // Another slice: let the old one fade out first; apply() runs again when done.
            animateTo(0f)
            return
        }
        // The same slice, e.g. with a new value after a data change, is updated in place.
        if (displayed != wanted) displayed = wanted
        animateTo(if (isAvailable && wanted != null) 1f else 0f)
    }

    private fun animateTo(target: Float) {
        animator?.cancel()
        animator = null
        if (alpha == target) return

        var cancelled = false
        animator = ValueAnimator.ofFloat(alpha, target).apply {
            duration = if (target > alpha) FADE_IN_MS else FADE_OUT_MS
            interpolator = LinearInterpolator()
            addUpdateListener {
                alpha = it.animatedValue as Float
                view.invalidate()
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationCancel(animation: Animator) {
                    cancelled = true
                }

                override fun onAnimationEnd(animation: Animator) {
                    if (cancelled) return
                    animator = null
                    apply()
                }
            })
            start()
        }
    }

    private companion object {
        const val FADE_OUT_MS = 100L
        const val FADE_IN_MS = 160L
    }
}
