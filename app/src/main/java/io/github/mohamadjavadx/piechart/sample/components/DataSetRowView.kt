package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import io.github.mohamadjavadx.piechart.sample.R
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.sp

/**
 * One editable row of the data set: `[color bar + number] | label | value | "!"`.
 *
 * Only the two text fields are child views. The color bar, the row number, the warning mark
 * and the dividers are drawn by the row itself, which keeps the view tree small: rows are
 * built and recycled while scrolling and rebound on every keystroke.
 */
internal class DataSetRowView(context: Context) : ViewGroup(context) {

    val labelEt: EditText = createField().apply {
        hint = context.getString(R.string.hint_label)
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        imeOptions = EditorInfo.IME_ACTION_NEXT
    }

    val valueEt: EditText = createField().apply {
        hint = context.getString(R.string.hint_value)
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        imeOptions = EditorInfo.IME_ACTION_NEXT
    }

    /** The 1-based number shown at the start of the row. */
    var rowNumber: Int = 0
        set(value) {
            if (field == value) return
            field = value
            rowNumberText = value.toString()
            invalidate()
        }

    var barColor: Int = 0
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    /** Shows the warning mark at the end of the row; the column keeps its width when hidden. */
    var isValueInvalid: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    private var rowNumberText = ""
    private var numberColumnWidth = 0

    private val barPaint = Paint()
    private val dividerPaint = Paint().apply { color = Colors.colorStroke }
    private val numberPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorText
        textSize = 14.sp
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }
    private val warningPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorWarning
        textSize = 14.sp
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }

    init {
        setWillNotDraw(false)
        // Fixed-size layout params let a text change just invalidate the field; with wrap_content
        // every keystroke would request a layout pass of the whole list.
        addView(labelEt, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(valueEt, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = when (MeasureSpec.getMode(widthMeasureSpec)) {
            MeasureSpec.UNSPECIFIED -> FALLBACK_WIDTH
            else -> MeasureSpec.getSize(widthMeasureSpec)
        }
        val height = when (MeasureSpec.getMode(heightMeasureSpec)) {
            MeasureSpec.EXACTLY -> MeasureSpec.getSize(heightMeasureSpec)
            MeasureSpec.AT_MOST -> minOf(ROW_HEIGHT, MeasureSpec.getSize(heightMeasureSpec))
            else -> ROW_HEIGHT
        }
        setMeasuredDimension(width, height)

        val contentWidth = (width - paddingLeft - paddingRight - INDICATOR_WIDTH).coerceAtLeast(0)
        numberColumnWidth = (contentWidth * NUMBER_WEIGHT / TOTAL_WEIGHT).toInt()
        val labelWidth = (contentWidth * LABEL_WEIGHT / TOTAL_WEIGHT).toInt()
        val valueWidth = contentWidth - numberColumnWidth - labelWidth

        labelEt.measure(exactly(labelWidth), exactly(height))
        valueEt.measure(exactly(valueWidth), exactly(height))
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val top = paddingTop
        val bottom = measuredHeight - paddingBottom
        val labelLeft = paddingLeft + numberColumnWidth
        labelEt.layout(labelLeft, top, labelLeft + labelEt.measuredWidth, bottom)
        valueEt.layout(labelEt.right, top, labelEt.right + valueEt.measuredWidth, bottom)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val top = paddingTop.toFloat()
        val bottom = (height - paddingBottom).toFloat()
        val baseline = (top + bottom) / 2f - (numberPaint.descent() + numberPaint.ascent()) / 2f

        barPaint.color = barColor
        canvas.drawRect(paddingLeft.toFloat(), top, (paddingLeft + COLOR_BAR_WIDTH).toFloat(), bottom, barPaint)

        val numberCenterX = paddingLeft + COLOR_BAR_WIDTH + (numberColumnWidth - COLOR_BAR_WIDTH) / 2f
        canvas.drawText(rowNumberText, numberCenterX, baseline, numberPaint)

        if (isValueInvalid) {
            canvas.drawText(WARNING_MARK, valueEt.right + INDICATOR_WIDTH / 2f, baseline, warningPaint)
        }

        // Column dividers, and a line under the row.
        drawColumnDivider(canvas, labelEt.left, top, bottom)
        drawColumnDivider(canvas, valueEt.left, top, bottom)
        canvas.drawRect(0f, (height - DIVIDER_WIDTH).toFloat(), width.toFloat(), height.toFloat(), dividerPaint)
    }

    private fun drawColumnDivider(canvas: Canvas, left: Int, top: Float, bottom: Float) {
        canvas.drawRect(left.toFloat(), top, (left + DIVIDER_WIDTH).toFloat(), bottom, dividerPaint)
    }

    private fun createField() = EditText(context).apply {
        filters = arrayOf(InputFilter.LengthFilter(MAX_TEXT_LENGTH))
        // These are not form fields; autofill suggestions would only get in the way.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            importantForAutofill = IMPORTANT_FOR_AUTOFILL_NO
        }
        setTextColor(Colors.colorText)
        setHintTextColor(Colors.colorTextVariant)
        textSize = 14f
        background = null
        setPadding(8.dp, 0, 8.dp, 0)
        isSingleLine = true
        gravity = Gravity.CENTER_VERTICAL
    }

    private fun exactly(size: Int) =
        MeasureSpec.makeMeasureSpec(size.coerceAtLeast(0), MeasureSpec.EXACTLY)

    companion object {
        val ROW_HEIGHT = 48.dp
        private val INDICATOR_WIDTH = 40.dp
        private val COLOR_BAR_WIDTH = 4.dp
        private val DIVIDER_WIDTH = 1.dp
        private val FALLBACK_WIDTH = 360.dp
        private const val NUMBER_WEIGHT = 48f
        private const val LABEL_WEIGHT = 126f
        private const val VALUE_WEIGHT = 186f
        private const val TOTAL_WEIGHT = NUMBER_WEIGHT + LABEL_WEIGHT + VALUE_WEIGHT
        private const val WARNING_MARK = "!"
        private const val MAX_TEXT_LENGTH = 12
    }
}