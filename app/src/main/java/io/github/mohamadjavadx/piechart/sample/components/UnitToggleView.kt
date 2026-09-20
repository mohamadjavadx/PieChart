package io.github.mohamadjavadx.piechart.sample.components

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.DecelerateInterpolator
import android.widget.Button
import androidx.core.graphics.ColorUtils
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat.AccessibilityActionCompat
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import io.github.mohamadjavadx.piechart.sample.utils.sp
import kotlin.math.abs

/** Height of the unit toggle, in dp. */
internal const val UNIT_TOGGLE_HEIGHT_DP = 30

/**
 * Space above a slider's title, in dp, that centres the title's line on the unit toggle at the
 * right end of it.
 */
internal const val SLIDER_TITLE_INSET_DP = 7

/**
 * A small segmented pill for picking one of a few units, like `% | dp`. The selected segment is a
 * white knob that slides to the segment that is tapped; the texts blend between the two colors on
 * the way. Setting [selectedIndex] from code moves the knob at once, only a tap animates it.
 */
internal class UnitToggleView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorTrack
        style = Paint.Style.FILL
    }
    private val knobPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorBackground
        style = Paint.Style.FILL
    }
    private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorRipple
        style = Paint.Style.FILL
    }
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = 13.sp
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }

    private val inset = 3.dpf
    private val minSegmentWidth = 48.dpf
    private val segmentTextPadding = 10.dpf

    private var segmentWidth = minSegmentWidth
    private val knobRect = RectF()

    var labels: List<String> = emptyList()
        set(value) {
            if (field == value) return
            field = value
            selected = selected.coerceIn(0, (value.size - 1).coerceAtLeast(0))
            knobPosition = selected.toFloat()
            updateStateDescription()
            requestLayout()
            invalidate()
        }

    private var selected = 0

    /** Setting this from code moves the knob at once and does not notify the listener. */
    var selectedIndex: Int
        get() = selected
        set(value) = moveTo(value, animate = false, notify = false)

    /**
     * Takes over from [other], the toggle that this one replaces: the knob carries on from where it
     * is drawn there and slides to the selected unit, so that the swap does not show.
     */
    fun continueFrom(other: UnitToggleView) {
        knobAnimator.cancel()
        knobPosition = other.knobPosition
        if (knobPosition == selected.toFloat()) {
            invalidate()
        } else {
            knobAnimator.setFloatValues(knobPosition, selected.toFloat())
            knobAnimator.start()
        }
    }

    private var selectionListener: ((Int) -> Unit)? = null

    /** Called with the index of the segment that a tap or a key press has selected. */
    fun setOnSelectedListener(listener: (Int) -> Unit) {
        selectionListener = listener
    }

    /** Where the knob is, in segments: 0 at the first, animated between two. */
    private var knobPosition = 0f
    private val knobAnimator = ValueAnimator().apply {
        duration = 180
        interpolator = DecelerateInterpolator()
        addUpdateListener {
            knobPosition = it.animatedValue as Float
            invalidate()
        }
    }

    // Not View.isPressed: that would also drive the framework's pressed-state drawables.
    private var isFingerDown = false
    private var pressedIndex = -1
    private var rippleIndex = -1
    private val ripple = RippleFade(this)

    init {
        isFocusable = true
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val widest = labels.maxOfOrNull { textPaint.measureText(it) } ?: 0f
        segmentWidth = maxOf(minSegmentWidth, widest + 2 * segmentTextPadding)
        val width = (labels.size * segmentWidth + 2 * inset).toInt()
        setMeasuredDimension(resolveSize(width, widthMeasureSpec), resolveSize(UNIT_TOGGLE_HEIGHT_DP.dp, heightMeasureSpec))
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (labels.isEmpty()) return

        val w = width.toFloat()
        val h = height.toFloat()
        canvas.drawRoundRect(0f, 0f, w, h, h / 2f, h / 2f, trackPaint)

        val knobRadius = (h - 2 * inset) / 2f
        val knobLeft = inset + knobPosition * segmentWidth
        knobRect.set(knobLeft, inset, knobLeft + segmentWidth, h - inset)
        canvas.drawRoundRect(knobRect, knobRadius, knobRadius, knobPaint)

        val rippleAlpha = if (isFingerDown) RippleFade.PRESSED_ALPHA else ripple.alpha
        if (rippleIndex >= 0 && rippleAlpha > 0) {
            val left = inset + rippleIndex * segmentWidth
            knobRect.set(left, inset, left + segmentWidth, h - inset)
            ripplePaint.alpha = rippleAlpha
            canvas.drawRoundRect(knobRect, knobRadius, knobRadius, ripplePaint)
        }

        val baseline = h / 2f - (textPaint.descent() + textPaint.ascent()) / 2f
        for (i in labels.indices) {
            val closeness = 1f - minOf(1f, abs(knobPosition - i))
            textPaint.color = ColorUtils.blendARGB(Colors.colorTextVariant, Colors.colorAccent, closeness)
            canvas.drawText(labels[i], inset + (i + 0.5f) * segmentWidth, baseline, textPaint)
        }
    }

    private fun segmentAt(x: Float): Int {
        val index = ((x - inset) / segmentWidth).toInt()
        return if (x >= inset && index in labels.indices) index else -1
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                pressedIndex = segmentAt(event.x)
                if (pressedIndex == -1) return false
                rippleIndex = pressedIndex
                isFingerDown = true
                ripple.reset()
                invalidate()
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                // Sliding off the pressed segment cancels the press.
                if (pressedIndex != -1 && segmentAt(event.x) != pressedIndex) release()
                return true
            }

            MotionEvent.ACTION_UP -> {
                val pressed = pressedIndex
                val wasOnIt = pressed != -1 && segmentAt(event.x) == pressed
                release()
                if (wasOnIt) {
                    moveTo(pressed, animate = true, notify = true)
                    performClick()
                }
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
        pressedIndex = -1
        if (isFingerDown) {
            isFingerDown = false
            ripple.fadeOut()
        }
    }

    private fun moveTo(index: Int, animate: Boolean, notify: Boolean) {
        if (labels.isEmpty()) return
        val target = index.coerceIn(0, labels.lastIndex)
        val changed = target != selected
        selected = target
        updateStateDescription()

        when {
            animate && changed -> {
                knobAnimator.cancel()
                knobAnimator.setFloatValues(knobPosition, target.toFloat())
                knobAnimator.start()
            }
            else -> {
                knobAnimator.cancel()
                knobPosition = target.toFloat()
                invalidate()
            }
        }
        if (notify && changed) selectionListener?.invoke(target)
    }

    private fun updateStateDescription() {
        ViewCompat.setStateDescription(this, labels.getOrNull(selected))
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        val step = when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> -1
            KeyEvent.KEYCODE_DPAD_RIGHT -> 1
            else -> return super.onKeyDown(keyCode, event)
        }
        moveTo(selected + step, animate = true, notify = true)
        return true
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        AccessibilityNodeInfoCompat.wrap(info).apply {
            className = Button::class.java.name
            // A click moves to the next unit, wrapping round.
            addAction(AccessibilityActionCompat.ACTION_CLICK)
        }
    }

    override fun performAccessibilityAction(action: Int, arguments: android.os.Bundle?): Boolean {
        if (action == AccessibilityNodeInfoCompat.ACTION_CLICK && labels.isNotEmpty()) {
            moveTo((selected + 1) % labels.size, animate = true, notify = true)
            return true
        }
        return super.performAccessibilityAction(action, arguments)
    }

    override fun onDetachedFromWindow() {
        knobAnimator.cancel()
        ripple.reset()
        super.onDetachedFromWindow()
    }

    // Keep lint/accessibility happy since we handle clicks manually.
    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}
