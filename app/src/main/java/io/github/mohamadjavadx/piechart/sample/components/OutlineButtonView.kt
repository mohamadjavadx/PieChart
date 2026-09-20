package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import io.github.mohamadjavadx.piechart.sample.utils.sp

/** An outlined, full-width button; clicks go to the standard [setOnClickListener]. */
internal class OutlineButtonView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorStroke
        strokeWidth = 1.dpf
        style = Paint.Style.STROKE
    }
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorText
        textSize = 14.sp
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }
    private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorRipple
        style = Paint.Style.FILL
    }

    private val cornerRadius = 16.dpf
    private val desiredHeight = 50.dp
    private val buttonRect = RectF()

    var text: String = ""
        set(value) {
            field = value
            contentDescription = value
            invalidate()
        }

    // Not View.isPressed: that would also drive the framework's pressed-state drawables.
    private var isFingerDown = false
    private val ripple = RippleFade(this)

    init {
        isClickable = true
        isFocusable = true
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(
            MeasureSpec.getSize(widthMeasureSpec),
            resolveSize(desiredHeight, heightMeasureSpec)
        )
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // Inset by half the stroke so it isn't clipped at the edges.
        val offset = strokePaint.strokeWidth / 2f
        buttonRect.set(offset, offset, w - offset, h - offset)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val rippleAlpha = if (isFingerDown) RippleFade.PRESSED_ALPHA else ripple.alpha
        if (rippleAlpha > 0) {
            ripplePaint.alpha = rippleAlpha
            canvas.drawRoundRect(buttonRect, cornerRadius, cornerRadius, ripplePaint)
        }
        canvas.drawRoundRect(buttonRect, cornerRadius, cornerRadius, strokePaint)

        val baseline = height / 2f - (textPaint.descent() + textPaint.ascent()) / 2f
        canvas.drawText(text, width / 2f, baseline, textPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                isFingerDown = true
                ripple.reset()
                invalidate()
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                if (isFingerDown && !isInside(event)) release()
                return true
            }

            MotionEvent.ACTION_UP -> {
                if (!isFingerDown) return false
                release()
                if (isInside(event)) performClick()
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                if (isFingerDown) release()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun isInside(event: MotionEvent) =
        event.x in 0f..width.toFloat() && event.y in 0f..height.toFloat()

    private fun release() {
        isFingerDown = false
        ripple.fadeOut()
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        AccessibilityNodeInfoCompat.wrap(info).className = Button::class.java.name
    }

    override fun onDetachedFromWindow() {
        ripple.reset()
        super.onDetachedFromWindow()
    }

    // Keep lint/accessibility happy since we handle clicks manually.
    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}
