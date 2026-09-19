package io.github.mohamadjavadx.piechart.geometry

import android.graphics.Path
import android.graphics.RectF
import io.github.mohamadjavadx.piechart.utils.asin
import io.github.mohamadjavadx.piechart.utils.cos
import io.github.mohamadjavadx.piechart.utils.sin
import io.github.mohamadjavadx.piechart.utils.toDegrees
import io.github.mohamadjavadx.piechart.utils.toRadians

/**
 * Builds the outline of a donut slice, or of a whole ring, between two radii around a center.
 * The chart has one for its slices and one for the band inside the selected slice.
 */
internal class RingPathBuilder {

    private var cx = 0f
    private var cy = 0f

    var outerRadius = 0f
        private set
    var innerRadius = 0f
        private set

    private val outerRect = RectF()
    private val innerRect = RectF()

    /** Rect of a rounded corner. */
    private val cornerRect = RectF()

    fun setRing(cx: Float, cy: Float, outerRadius: Float, innerRadius: Float) {
        this.cx = cx
        this.cy = cy
        this.outerRadius = outerRadius
        this.innerRadius = innerRadius
        outerRect.set(cx - outerRadius, cy - outerRadius, cx + outerRadius, cy + outerRadius)
        innerRect.set(cx - innerRadius, cy - innerRadius, cx + innerRadius, cy + innerRadius)
    }

    /** Builds a complete donut ring (full disc if there is no hole). */
    fun buildFullRing(path: Path) {
        path.fillType = Path.FillType.EVEN_ODD
        path.addCircle(cx, cy, outerRadius, Path.Direction.CW)
        if (innerRadius > 0f) {
            path.addCircle(cx, cy, innerRadius, Path.Direction.CW)
        }
    }

    fun buildSharp(
        path: Path,
        outerStartAngle: Float,
        outerSweep: Float,
        innerStartAngle: Float,
        innerSweep: Float
    ) {
        // A full 360° sweep closes on itself — don't rely on arcTo for it.
        if (outerSweep >= MAX_DEG) {
            buildFullRing(path)
            return
        }
        path.fillType = Path.FillType.WINDING
        path.arcTo(outerRect, outerStartAngle, outerSweep)
        path.arcTo(innerRect, innerStartAngle + innerSweep, -innerSweep)
        path.close()
    }

    fun buildRounded(
        path: Path,
        cOut: Float,
        cIn: Float,
        outerStartAngle: Float,
        outerSweep: Float,
        innerStartAngle: Float,
        innerSweep: Float
    ) {
        path.fillType = Path.FillType.WINDING

        // Outer corner half-angle (0 if cOut is 0)
        val aAlpha = if (cOut > 0f) {
            val ratio = (cOut / (outerRadius - cOut)).coerceIn(-1f, 1f)
            ratio.asin().toDegrees()
        } else {
            0f
        }

        // Inner corner half-angle (0 if cIn is 0 or roundInnerCorners is false)
        val bBeta = if (cIn > 0f && innerRadius > 0f) {
            val ratio = (cIn / (innerRadius + cIn)).coerceIn(-1f, 1f)
            ratio.asin().toDegrees()
        } else {
            0f
        }

        val outerEndAngle = outerStartAngle + outerSweep
        val innerEndAngle = innerStartAngle + innerSweep

        // 1. Outer arc
        val outerArcSweep = (outerSweep - 2 * aAlpha).coerceAtLeast(0f)
        path.arcTo(outerRect, outerStartAngle + aAlpha, outerArcSweep)

        // 2. End outer corner (Only if outer corner is rounded)
        if (cOut > 0f) {
            val angle1 = outerEndAngle - aAlpha
            arcAroundPoint(
                path,
                pointAngleDeg = angle1,
                radius = outerRadius - cOut,
                c = cOut,
                arcStartAngleDeg = angle1,
                sweep = 90f + aAlpha
            )
        }

        // 3. End inner corner (Only if inner corner is rounded)
        if (cIn > 0f && innerRadius > 0f) {
            val angle2 = innerEndAngle - bBeta
            arcAroundPoint(
                path,
                pointAngleDeg = angle2,
                radius = innerRadius + cIn,
                c = cIn,
                arcStartAngleDeg = innerEndAngle + 90f,
                sweep = 90f - bBeta
            )
        }

        // 4. Inner arc (reverse direction)
        // If bBeta is 0, this just connects directly to the inner edge, creating a sharp inner corner
        val innerArcSweep = (innerSweep - 2 * bBeta).coerceAtLeast(0f)
        path.arcTo(innerRect, innerEndAngle - bBeta, -innerArcSweep)

        // 5. Start inner corner (Only if inner corner is rounded)
        if (cIn > 0f && innerRadius > 0f) {
            val angle3 = innerStartAngle + bBeta
            arcAroundPoint(
                path,
                pointAngleDeg = angle3,
                radius = innerRadius + cIn,
                c = cIn,
                arcStartAngleDeg = angle3 + 180f,
                sweep = 90f - bBeta
            )
        }

        // 6. Start outer corner (Only if outer corner is rounded)
        if (cOut > 0f) {
            val angle4 = outerStartAngle + aAlpha
            arcAroundPoint(
                path,
                pointAngleDeg = angle4,
                radius = outerRadius - cOut,
                c = cOut,
                arcStartAngleDeg = outerStartAngle - 90f,
                sweep = 90f + aAlpha
            )
        }

        path.close()
    }

    /** Adds an arc (rounded corner) of radius [c] centered at a point on the circle of [radius]. */
    private fun arcAroundPoint(
        path: Path,
        pointAngleDeg: Float,
        radius: Float,
        c: Float,
        arcStartAngleDeg: Float,
        sweep: Float
    ) {
        val rad = pointAngleDeg.toRadians()
        val px = cx + radius * rad.cos()
        val py = cy + radius * rad.sin()

        cornerRect.set(
            px - c, py - c,
            px + c, py + c
        )
        path.arcTo(cornerRect, arcStartAngleDeg, sweep)
    }
}
