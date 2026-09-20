package io.github.mohamadjavadx.piechart.sample.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.TextPaint
import android.os.Bundle
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.TabWidget
import androidx.core.graphics.ColorUtils
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat.AccessibilityActionCompat
import io.github.mohamadjavadx.piechart.sample.R
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import io.github.mohamadjavadx.piechart.sample.utils.sp
import kotlin.math.ceil
import kotlin.math.min
import androidx.core.graphics.createBitmap
import androidx.core.graphics.withClip

/** A floating pill with one text segment per item, centred at the bottom of its (full-width) bounds. */
internal class SegmentedSelectorView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val bgGradientPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val selectorBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorBackground
        setShadowLayer(2.dpf, 0f, 2.dpf, Color.argb(38, 0, 0, 0))
    }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorStroke
        strokeWidth = 1.dpf
        style = Paint.Style.STROKE
    }
    private val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorDivider
        strokeWidth = 1.dpf
        strokeCap = Paint.Cap.ROUND
    }
    private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorRipple
        style = Paint.Style.FILL
    }
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = 14.sp
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
    }

    private val cornerRadius = 16.dpf
    val desiredViewHeight = 72.dp
    private val selectorTopPadding = 1.dp
    private val selectorBottomPadding = 24.dp
    private val dividerHeight = 16.dp
    private val horizontalContentPadding = 20.dp
    private val dividerGap = 33.dp // 16dp (right of text) + 1dp (divider) + 16dp (left of text)

    private val bgRect = RectF() // the pill
    private val bgPath = Path()

    // The pill with its shadow and outline, drawn once into a bitmap. Paint.setShadowLayer only
    // works on a software canvas before API 28, and a software layer on the whole view would
    // re-rasterise it on the CPU for every frame of a ripple.
    private var pillBitmap: Bitmap? = null
    private val shadowMargin = 6.dp // covers the 2dp blur plus the 2dp offset
    private var calculatedSelectorWidth = 0f
    private var gradientHeight = 0
    private var segmentCenters = FloatArray(0)
    private var dividerXs = FloatArray(0)

    var items: List<String> = emptyList()
        set(value) {
            field = value
            ripples = List(value.size) { RippleFade(this) }
            segmentCenters = FloatArray(value.size)
            dividerXs = FloatArray((value.size - 1).coerceAtLeast(0))
            if (selectedIndex >= value.size) selectedIndex = 0
            updateStateDescription()
            requestLayout()
            invalidate()
        }

    /** Setting this from code does not notify the selection listener; only a tap does. */
    var selectedIndex: Int = 0
        set(value) {
            if (value !in items.indices || field == value) return
            field = value
            updateStateDescription()
            invalidate()
        }

    private var selectionChangeListener: ((Int) -> Unit)? = null

    fun setOnSelectionChangeListener(listener: (Int) -> Unit) {
        selectionChangeListener = listener
    }

    private var ripples: List<RippleFade> = emptyList()
    private var pressedIndex = -1

    init {
        isFocusable = true
        contentDescription = context.getString(R.string.tab_selector_description)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val textWidth = items.sumOf { textPaint.measureText(it).toDouble() }.toFloat()
        val dividersWidth = dividerGap * (items.size - 1).coerceAtLeast(0)
        calculatedSelectorWidth = horizontalContentPadding * 2f + textWidth + dividersWidth

        setMeasuredDimension(
            resolveSize(calculatedSelectorWidth.toInt(), widthMeasureSpec),
            resolveSize(desiredViewHeight, heightMeasureSpec)
        )
    }

    // Laid out here rather than in onSizeChanged so that changing the items re-lays out too.
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        val w = right - left
        val h = bottom - top

        // Transparent at the top, the background color at the bottom; only the height matters.
        if (bgGradientPaint.shader == null || gradientHeight != h) {
            gradientHeight = h
            bgGradientPaint.shader = LinearGradient(
                0f, 0f, 0f, h.toFloat(),
                ColorUtils.setAlphaComponent(Colors.colorBackground, 0),
                Colors.colorBackground,
                Shader.TileMode.CLAMP
            )
        }

        val selectorWidth = min(calculatedSelectorWidth, w.toFloat())
        val selectorLeft = (w - selectorWidth) / 2f
        bgRect.set(selectorLeft, selectorTopPadding.toFloat(), selectorLeft + selectorWidth, h - selectorBottomPadding.toFloat())
        bgPath.reset()
        bgPath.addRoundRect(bgRect, cornerRadius, cornerRadius, Path.Direction.CW)
        updatePillBitmap()

        if (items.size == 1) {
            segmentCenters[0] = bgRect.centerX()
            return
        }

        var currentX = bgRect.left + horizontalContentPadding
        for (i in items.indices) {
            val textWidth = textPaint.measureText(items[i])
            segmentCenters[i] = currentX + textWidth / 2f
            currentX += textWidth
            if (i < items.size - 1) {
                dividerXs[i] = currentX + dividerGap / 2f
                currentX += dividerGap
            }
        }
    }

    private fun updatePillBitmap() {
        val width = ceil(bgRect.width()).toInt() + 2 * shadowMargin
        val height = ceil(bgRect.height()).toInt() + 2 * shadowMargin
        if (bgRect.isEmpty) {
            pillBitmap = null
            return
        }
        if (pillBitmap?.width == width && pillBitmap?.height == height) return

        val bitmap = createBitmap(width, height)
        val pill = RectF(
            shadowMargin.toFloat(), shadowMargin.toFloat(),
            shadowMargin + bgRect.width(), shadowMargin + bgRect.height()
        )
        Canvas(bitmap).apply {
            drawRoundRect(pill, cornerRadius, cornerRadius, selectorBgPaint)
            drawRoundRect(pill, cornerRadius, cornerRadius, strokePaint)
        }
        pillBitmap = bitmap
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), bgGradientPaint)
        if (items.isEmpty()) return

        pillBitmap?.let { canvas.drawBitmap(it, bgRect.left - shadowMargin, bgRect.top - shadowMargin, null) }

        // Ripples, clipped to the pill.
        canvas.withClip(bgPath) {
            for (i in items.indices) {
                val alpha = if (i == pressedIndex) RippleFade.PRESSED_ALPHA else ripples[i].alpha
                if (alpha > 0) {
                    ripplePaint.alpha = alpha
                    drawRect(
                        segmentLeft(i),
                        bgRect.top,
                        segmentRight(i),
                        bgRect.bottom,
                        ripplePaint
                    )
                }
            }
        }

        val dividerTop = bgRect.centerY() - dividerHeight / 2f
        val dividerBottom = bgRect.centerY() + dividerHeight / 2f
        for (x in dividerXs) canvas.drawLine(x, dividerTop, x, dividerBottom, dividerPaint)

        val textBaseline = bgRect.centerY() - (textPaint.descent() + textPaint.ascent()) / 2f
        for (i in items.indices) {
            textPaint.color = if (i == selectedIndex) Colors.colorAccent else Colors.colorTextVariant
            canvas.drawText(items[i], segmentCenters[i], textBaseline, textPaint)
        }
    }

    private fun segmentLeft(index: Int) = if (index == 0) bgRect.left else dividerXs[index - 1]

    private fun segmentRight(index: Int) = if (index == items.size - 1) bgRect.right else dividerXs[index]

    private fun indexAt(x: Float, y: Float): Int {
        if (y !in bgRect.top..bgRect.bottom) return -1
        return items.indices.firstOrNull { x in segmentLeft(it)..segmentRight(it) } ?: -1
    }

    /**
     * Where the selector takes a touch: the pill and the empty strip under it. Everywhere else
     * in the view (beside the pill, above it) the touch goes on to the list underneath.
     */
    private fun isTouchTarget(x: Float, y: Float) = x in bgRect.left..bgRect.right && y >= bgRect.top

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                // Not consumed: the parent offers the touch to the views behind this one.
                if (!isTouchTarget(event.x, event.y)) return false
                pressedIndex = indexAt(event.x, event.y)
                if (pressedIndex != -1) {
                    ripples[pressedIndex].reset()
                    invalidate()
                }
                return true
            }

            MotionEvent.ACTION_UP -> {
                val pressed = pressedIndex
                pressedIndex = -1
                if (pressed != -1) {
                    ripples[pressed].fadeOut()
                    if (indexAt(event.x, event.y) == pressed) {
                        selectByUser(pressed)
                        performClick()
                    }
                }
                return true
            }

            MotionEvent.ACTION_CANCEL -> {
                if (pressedIndex != -1) ripples[pressedIndex].fadeOut()
                pressedIndex = -1
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    /** A change the user asked for, by touch, by key or through a screen reader: it is reported too. */
    private fun selectByUser(index: Int) {
        if (index !in items.indices || index == selectedIndex) return
        selectedIndex = index
        selectionChangeListener?.invoke(index)
    }

    private fun updateStateDescription() {
        ViewCompat.setStateDescription(this, items.getOrNull(selectedIndex))
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> selectByUser(selectedIndex - 1)
            KeyEvent.KEYCODE_DPAD_RIGHT -> selectByUser(selectedIndex + 1)
            else -> return super.onKeyDown(keyCode, event)
        }
        return true
    }

    // Read as one control that has the tab that is showing as its state, and that steps between tabs.
    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        AccessibilityNodeInfoCompat.wrap(info).apply {
            className = TabWidget::class.java.name
            if (selectedIndex < items.lastIndex) addAction(AccessibilityActionCompat.ACTION_SCROLL_FORWARD)
            if (selectedIndex > 0) addAction(AccessibilityActionCompat.ACTION_SCROLL_BACKWARD)
        }
    }

    override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean {
        when (action) {
            AccessibilityNodeInfoCompat.ACTION_SCROLL_FORWARD -> selectByUser(selectedIndex + 1)
            AccessibilityNodeInfoCompat.ACTION_SCROLL_BACKWARD -> selectByUser(selectedIndex - 1)
            else -> return super.performAccessibilityAction(action, arguments)
        }
        return true
    }

    override fun onDetachedFromWindow() {
        ripples.forEach { it.reset() }
        super.onDetachedFromWindow()
    }

    // Keep lint/accessibility happy since we handle clicks manually.
    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}
