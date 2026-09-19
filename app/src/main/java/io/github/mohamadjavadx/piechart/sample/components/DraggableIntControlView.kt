package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ViewConfiguration
import kotlin.math.abs

/** An [IntControlView] whose value follows a horizontal drag or tap along its track. */
internal abstract class DraggableIntControlView(
    context: Context,
    attrs: AttributeSet?,
    defStyleAttr: Int,
) : IntControlView(context, attrs, defStyleAttr) {

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private var downX = 0f
    private var downY = 0f
    private var dragging = false

    init {
        isClickable = true
        isFocusable = true
    }

    /** The value selected by a finger at [x]; return [value] when the track isn't laid out yet. */
    protected abstract fun valueAt(x: Float): Int

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                dragging = false
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
                dragging = false
                performClick()
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                dragging = false
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    // Keep lint/accessibility happy since we handle clicks manually.
    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}
