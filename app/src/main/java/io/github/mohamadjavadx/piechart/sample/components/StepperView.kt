package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.TextPaint
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ViewConfiguration
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import io.github.mohamadjavadx.piechart.sample.utils.sp

/**
 * A label with the current value, and − / + buttons that change it by one. Holding a button down
 * keeps changing the value by one until the button is let go or the end of the range is reached.
 */
internal class StepperView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : IntControlView(context, attrs, defStyleAttr) {

    private val middlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorText
        textSize = 14.sp
        textAlign = Paint.Align.CENTER
    }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorText
        textSize = 24.dpf
        textAlign = Paint.Align.CENTER
    }
    private val circleStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorStroke
        strokeWidth = 1.dpf
        style = Paint.Style.STROKE
    }
    private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorRipple
        style = Paint.Style.FILL
    }

    private val buttonSize = 40.dpf
    private val radius = 20.dpf
    private val labelGap = 16.dp

    // The buttons are hit-tested and drawn (circle and ripple) in these rects.
    private val minusRect = RectF()
    private val plusRect = RectF()

    private var isMinusPressed = false
    private var isPlusPressed = false
    private val minusRipple = RippleFade(this)
    private val plusRipple = RippleFade(this)

    // Whether the press went on long enough to repeat; then letting go is not one more click.
    private var hasRepeated = false
    private val repeatHeld = object : Runnable {
        override fun run() {
            val minus = isMinusPressed
            if (!minus && !isPlusPressed) return
            hasRepeated = true
            isRepeating = true
            commitUserValue(if (minus) value - 1 else value + 1)
            isRepeating = false
            if (if (minus) value > 0 else value < maxValue) {
                postDelayed(this, REPEAT_INTERVAL_MS)
            } else {
                // The button is off now: let the press fade out, the finger may stay down.
                release(minus)
            }
        }
    }

    init {
        setPadding(16.dp, 0, 16.dp, 0)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desiredHeight = (paddingTop + buttonSize + circleStrokePaint.strokeWidth * 2 + paddingBottom).toInt()
        setMeasuredDimension(
            MeasureSpec.getSize(widthMeasureSpec),
            resolveSize(desiredHeight, heightMeasureSpec)
        )
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val centerY = h / 2f

        // From the right edge: [ − ] [ value ] [ + ]
        val plusRight = w - paddingRight.toFloat()
        val plusLeft = plusRight - buttonSize
        val minusRight = plusLeft - buttonSize
        val minusLeft = minusRight - buttonSize
        plusRect.set(plusLeft, centerY - radius, plusRight, centerY + radius)
        minusRect.set(minusLeft, centerY - radius, minusRight, centerY + radius)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val centerY = height / 2f
        val baseline = centerY - (labelPaint.descent() + labelPaint.ascent()) / 2f
        drawTitle(canvas, paddingLeft.toFloat(), baseline, maxLabelWidth = minusRect.left - paddingLeft - labelGap)

        val middleBaseline = centerY - (middlePaint.descent() + middlePaint.ascent()) / 2f
        canvas.drawText(valueString, (minusRect.right + plusRect.left) / 2f, middleBaseline, middlePaint)

        drawButton(canvas, minusRect, "−", enabled = value > 0, isPressed = isMinusPressed, ripple = minusRipple)
        drawButton(canvas, plusRect, "+", enabled = value < maxValue, isPressed = isPlusPressed, ripple = plusRipple)
    }

    private fun drawButton(
        canvas: Canvas,
        rect: RectF,
        symbol: String,
        enabled: Boolean,
        isPressed: Boolean,
        ripple: RippleFade,
    ) {
        val alpha = if (enabled) 255 else DISABLED_ALPHA
        circleStrokePaint.alpha = alpha
        iconPaint.alpha = alpha

        val rippleAlpha = if (isPressed) RippleFade.PRESSED_ALPHA else ripple.alpha
        if (enabled && rippleAlpha > 0) {
            ripplePaint.alpha = rippleAlpha
            canvas.drawRoundRect(rect, radius, radius, ripplePaint)
        }

        val centerY = height / 2f
        canvas.drawCircle(rect.centerX(), centerY, radius, circleStrokePaint)
        val iconBaseline = centerY - (iconPaint.descent() + iconPaint.ascent()) / 2f
        canvas.drawText(symbol, rect.centerX(), iconBaseline, iconPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                isMinusPressed = minusRect.contains(event.x, event.y) && value > 0
                isPlusPressed = !isMinusPressed && plusRect.contains(event.x, event.y) && value < maxValue
                if (isMinusPressed) minusRipple.reset()
                if (isPlusPressed) plusRipple.reset()
                if (isMinusPressed || isPlusPressed) {
                    hasRepeated = false
                    postDelayed(repeatHeld, ViewConfiguration.getLongPressTimeout().toLong())
                }
                invalidate()
                return isMinusPressed || isPlusPressed
            }

            MotionEvent.ACTION_MOVE -> {
                // Moving off the pressed button starts the fade-out.
                if (isMinusPressed && !minusRect.contains(event.x, event.y)) release(minus = true)
                if (isPlusPressed && !plusRect.contains(event.x, event.y)) release(minus = false)
                return true
            }

            MotionEvent.ACTION_UP -> {
                val minus = isMinusPressed
                val plus = isPlusPressed
                if (!minus && !plus) return false
                release(minus)
                if (hasRepeated) return true
                commitUserValue(if (minus) value - 1 else value + 1)
                performClick()
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                if (isMinusPressed) release(minus = true)
                if (isPlusPressed) release(minus = false)
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun release(minus: Boolean) {
        removeCallbacks(repeatHeld)
        if (minus) {
            isMinusPressed = false
            minusRipple.fadeOut()
        } else {
            isPlusPressed = false
            plusRipple.fadeOut()
        }
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(repeatHeld)
        minusRipple.reset()
        plusRipple.reset()
        super.onDetachedFromWindow()
    }

    // Keep lint/accessibility happy since we handle clicks manually.
    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    private companion object {
        const val DISABLED_ALPHA = 77 // ~0.3
        const val REPEAT_INTERVAL_MS = 70L
    }
}
