package io.github.mohamadjavadx.piechart.sample.components

import android.graphics.Rect
import android.view.View
import android.view.ViewTreeObserver
import androidx.core.view.ViewCompat
import androidx.recyclerview.widget.RecyclerView
import io.github.mohamadjavadx.piechart.sample.utils.dp

/** How badly a swipe that starts in an area must not become the back gesture: the lower, the worse. */
internal object EdgeSwipePriority {
    /** A thumb that is dragged. */
    const val DRAGGED = 0

    /** A button that is held down. */
    const val HELD = 1

    /** A control that is tapped: only a careless tap turns into a swipe. */
    const val TAPPED = 2
}

/** An area, in the control's own coordinates, that reaches the edge of the screen and takes swipes or holds there. */
internal class EdgeSwipeArea(val bounds: Rect, val priority: Int)

/** A control with [EdgeSwipeArea]s, which [GestureExclusionPlanner] keeps out of the system's gestures. */
internal interface EdgeSwipeControl {
    fun edgeSwipeAreas(): List<EdgeSwipeArea>
}

/**
 * Keeps the system's back gesture off the controls of [list] that are swiped or held next to the
 * edge of the screen, so that a drag that starts at the end of a track moves the thumb instead of
 * closing the screen. It works on Android 10 and up, and does nothing before.
 *
 * The system only honors about 200 dp of such area per edge, and when it is given more it quietly
 * drops what is highest on the screen, which here is the stepper and the first slider. So the
 * planner chooses: of the controls on screen, the dragged areas first, then the held, then the
 * tapped, as many as fit, and only those are handed over. It looks again whenever the list is
 * drawn, which covers scrolling and rows that come and go.
 */
internal class GestureExclusionPlanner(private val list: RecyclerView) : ViewTreeObserver.OnDrawListener {

    // A little under the 200 dp that the system keeps, for rounding.
    private val budget = 196.dp
    private var handedOver: List<Rect> = emptyList()

    /** Starts planning while [list] is on screen. */
    fun attach() {
        list.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                v.viewTreeObserver.addOnDrawListener(this@GestureExclusionPlanner)
            }

            override fun onViewDetachedFromWindow(v: View) {
                v.viewTreeObserver.removeOnDrawListener(this@GestureExclusionPlanner)
            }
        })
        if (list.isAttachedToWindow) list.viewTreeObserver.addOnDrawListener(this)
    }

    override fun onDraw() {
        val screen = Rect(0, 0, list.width, list.height)
        val candidates = ArrayList<Pair<Int, Rect>>()
        for (i in 0 until list.childCount) {
            val child = list.getChildAt(i)
            val control = child as? EdgeSwipeControl ?: continue
            for (area in control.edgeSwipeAreas()) {
                val onList = Rect(area.bounds)
                onList.offset((child.left + child.translationX).toInt(), (child.top + child.translationY).toInt())
                // Only what is on screen counts.
                if (onList.intersect(screen)) candidates += area.priority to onList
            }
        }
        candidates.sortWith(compareBy({ it.first }, { it.second.top }))

        var usedLeft = 0
        var usedRight = 0
        val chosen = ArrayList<Rect>()
        for ((_, rect) in candidates) {
            val atLeft = rect.left <= 0
            val atRight = rect.right >= list.width
            if (atLeft && usedLeft + rect.height() > budget) continue
            if (atRight && usedRight + rect.height() > budget) continue
            if (atLeft) usedLeft += rect.height()
            if (atRight) usedRight += rect.height()
            chosen += rect
        }

        if (chosen != handedOver) {
            handedOver = chosen
            ViewCompat.setSystemGestureExclusionRects(list, chosen)
        }
    }
}
