package io.github.mohamadjavadx.piechart.sample.components

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.util.AttributeSet
import android.widget.Switch
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.DecelerateInterpolator
import androidx.core.graphics.ColorUtils
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import io.github.mohamadjavadx.piechart.sample.utils.sp

/** A label, the current state's text ("Off" / "On") and a toggle. */
internal class SwitchView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorText
        textSize = 14.sp
        typeface = Typeface.DEFAULT_BOLD
    }
    private val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorAccent
        textSize = 14.sp
        typeface = Typeface.DEFAULT_BOLD
    }
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Colors.colorBackground
        style = Paint.Style.FILL
    }

    private var checkedChangeListener: ((Boolean) -> Unit)? = null

    private var checked = false

    /** Setting this from code moves the thumb at once; only a tap animates it. */
    var isChecked: Boolean
        get() = checked
        set(value) = setChecked(value, animate = false)

    var labelText: String = ""
        set(value) {
            field = value
            contentDescription = value
            invalidate()
        }

    /** The texts for the off and on state, in that order. */
    var valueText: List<String> = listOf("Off", "On")
        set(value) {
            field = value
            updateStateDescription()
            invalidate()
        }

    fun setOnCheckedChangeListener(listener: (Boolean) -> Unit) {
        checkedChangeListener = listener
    }

    private val trackWidth = 40.dpf
    private val trackHeight = 22.dpf
    private val thumbRadius = 9.dpf
    private val trackThumbPadding = 2.dpf
    private val trackRect = RectF()

    private var thumbProgress = 0f // 0 = off, 1 = on
    private val animator = ValueAnimator().apply {
        duration = 200
        interpolator = DecelerateInterpolator()
        addUpdateListener {
            thumbProgress = it.animatedValue as Float
            invalidate()
        }
    }

    init {
        isClickable = true
        isFocusable = true
        setPadding(16.dp, 9.dp, 16.dp, 9.dp)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desiredHeight = (paddingTop + trackHeight + paddingBottom).toInt()
        setMeasuredDimension(
            MeasureSpec.getSize(widthMeasureSpec),
            resolveSize(desiredHeight, heightMeasureSpec)
        )
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val centerY = height / 2f
        val textBaseline = centerY - (titlePaint.descent() + titlePaint.ascent()) / 2f
        canvas.drawText(labelText, paddingLeft.toFloat(), textBaseline, titlePaint)

        val stateText = valueText.getOrNull(if (checked) 1 else 0)
        if (!stateText.isNullOrEmpty()) {
            val valueX = paddingLeft + titlePaint.measureText(" ") + titlePaint.measureText(labelText)
            canvas.drawText(stateText, valueX, textBaseline, valuePaint)
        }

        val trackRight = width - paddingRight.toFloat()
        val trackLeft = trackRight - trackWidth
        trackRect.set(trackLeft, centerY - trackHeight / 2f, trackRight, centerY + trackHeight / 2f)
        trackPaint.color = ColorUtils.blendARGB(Colors.colorDivider, Colors.colorAccent, thumbProgress)
        canvas.drawRoundRect(trackRect, trackHeight / 2f, trackHeight / 2f, trackPaint)

        val thumbMinX = trackLeft + trackThumbPadding + thumbRadius
        val thumbMaxX = trackRight - trackThumbPadding - thumbRadius
        canvas.drawCircle(thumbMinX + (thumbMaxX - thumbMinX) * thumbProgress, centerY, thumbRadius, thumbPaint)
    }

    private fun setChecked(value: Boolean, animate: Boolean) {
        if (checked == value) return
        checked = value
        updateStateDescription()
        animator.cancel()
        val target = if (value) 1f else 0f
        if (animate) {
            animator.setFloatValues(thumbProgress, target)
            animator.start()
        } else {
            thumbProgress = target
            invalidate()
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> return true // claim the touch
            MotionEvent.ACTION_UP -> {
                performClick()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun updateStateDescription() {
        ViewCompat.setStateDescription(this, valueText.getOrNull(if (checked) 1 else 0))
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        AccessibilityNodeInfoCompat.wrap(info).apply {
            className = Switch::class.java.name
            isCheckable = true
            isChecked = this@SwitchView.checked
        }
    }

    override fun onDetachedFromWindow() {
        animator.cancel()
        super.onDetachedFromWindow()
    }

    /** A tap, the keyboard and a screen reader all end up here, so this is what flips the switch. */
    override fun performClick(): Boolean {
        setChecked(!checked, animate = true)
        checkedChangeListener?.invoke(checked)
        return super.performClick()
    }
}
