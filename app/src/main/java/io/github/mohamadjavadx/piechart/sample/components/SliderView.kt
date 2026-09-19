package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import io.github.mohamadjavadx.piechart.sample.utils.sp
import kotlin.math.roundToInt

/** A continuous slider from 0 to [maxValue] with a tick every quarter of the track. */
internal class SliderView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : DraggableIntControlView(context, attrs, defStyleAttr) {

    private val trackBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorTrack
        strokeWidth = 2.dpf
        strokeCap = Paint.Cap.ROUND
    }
    private val trackActivePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorAccent
        strokeWidth = 2.dpf
        strokeCap = Paint.Cap.ROUND
    }
    private val tickPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        strokeWidth = 2.dpf
        strokeCap = Paint.Cap.SQUARE
    }
    private val thumbFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorTrack
        style = Paint.Style.FILL
    }
    private val thumbStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorAccent
        strokeWidth = 3.dpf
        style = Paint.Style.STROKE
    }
    private val tickLabelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorTextVariant
        textSize = 11.sp
        textAlign = Paint.Align.CENTER
    }

    private val tickLabels = listOf("0", "25", "50", "75", "100")
    private val thumbRadius = 6.dpf
    private val tickHalfHeight = 5.dpf

    private var sliderStartX = 0f
    private var sliderEndX = 0f
    private var sliderWidth = 0f
    private var sliderY = 0f

    init {
        setPadding(16.dp, 0, 16.dp, 8.dp)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val contentHeight = labelPaint.textSize + 24.dp + 20.dp + tickLabelPaint.textSize
        val desiredHeight = (paddingTop + contentHeight + paddingBottom).toInt()
        setMeasuredDimension(
            MeasureSpec.getSize(widthMeasureSpec),
            resolveSize(desiredHeight, heightMeasureSpec)
        )
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        sliderStartX = paddingLeft.toFloat()
        sliderEndX = (w - paddingRight).toFloat()
        sliderWidth = sliderEndX - sliderStartX

        val titleBottom = paddingTop + labelPaint.textSize
        val tickLabelTop = h - paddingBottom - tickLabelPaint.textSize
        sliderY = (titleBottom + tickLabelTop) / 2f
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        drawTitle(canvas, sliderStartX, paddingTop - labelPaint.fontMetrics.ascent)

        val progress = if (maxValue > 0) value.toFloat() / maxValue else 0f
        val thumbX = sliderStartX + sliderWidth * progress

        canvas.drawLine(sliderStartX, sliderY, sliderEndX, sliderY, trackBgPaint)
        canvas.drawLine(sliderStartX, sliderY, thumbX, sliderY, trackActivePaint)

        val tickLabelBaseline = height - paddingBottom - tickLabelPaint.fontMetrics.descent
        for (i in tickLabels.indices) {
            val tickX = sliderStartX + sliderWidth * i / (tickLabels.size - 1)
            // Ticks strictly before the thumb are highlighted.
            tickPaint.color = if (tickX < thumbX - thumbRadius) Colors.colorAccent else Colors.colorTrack
            canvas.drawLine(tickX, sliderY - tickHalfHeight, tickX, sliderY + tickHalfHeight, tickPaint)
            canvas.drawText(tickLabels[i], tickX, tickLabelBaseline, tickLabelPaint)
        }

        canvas.drawCircle(thumbX, sliderY, thumbRadius, thumbFillPaint)
        canvas.drawCircle(thumbX, sliderY, thumbRadius, thumbStrokePaint)
    }

    override fun valueAt(x: Float): Int {
        if (sliderWidth <= 0f) return value
        val progress = (x.coerceIn(sliderStartX, sliderEndX) - sliderStartX) / sliderWidth
        return (progress * maxValue).roundToInt()
    }
}
