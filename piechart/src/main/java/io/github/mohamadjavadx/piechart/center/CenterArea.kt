package io.github.mohamadjavadx.piechart.center

import android.graphics.RectF
import kotlin.math.sqrt

/**
 * The hole of the donut, in the chart view's own pixel coordinates. A new instance is created
 * whenever the chart's size, padding or hole size changes, so it can be compared by identity.
 */
public class CenterArea(public val cx: Float, public val cy: Float, public val radius: Float) {

    /** True when the chart has no hole, or has not been laid out yet. */
    public val isEmpty: Boolean get() = radius <= 0f

    /** The largest square that fits inside the hole. */
    public val safeRect: RectF = (radius / sqrt(2f)).let { half -> RectF(cx - half, cy - half, cx + half, cy + half) }

    /**
     * The width available to content of the given [height] that is centered in the hole:
     * the length of the chord through its top and bottom edge. Wider than [safeRect] for
     * content that is wider than it is tall, such as a line of text.
     */
    public fun widthFor(height: Float): Float {
        val halfHeight = height / 2f
        return if (halfHeight >= radius) 0f else 2f * sqrt(radius * radius - halfHeight * halfHeight)
    }
}
