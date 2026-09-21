package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ViewConfiguration
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import kotlin.math.abs

/**
 * An [IntControlView] whose value follows a horizontal drag or tap along its track.
 *
 * Only a touch that starts within a band around the track counts. Anywhere else, e.g. on the
 * title, the touch goes on to the list behind the view. Subclasses draw the touch indicator
 * around their thumb with [drawTouchIndicator].
 *
 * The track runs almost to the edges of the screen, where a swipe is the system's back gesture:
 * the area around the thumb's path is one that [GestureExclusionPlanner] keeps out of it.
 */
internal abstract class DraggableIntControlView(
    context: Context,
    attrs: AttributeSet?,
    defStyleAttr: Int,
) : IntControlView(context, attrs, defStyleAttr), EdgeSwipeControl {

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private val touchHalfHeight = 24.dp
    private var downX = 0f
    private var downY = 0f
    private var dragging = false

    // Not View.isPressed: that would also drive the framework's pressed-state drawables.
    private var isFingerDown = false
    private val edgeArea = Rect()
    private val edgeAreas = listOf(EdgeSwipeArea(edgeArea, EdgeSwipePriority.DRAGGED))
    private val touchIndicator = RippleFade(this)
    private val touchIndicatorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorRipple
        style = Paint.Style.FILL
    }
    private val touchIndicatorRadius = 18.dpf

    /** The y of the middle of the track, which the touch band is centred on. */
    protected abstract val trackCenterY: Float

    /** The value selected by a finger at [x]; return [value] when the track isn't laid out yet. */
    protected abstract fun valueAt(x: Float): Int

    /** Draws the touch indicator centred on [cx], [cy] while a finger is down and while it fades out after. */
    protected fun drawTouchIndicator(canvas: Canvas, cx: Float, cy: Float) {
        val alpha = if (isFingerDown) RippleFade.PRESSED_ALPHA else touchIndicator.alpha
        if (alpha <= 0) return
        touchIndicatorPaint.alpha = alpha
        canvas.drawCircle(cx, cy, touchIndicatorRadius, touchIndicatorPaint)
    }

    /**
     * The thumb and its touch indicator, along the whole track: the band a drag is grabbed in is
     * wider, but there is little room for areas to keep out of the back gesture (see the planner).
     */
    override fun edgeSwipeAreas(): List<EdgeSwipeArea> {
        val half = touchIndicatorRadius.toInt()
        edgeArea.set(0, (trackCenterY - half).toInt().coerceAtLeast(0), width, (trackCenterY + half).toInt().coerceAtMost(height))
        return edgeAreas
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                // Not consumed away from the track: the list may scroll or take the touch.
                if (abs(event.y - trackCenterY) > touchHalfHeight) return false
                downX = event.x
                downY = event.y
                dragging = false
                isFingerDown = true
                touchIndicator.reset()
                invalidate()
                // Claim the gesture so MOVE events arrive. The parent may still scroll
                // vertically until the movement turns out to be a horizontal drag.
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                val dx = abs(event.x - downX)
                val dy = abs(event.y - downY)
                if (!dragging && dx > touchSlop && dx > dy) {
                    dragging = true
                    parent?.requestDisallowInterceptTouchEvent(true)
                }
                if (dragging) commitUserValue(valueAt(event.x))
                return true
            }

            MotionEvent.ACTION_UP -> {
                // A tap jumps to the tapped position, like the end of a drag.
                commitUserValue(valueAt(event.x))
                val wasTap = !dragging
                release()
                if (wasTap) performClick()
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                release()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun release() {
        dragging = false
        isFingerDown = false
        touchIndicator.fadeOut()
    }

    override fun onDetachedFromWindow() {
        touchIndicator.reset()
        super.onDetachedFromWindow()
    }

    // Keep lint/accessibility happy since we handle clicks manually.
    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}
