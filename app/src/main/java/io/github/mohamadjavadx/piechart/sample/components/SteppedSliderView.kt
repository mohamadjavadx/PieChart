package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import kotlin.math.roundToInt

/** A slider that snaps to `maxValue + 1` evenly spaced steps, each marked by a dot. */
internal class SteppedSliderView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : DraggableIntControlView(context, attrs, defStyleAttr) {

    private val trackBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorStroke
        style = Paint.Style.FILL
    }
    private val trackActivePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorAccent
        style = Paint.Style.FILL
    }
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val trackHeight = 12.dpf
    private val dotRadius = 3.dpf
    private val dotMargin = 11.dpf

    private var trackStartX = 0f
    private var trackEndX = 0f
    private var trackWidth = 0f
    override var trackCenterY = 0f
        private set

    private val bgRect = RectF()
    private val activeRect = RectF()

    init {
        setPadding(16.dp, 0, 16.dp, 29.dp)
    }

    /** Distance between two neighbouring dots. */
    private val dotSpacing: Float
        get() = if (maxValue > 0) (trackWidth - 2 * dotMargin) / maxValue else 0f

    private fun dotX(index: Int, spacing: Float) = trackStartX + dotMargin + index * spacing

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val contentHeight = labelPaint.textSize + 16.dpf + trackHeight
        val desiredHeight = (paddingTop + contentHeight + paddingBottom).toInt()
        setMeasuredDimension(
            getDefaultSize(suggestedMinimumWidth, widthMeasureSpec),
            resolveSize(desiredHeight, heightMeasureSpec)
        )
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        trackStartX = paddingLeft.toFloat()
        trackEndX = (w - paddingRight).toFloat()
        trackWidth = trackEndX - trackStartX
        trackCenterY = paddingTop + labelPaint.textSize + 16.dpf + trackHeight / 2f
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        drawTitle(canvas, trackStartX, paddingTop - labelPaint.fontMetrics.ascent)

        val spacing = dotSpacing
        // The active track reaches half a dot past the selected one.
        val activeEndX = trackStartX + dotMargin * 2 + value * spacing

        val trackTop = trackCenterY - trackHeight / 2f
        val trackBottom = trackCenterY + trackHeight / 2f
        val trackRadius = trackHeight / 2f
        bgRect.set(trackStartX, trackTop, trackEndX, trackBottom)
        canvas.drawRoundRect(bgRect, trackRadius, trackRadius, trackBgPaint)
        activeRect.set(trackStartX, trackTop, activeEndX, trackBottom)
        canvas.drawRoundRect(activeRect, trackRadius, trackRadius, trackActivePaint)

        // Dots inside the active track are cut out in the track's background color.
        for (i in 0..maxValue) {
            val x = dotX(i, spacing)
            dotPaint.color = if (x <= activeEndX) Colors.colorStroke else Colors.colorDivider
            canvas.drawCircle(x, trackCenterY, dotRadius, dotPaint)
        }
        drawTouchIndicator(canvas, dotX(value, spacing), trackCenterY)
    }

    override fun valueAt(x: Float): Int {
        val spacing = dotSpacing
        if (trackWidth <= 0f || spacing <= 0f) return value
        val step = (x.coerceIn(trackStartX, trackEndX) - dotX(0, spacing)) / spacing
        return step.roundToInt().coerceIn(0, maxValue)
    }
}
