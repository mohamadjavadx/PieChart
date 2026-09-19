package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import android.util.AttributeSet
import android.view.View
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.sp

/**
 * State shared by the controls that edit an integer between 0 and [maxValue]: the value, its
 * `"Label %d"` title and the change listener. Subclasses draw the control itself.
 */
internal abstract class IntControlView(
    context: Context,
    attrs: AttributeSet?,
    defStyleAttr: Int,
) : View(context, attrs, defStyleAttr) {

    protected val labelPaint = boldTextPaint(Colors.colorText)
    protected val valuePaint = boldTextPaint(Colors.colorAccent)

    private var valueChangeListener: ((Int) -> Unit)? = null

    private var leftText = ""
    private var rightText = ""
    private var valueText = "0"

    /** The value as plain text, cached for subclasses that draw it themselves. */
    protected var valueString = "0"
        private set

    var value: Int = 0
        set(newValue) {
            val clamped = newValue.coerceIn(0, maxValue)
            if (field == clamped) return
            field = clamped
            refreshValueText()
            invalidate()
        }

    var maxValue: Int = 100
        set(newValue) {
            field = newValue
            value = value // re-clamp against the new range
            invalidate()
        }

    /** [format] holds one `%d` for the current value, e.g. `"Gap %d°"`; `%%` is a literal `%`. */
    fun setLabelFormat(format: String) {
        leftText = format.substringBefore("%d").replace("%%", "%")
        rightText = format.substringAfter("%d", "").replace("%%", "%")
        refreshValueText()
        invalidate()
    }

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
    }

    private fun boldTextPaint(color: Int) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        textSize = 14.sp
        typeface = Typeface.DEFAULT_BOLD
    }
}
