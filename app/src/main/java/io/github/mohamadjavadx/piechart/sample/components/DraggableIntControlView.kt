package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Bundle
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.SeekBar
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat.AccessibilityActionCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat.RangeInfoCompat
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * An [IntControlView] whose value follows a horizontal drag or tap along its track, the left and
 * right arrow keys, and the accessibility actions of a slider.
 *
 * Only a touch that starts within a band around the track counts. Anywhere else, e.g. on the
 * title, the touch goes on to the list behind the view. Subclasses draw the touch indicator
 * around their thumb with [drawTouchIndicator].
 */
internal abstract class DraggableIntControlView(
    context: Context,
    attrs: AttributeSet?,
    defStyleAttr: Int,
) : IntControlView(context, attrs, defStyleAttr) {

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private val touchHalfHeight = 24.dp
    private var downX = 0f
    private var downY = 0f
    private var dragging = false

    // Not View.isPressed: that would also drive the framework's pressed-state drawables.
    private var isFingerDown = false
    private val touchIndicator = RippleFade(this)
    private val touchIndicatorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorRipple
        style = Paint.Style.FILL
    }
    private val touchIndicatorRadius = 18.dpf

    init {
        isFocusable = true
    }

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

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        val step = when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> -1
            KeyEvent.KEYCODE_DPAD_RIGHT -> 1
            else -> return super.onKeyDown(keyCode, event)
        }
        commitUserValue(value + step)
        return true
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        AccessibilityNodeInfoCompat.wrap(info).apply {
            className = SeekBar::class.java.name
            rangeInfo = RangeInfoCompat.obtain(RangeInfoCompat.RANGE_TYPE_INT, 0f, maxValue.toFloat(), value.toFloat())
            addAction(AccessibilityActionCompat.ACTION_SET_PROGRESS)
            if (value < maxValue) addAction(AccessibilityActionCompat.ACTION_SCROLL_FORWARD)
            if (value > 0) addAction(AccessibilityActionCompat.ACTION_SCROLL_BACKWARD)
        }
    }

    override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean {
        when (action) {
            AccessibilityActionCompat.ACTION_SET_PROGRESS.id -> {
                val progress = arguments?.getFloat(AccessibilityNodeInfoCompat.ACTION_ARGUMENT_PROGRESS_VALUE) ?: return false
                commitUserValue(progress.roundToInt())
                return true
            }

            AccessibilityNodeInfoCompat.ACTION_SCROLL_FORWARD -> {
                commitUserValue(value + 1)
                return true
            }

            AccessibilityNodeInfoCompat.ACTION_SCROLL_BACKWARD -> {
                commitUserValue(value - 1)
                return true
            }
        }
        return super.performAccessibilityAction(action, arguments)
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
