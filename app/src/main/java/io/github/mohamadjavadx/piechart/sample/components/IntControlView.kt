package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import android.os.Bundle
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.SeekBar
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat.AccessibilityActionCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat.RangeInfoCompat
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.sp
import kotlin.math.roundToInt

/**
 * State shared by the controls that edit an integer between 0 and [maxValue]: the value, its
 * `"Label %d"` title and the change listener. Subclasses draw the control itself.
 *
 * To a screen reader it is a slider, whatever it looks like: it has a range, can be set to a
 * value and stepped up and down, and the left and right arrow keys step it.
 */
internal abstract class IntControlView(
    context: Context,
    attrs: AttributeSet?,
    defStyleAttr: Int,
) : View(context, attrs, defStyleAttr) {

    protected val labelPaint = boldTextPaint(Colors.colorText)
    protected val valuePaint = boldTextPaint(Colors.colorAccent)

    private var valueChangeListener: ((Int) -> Unit)? = null

    init {
        isFocusable = true
    }

    private var leftText = ""
    private var rightText = ""
    private var valueText = "0"

    /** The value as plain text, cached for subclasses that draw it themselves. */
    protected var valueString = "0"
        private set

    private var current = 0

    var value: Int
        get() = current
        set(newValue) {
            if (storeValue(newValue)) invalidate()
        }

    var maxValue: Int = 100
        set(newValue) {
            field = newValue.coerceAtLeast(0)
            storeValue(current) // re-clamp against the new range
            invalidate()
        }

    /** Keeps [newValue] within 0..[maxValue] as the value; returns whether the value changed. Does not redraw. */
    private fun storeValue(newValue: Int): Boolean {
        val clamped = newValue.coerceIn(0, maxValue)
        if (current == clamped) return false
        current = clamped
        refreshValueText()
        return true
    }

    /** [format] holds one `%d` for the current value, e.g. `"Gap %d°"`; `%%` is a literal `%`. */
    fun setLabelFormat(format: String) {
        leftText = format.substringBefore("%d").replace("%%", "%")
        rightText = format.substringAfter("%d", "").replace("%%", "%")
        contentDescription = leftText.trim()
        refreshValueText()
        invalidate()
    }

    /** True while a change comes from a button that is held down and repeats, not from a single press. */
    var isRepeating: Boolean = false
        protected set

    fun setOnValueChangeListener(listener: (Int) -> Unit) {
        valueChangeListener = listener
    }

    /** For changes made by the user: sets the value and notifies the listener if it changed. */
    protected fun commitUserValue(newValue: Int) {
        val previous = value
        value = newValue
        if (value != previous) valueChangeListener?.invoke(value)
    }

    /** Draws the label followed by the value, ellipsizing the label to [maxLabelWidth]. */
    protected fun drawTitle(canvas: Canvas, x: Float, baseline: Float, maxLabelWidth: Float = Float.MAX_VALUE) {
        val label = TextUtils.ellipsize(leftText, labelPaint, maxLabelWidth, TextUtils.TruncateAt.END).toString()
        canvas.drawText(label, x, baseline, labelPaint)
        canvas.drawText(valueText, x + labelPaint.measureText(label), baseline, valuePaint)
    }

    private fun refreshValueText() {
        valueString = value.toString()
        valueText = valueString + rightText
        ViewCompat.setStateDescription(this, valueText)
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

    private fun boldTextPaint(color: Int) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        textSize = 14.sp
        typeface = Typeface.DEFAULT_BOLD
    }
}
