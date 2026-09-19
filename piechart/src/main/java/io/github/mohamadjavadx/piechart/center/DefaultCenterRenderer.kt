package io.github.mohamadjavadx.piechart.center

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import io.github.mohamadjavadx.piechart.SelectedSlice
import io.github.mohamadjavadx.piechart.utils.dp
import io.github.mohamadjavadx.piechart.utils.sp
import java.math.BigDecimal

/** What [DefaultCenterRenderer] draws: a small label above a large value, with an optional suffix after it. */
public class CenterInfo(
    public val label: CharSequence?,
    public val value: CharSequence,
    public val suffix: CharSequence? = null,
)

/**
 * Look of [DefaultCenterRenderer]. The text sizes are the ones used when the hole is roomy.
 * In a smaller hole the value and the suffix are scaled down together, never so far that the
 * value drops below [minTextSizeSp]; when it still does not fit, the center is not shown.
 * The label does not decide any of that: it follows the scale but keeps at least
 * [minTextSizeSp], and is ellipsized when it is too wide.
 */
public data class CenterInfoStyle(
    val labelColor: Int = 0xFF8A93A6.toInt(),
    val valueColor: Int = 0xFF1F2633.toInt(),
    val suffixColor: Int = valueColor,
    val labelTypeface: Typeface = Typeface.DEFAULT,
    val valueTypeface: Typeface = Typeface.DEFAULT_BOLD,
    val suffixTypeface: Typeface = Typeface.DEFAULT_BOLD,
    val labelTextSizeSp: Float = 14f,
    val valueTextSizeSp: Float = 32f,
    val suffixTextSizeSp: Float = 16f,
    /** Space between the label and the value, and between the value and a suffix on its own line. */
    val lineGapDp: Float = 6f,
    /** The smallest size the value may be scaled down to, and the smallest the label may reach. */
    val minTextSizeSp: Float = 11f,
    /**
     * When the suffix, scaled together with the value, would be smaller than this, it moves to
     * its own line under the value and keeps at least this size.
     */
    val minInlineSuffixSizeSp: Float = 8f,
)

/**
 * Draws the selected slice's label and value in the hole, centered:
 *
 * ```
 *     Tech
 *   50/100
 * ```
 *
 * By default the label is the slice's label, the value is its value and the suffix is
 * `/total`. Pass a [formatter] for anything else (percentages, currency, other wording);
 * return null to draw nothing for a slice.
 *
 * The suffix follows the value on the same line. Once the text has to shrink so far that the
 * suffix would be smaller than [CenterInfoStyle.minInlineSuffixSizeSp], the suffix moves to
 * its own line under the value, which also lets the value stay larger.
 *
 * Whether the center is shown is decided from every slice in the data set, each at its smallest
 * allowed size ([CenterInfoStyle.minTextSizeSp] for the value), so it does not come and go as
 * the selection moves. The size of the text is then worked out for the selected slice alone:
 * a short value is not shrunk because another slice has a long one, so the text may be a little
 * larger on some slices than on others. Labels are not measured for any of this: they follow
 * the scale but never drop below the minimum, and are ellipsized to fit.
 */
public class DefaultCenterRenderer @JvmOverloads constructor(
    private val style: CenterInfoStyle = CenterInfoStyle(),
    private val formatter: (SelectedSlice) -> CenterInfo? = ::defaultInfo,
) : CenterRenderer {

    private val labelPaint = textPaint(style.labelColor, style.labelTypeface).apply {
        textAlign = Paint.Align.CENTER
    }
    private val valuePaint = textPaint(style.valueColor, style.valueTypeface)
    private val suffixPaint = textPaint(style.suffixColor, style.suffixTypeface)

    // Sizes when the hole is roomy, in pixels.
    private val labelSize get() = style.labelTextSizeSp.sp
    private val valueSize get() = style.valueTextSizeSp.sp
    private val suffixSize get() = style.suffixTextSizeSp.sp
    private val gap get() = style.lineGapDp.dp
    private val minTextSizePx get() = style.minTextSizeSp.sp
    private val minInlineSuffixPx get() = style.minInlineSuffixSizeSp.sp

    // Whether every slice fits at its smallest size, for one (slices, area) pair.
    private var referenceSlices: List<SelectedSlice>? = null
    private var referenceArea: CenterArea? = null
    private var fitsAtMinimum = false
    private var minScale = 1f

    // The text and positions of one slice, so that drawing a frame does no work.
    private var laidOutSlice: SelectedSlice? = null
    private var laidOutArea: CenterArea? = null
    private var hasContent = false
    private var label: CharSequence? = null
    private var value: CharSequence = ""
    private var suffix: CharSequence? = null
    private var labelBaseline = 0f
    private var valueBaseline = 0f
    private var suffixBaseline = 0f
    private var valueX = 0f
    private var suffixX = 0f

    /** How one slice is drawn: the scale of the value line, and whether the suffix has its own line. */
    private class Fit(val scale: Float, val isSuffixOnOwnLine: Boolean)

    override fun fits(area: CenterArea, slices: List<SelectedSlice>): Boolean {
        prepare(area, slices)
        return fitsAtMinimum
    }

    override fun draw(canvas: Canvas, area: CenterArea, slice: SelectedSlice, slices: List<SelectedSlice>) {
        prepare(area, slices)
        if (laidOutSlice !== slice || laidOutArea !== area) layout(area, slice)
        if (!hasContent) return

        label?.let { canvas.drawText(it, 0, it.length, area.cx, labelBaseline, labelPaint) }
        canvas.drawText(value, 0, value.length, valueX, valueBaseline, valuePaint)
        suffix?.let { canvas.drawText(it, 0, it.length, suffixX, suffixBaseline, suffixPaint) }
    }

    /** Works out, once per data set and hole, whether every slice fits at its smallest size. */
    private fun prepare(area: CenterArea, slices: List<SelectedSlice>) {
        if (referenceSlices === slices && referenceArea === area) return
        referenceSlices = slices
        referenceArea = area
        laidOutSlice = null
        minScale = (minTextSizePx / valueSize).coerceIn(0.01f, 1f) // the suffix scales with the value
        fitsAtMinimum = false
        if (area.isEmpty) return

        var count = 0
        for (slice in slices) {
            val info = formatter(slice) ?: continue
            if (fitFor(area, info) == null) return
            count++
        }
        fitsAtMinimum = count > 0
    }

    /**
     * The largest scale at which [info] fits in [area], or null if it does not fit even at the
     * smallest size. The suffix stays on the value's line for as long as it would not be smaller
     * than [CenterInfoStyle.minInlineSuffixSizeSp]; after that it goes on the next line.
     */
    private fun fitFor(area: CenterArea, info: CenterInfo): Fit? {
        setPaintSizes(1f)
        val valueWidth = valuePaint.measureText(info.value, 0, info.value.length)
        val suffixWidth = info.suffix?.let { suffixPaint.measureText(it, 0, it.length) } ?: 0f
        val hasLabel = !info.label.isNullOrEmpty()
        val hasSuffix = suffixWidth > 0f

        val smallestInline = if (hasSuffix) maxOf(minScale, minInlineSuffixPx / suffixSize) else minScale
        if (smallestInline <= 1f) {
            val scale = largestScale(smallestInline) { scale ->
                area.widthFor(inlineHeight(hasLabel, scale)) * FILL >= (valueWidth + suffixWidth) * scale
            }
            if (scale != null) return Fit(scale, isSuffixOnOwnLine = false)
        }
        if (!hasSuffix) return null

        val scale = largestScale(minScale) { scale ->
            val widest = maxOf(valueWidth * scale, suffixWidth * stackedSuffixSize(scale) / suffixSize)
            area.widthFor(stackedHeight(hasLabel, scale)) * FILL >= widest
        } ?: return null
        return Fit(scale, isSuffixOnOwnLine = true)
    }

    /**
     * The largest scale from [low] up to 1 for which [fits] is true, or null. The text gets
     * bigger with the scale while the hole's chord gets shorter, so everything up to some
     * scale fits.
     */
    private inline fun largestScale(low: Float, fits: (Float) -> Boolean): Float? {
        if (fits(1f)) return 1f
        if (!fits(low)) return null
        var lo = low
        var hi = 1f
        repeat(SEARCH_STEPS) {
            val mid = (lo + hi) / 2f
            if (fits(mid)) lo = mid else hi = mid
        }
        return lo
    }

    private fun layout(area: CenterArea, slice: SelectedSlice) {
        laidOutSlice = slice
        laidOutArea = area
        val info = formatter(slice)
        hasContent = info != null && !area.isEmpty
        if (info == null || area.isEmpty) return

        val hasLabel = !info.label.isNullOrEmpty()
        // Sized for this slice alone. Shown at the smallest size when it still does not fit
        // (only possible with CenterVisibility.Always).
        val fit = fitFor(area, info) ?: Fit(minScale, isSuffixOnOwnLine = true)
        val scale = fit.scale
        val onOwnLine = fit.isSuffixOnOwnLine
        val suffixPx = if (onOwnLine) stackedSuffixSize(scale) else suffixSize * scale
        labelPaint.textSize = labelSizeAt(scale)
        valuePaint.textSize = valueSize * scale
        suffixPaint.textSize = suffixPx

        val height = if (onOwnLine) stackedHeight(hasLabel, scale) else inlineHeight(hasLabel, scale)
        val available = area.widthFor(height) * FILL
        label = if (hasLabel) TextUtils.ellipsize(info.label, labelPaint, available, TextUtils.TruncateAt.END) else null
        value = info.value
        suffix = info.suffix?.takeIf { it.isNotEmpty() }

        val valueWidth = valuePaint.measureText(value, 0, value.length)
        val suffixWidth = suffix?.let { suffixPaint.measureText(it, 0, it.length) } ?: 0f
        if (onOwnLine) {
            valueX = area.cx - valueWidth / 2f
            suffixX = area.cx - suffixWidth / 2f
        } else {
            valueX = area.cx - (valueWidth + suffixWidth) / 2f
            suffixX = valueX + valueWidth
        }

        // Stack the label, the value and, on its own line, the suffix; center the block on the hole.
        val blockTop = area.cy - height / 2f
        val labelHeight = if (hasLabel) labelSizeAt(scale) * CAP_HEIGHT else 0f
        labelBaseline = blockTop + labelHeight
        valueBaseline = blockTop + labelHeight + (if (hasLabel) gap * scale else 0f) + valueSize * scale * CAP_HEIGHT
        suffixBaseline = if (onOwnLine) valueBaseline + gap * scale + suffixPx * CAP_HEIGHT else valueBaseline
    }

    private fun setPaintSizes(scale: Float) {
        labelPaint.textSize = labelSizeAt(scale)
        valuePaint.textSize = valueSize * scale
        suffixPaint.textSize = suffixSize * scale
    }

    /** The label follows the scale, but keeps at least the minimum size and never grows past its own size. */
    private fun labelSizeAt(scale: Float) = minOf(labelSize, maxOf(minTextSizePx, labelSize * scale))

    /** A suffix on its own line follows the scale but keeps at least the inline minimum. */
    private fun stackedSuffixSize(scale: Float) = minOf(suffixSize, maxOf(minInlineSuffixPx, suffixSize * scale))

    /** Height of the label and the value, with the suffix on the value's line. */
    private fun inlineHeight(hasLabel: Boolean, scale: Float) =
        valueSize * scale * CAP_HEIGHT + if (hasLabel) labelSizeAt(scale) * CAP_HEIGHT + gap * scale else 0f

    /** Height of the label, the value and the suffix on the line below it. */
    private fun stackedHeight(hasLabel: Boolean, scale: Float) =
        inlineHeight(hasLabel, scale) + gap * scale + stackedSuffixSize(scale) * CAP_HEIGHT

    private companion object {
        /** Cap height as a share of the text size, for a typical sans-serif face. */
        const val CAP_HEIGHT = 0.72f

        /** How much of the width of the hole's chord the text may use. */
        const val FILL = 0.9f

        const val SEARCH_STEPS = 12
    }
}

private fun textPaint(color: Int, typeface: Typeface) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = color
    this.typeface = typeface
}

private fun defaultInfo(slice: SelectedSlice) = CenterInfo(
    label = slice.data.label.ifEmpty { null },
    value = slice.data.value.toShortString(),
    suffix = "/" + slice.total.toShortString(),
)

private fun BigDecimal.toShortString(): String =
    if (signum() == 0) "0" else stripTrailingZeros().toPlainString()
