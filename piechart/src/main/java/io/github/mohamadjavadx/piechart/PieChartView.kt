package io.github.mohamadjavadx.piechart

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.TimeInterpolator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.PathInterpolator
import androidx.annotation.MainThread
import io.github.mohamadjavadx.piechart.center.CenterArea
import io.github.mohamadjavadx.piechart.center.CenterPresenter
import io.github.mohamadjavadx.piechart.center.CenterRenderer
import io.github.mohamadjavadx.piechart.center.CenterVisibility
import io.github.mohamadjavadx.piechart.geometry.EXPANDED_BAND_SWEEP_DEG
import io.github.mohamadjavadx.piechart.geometry.MAX_DEG
import io.github.mohamadjavadx.piechart.geometry.Grouping
import io.github.mohamadjavadx.piechart.geometry.Morph
import io.github.mohamadjavadx.piechart.geometry.RingPathBuilder
import io.github.mohamadjavadx.piechart.geometry.groupSlices
import io.github.mohamadjavadx.piechart.geometry.computeCornerRadii
import io.github.mohamadjavadx.piechart.geometry.computeGapDeg
import io.github.mohamadjavadx.piechart.geometry.computeInnerGapDeg
import io.github.mohamadjavadx.piechart.geometry.computeTargetSweeps
import io.github.mohamadjavadx.piechart.geometry.degreesOfArc
import io.github.mohamadjavadx.piechart.geometry.planMorph
import io.github.mohamadjavadx.piechart.geometry.ratioOfPx
import io.github.mohamadjavadx.piechart.geometry.sliceIndexAt
import io.github.mohamadjavadx.piechart.geometry.sliceKey
import io.github.mohamadjavadx.piechart.utils.dp
import java.math.BigDecimal
import java.math.MathContext

/**
 * A customizable Pie / Donut chart view.
 *
 * - Supports an animated entry sweep.
 * - Animates data changes: new slices grow into place while existing slices
 *   shrink to make room, and removed slices shrink to nothing.
 * - Supports a center hole (donut) controlled by [holeRadiusRatio].
 * - Supports rounded slice corners controlled by [cornerRadiusRatio].
 * - The corner radius, the shadow offset and the gap between slices can each be given in dp
 *   instead of as a ratio (in degrees for the gap), independently of each other: see [setStyle].
 * - Can group the slices that would be too small to see into one, and expand that group into a
 *   ring of its own when it is tapped: see [groupSmallSlices].
 * - Supports [ensureRenderableSlices] (on by default) to guarantee slices are large enough to render
 *   rounded corners.
 * - Supports [roundInnerCorners] to toggle between rounded or sharp inner corners.
 * - Supports tap selection of slices with a callback; the selected slice gets a soft shadow:
 *   a faded copy of the slice behind it, shifted toward the hole ([selectedShadowAlpha]).
 * - Can show information about the selected slice in the hole, drawn by a [CenterRenderer]
 *   (see [centerRenderer] and [CenterVisibility]).
 *
 * The view is always square, and the chart is the largest circle that fits inside it.
 *
 * Visual padding is provided by the standard View padding API
 * (`setPadding(...)` or `setPaddingRelative(...)`).
 */
public class PieChartView(context: Context) : View(context) {

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop

    // ------------------------------------------------------------------
    //  Public configuration
    // ------------------------------------------------------------------
    /**
     * Applies all visual style configurations at once.
     * This avoids multiple invalidation cycles when changing several properties.
     *
     * The corner radius, the shadow offset and the gap can each be given in one of two units, and
     * each on its own, so the corners can be in dp while the shadow is a ratio:
     *  - the corner radius as a ratio ([cornerRadiusRatio]) or in dp ([cornerRadiusDp]);
     *  - the shadow offset as a ratio ([selectedShadowOffsetRatio]) or in dp ([selectedShadowOffsetDp]);
     *  - the gap in degrees ([visualGapDeg]) or in dp ([visualGapDp]), measured along the chart's
     *    outer edge.
     *
     * A setting that is not given (null) stays as it is, in the unit it has. Giving both units of
     * one setting is an error. A number that is not finite (NaN or infinity) counts as not given.
     * A size in dp stays that size when the chart is resized; the chart
     * draws with ratios and degrees, so it works them out from the dp at the chart's size, every
     * time the chart is laid out, and the ratio and degree properties hold the result. The limits
     * are those of the ratios.
     *
     * [groupSmallSlices] turns on the grouping of small slices, [otherSliceColor] is the color of the
     * slice that stands for them, and [mainSliceDim] (0..1) is how much the big slices are dimmed
     * while the group is expanded.
     */
    @MainThread
    public fun setStyle(
        visualGapDeg: Float? = null,
        visualGapDp: Float? = null,
        startAngleDeg: Float = this.startAngleDeg,
        selectedAlpha: Int = this.selectedAlpha,
        unselectedAlpha: Int = this.unselectedAlpha,
        selectedShadowAlpha: Int = this.selectedShadowAlpha,
        selectedShadowOffsetRatio: Float? = null,
        selectedShadowOffsetDp: Float? = null,
        holeRadiusRatio: Float = this.holeRadiusRatio,
        cornerRadiusRatio: Float? = null,
        cornerRadiusDp: Float? = null,
        ensureRenderableSlices: Boolean = this.ensureRenderableSlices,
        roundInnerCorners: Boolean = this.roundInnerCorners,
        disabledColor: Int = this.disabledColor,
        groupSmallSlices: Boolean = this.groupSmallSlices,
        otherSliceColor: Int = this.otherSliceColor,
        mainSliceDim: Float = this.mainSliceDim,
    ) {
        require(visualGapDeg == null || visualGapDp == null) { "Give the gap in degrees or in dp, not both." }
        require(selectedShadowOffsetRatio == null || selectedShadowOffsetDp == null) {
            "Give the shadow offset as a ratio or in dp, not both."
        }
        require(cornerRadiusRatio == null || cornerRadiusDp == null) {
            "Give the corner radius as a ratio or in dp, not both."
        }

        // A unit that is given replaces the one the setting had.
        visualGapDeg.finiteOrNull()?.let {
            this.visualGapDeg = it.coerceIn(0f, MAX_DEG)
            this.visualGapDp = null
        }
        visualGapDp.finiteOrNull()?.let { this.visualGapDp = it.coerceAtLeast(0f) }
        selectedShadowOffsetRatio.finiteOrNull()?.let {
            this.selectedShadowOffsetRatio = it.coerceIn(0f, 1f)
            this.selectedShadowOffsetDp = null
        }
        selectedShadowOffsetDp.finiteOrNull()?.let { this.selectedShadowOffsetDp = it.coerceAtLeast(0f) }
        cornerRadiusRatio.finiteOrNull()?.let {
            this.cornerRadiusRatio = it.coerceIn(0f, 1f)
            this.cornerRadiusDp = null
        }
        cornerRadiusDp.finiteOrNull()?.let { this.cornerRadiusDp = it.coerceAtLeast(0f) }

        startAngleDeg.finiteOrNull()?.let { this.startAngleDeg = it }
        holeRadiusRatio.finiteOrNull()?.let { this.holeRadiusRatio = it.coerceIn(0f, 1f) }
        this.selectedAlpha = selectedAlpha.coerceIn(0, 255)
        this.unselectedAlpha = unselectedAlpha.coerceIn(0, 255)
        this.selectedShadowAlpha = selectedShadowAlpha.coerceIn(0, 255)
        this.ensureRenderableSlices = ensureRenderableSlices
        this.roundInnerCorners = roundInnerCorners
        this.disabledColor = disabledColor
        this.groupSmallSlices = groupSmallSlices
        this.otherSliceColor = otherSliceColor
        mainSliceDim.finiteOrNull()?.let { this.mainSliceDim = it.coerceIn(0f, 1f) }

        relayout()
    }

    /** New bounds, the slices to show for them, and the final layout. */
    private fun relayout() {
        calculateBounds(width, height)
        syncGroups()
        snapToFinalState()
    }

    /** The number when it is finite, else null: NaN and infinity are treated as "not given". */
    private fun Float?.finiteOrNull(): Float? = this?.takeIf { it.isFinite() }

    /**
     * Applies all animation configurations at once.
     * Note: Changes only apply to the *next* animation.
     */
    @MainThread
    public fun setAnimationConfig(
        revealAnimationDuration: Long = this.revealAnimationDuration,
        revealAnimationInterpolator: TimeInterpolator = this.revealAnimationInterpolator,
        dataChangeAnimationDuration: Long = this.dataChangeAnimationDuration,
        dataChangeAnimationInterpolator: TimeInterpolator = this.dataChangeAnimationInterpolator
    ) {
        this.revealAnimationDuration = revealAnimationDuration.coerceAtLeast(0L)
        this.revealAnimationInterpolator = revealAnimationInterpolator
        this.dataChangeAnimationDuration = dataChangeAnimationDuration.coerceAtLeast(0L)
        this.dataChangeAnimationInterpolator = dataChangeAnimationInterpolator
    }

    /**
     * Angular gap (in degrees) between adjacent slices. When the gap was given in dp, this is what
     * that size is worth on the chart's outer edge, at the chart's current size.
     */
    public var visualGapDeg: Float = DEFAULT_VISUAL_GAP_DEG
        private set

    /** The gap in dp when it was given in dp, and null when it was given in degrees. */
    public var visualGapDp: Float? = null
        private set

    /** Start angle (in degrees) for the first slice. -90 means 12 o'clock. */
    public var startAngleDeg: Float = DEFAULT_START_ANGLE_DEG
        private set

    /** Alpha used for the selected slice, and for every slice while nothing is selected (0..255). */
    public var selectedAlpha: Int = DEFAULT_SELECTED_ALPHA
        private set

    /** Alpha used for the slices that are not selected, while another slice is (0..255). */
    public var unselectedAlpha: Int = DEFAULT_UNSELECTED_ALPHA
        private set

    /**
     * Alpha (0..255) of the selected slice's shadow: the slice's own shape and color drawn behind
     * it, shifted toward the hole so that a small part of it shows. 0 turns the shadow off. The
     * default is 20%.
     */
    public var selectedShadowAlpha: Int = DEFAULT_SELECTED_SHADOW_ALPHA
        private set

    /**
     * How far the shadow is shifted toward the hole, as a ratio of the hole's radius. That is also
     * how thick the visible part of it is. It never exceeds half the donut's thickness, so on a thin
     * donut a larger ratio makes no difference. When it was given in dp, this is what that size is
     * worth at the chart's current size.
     */
    public var selectedShadowOffsetRatio: Float = DEFAULT_SELECTED_SHADOW_OFFSET_RATIO
        private set

    /** The shadow offset in dp when it was given in dp, and null when it was given as a ratio. */
    public var selectedShadowOffsetDp: Float? = null
        private set

    /** Size of the center hole as a ratio of the chart radius. */
    public var holeRadiusRatio: Float = DEFAULT_HOLE_RADIUS_RATIO
        private set

    /**
     * Radius of slice rounded corners, as a ratio of half the donut's thickness. When they were
     * given in dp, this is what that size is worth at the chart's current size.
     */
    public var cornerRadiusRatio: Float = DEFAULT_CORNER_RADIUS_RATIO
        private set

    /** The corner radius in dp when it was given in dp, and null when it was given as a ratio. */
    public var cornerRadiusDp: Float? = null
        private set

    /**
     * If true (the default), the chart applies a minimum visible sweep angle internally: a slice is
     * never drawn smaller than the gap plus 1°, and the larger slices give up the difference.
     */
    public var ensureRenderableSlices: Boolean = DEFAULT_ENSURE_RENDERABLE_SLICES
        private set

    /** Controls whether the inner corners of the donut slices are rounded. */
    public var roundInnerCorners: Boolean = DEFAULT_ROUND_INNER_CORNERS
        private set

    /**
     * Whether the slices that would be too small to see are grouped into one. A slice is too small
     * when less than 2° of it would remain once the gap is cut out of it (its angle is under the gap
     * plus 2°). The group is one slice, in [otherSliceColor], of which at least 10° is seen once the
     * gap is cut out of it (so it is given the gap plus 10°), so it can be seen and tapped; the big
     * slices give up the difference. A tap on it expands it: see
     * [isGroupExpanded]. Nothing is grouped unless at least two slices are small and one is not.
     * [setSelectedIndex] does not select the slice of the group, and neither does a tap: a tap on it
     * expands the group and selects the first of the small slices. Off by default.
     */
    public var groupSmallSlices: Boolean = DEFAULT_GROUP_SMALL_SLICES
        private set

    /** Color of the slice that stands for the grouped small slices. */
    public var otherSliceColor: Int = DEFAULT_OTHER_SLICE_COLOR
        private set

    /**
     * How much the big slices are dimmed while the group is expanded, 0..1: they are drawn in their
     * own colors at (1 - this) of their opacity, so it suits any background. See [isGroupExpanded].
     */
    public var mainSliceDim: Float = DEFAULT_MAIN_SLICE_DIM
        private set

    /**
     * True while the grouped small slices are expanded: the big slices are then squeezed into an
     * arc 90° wide, drawn dimmed by [mainSliceDim] inside one rounded slice, and the small slices
     * share the other 270°. A tap on the group expands it ([expandGroup]) and selects the first of
     * the small slices, a tap on that arc brings the small slices back together ([collapseGroup])
     * and selects the first slice. It is false whenever there is no group, and the change is
     * reported to [setOnGroupExpandedChangedListener].
     */
    public var isGroupExpanded: Boolean = false
        private set

    /** Color of the placeholder slice drawn when the chart has no data. */
    public var disabledColor: Int = DEFAULT_DISABLED_COLOR
        private set

    /** Duration (ms) of the entry reveal animation. */
    public var revealAnimationDuration: Long = DEFAULT_REVEAL_ANIMATION_DURATION
        private set

    /** Interpolator used for the entry reveal animation. */
    public var revealAnimationInterpolator: TimeInterpolator = DEFAULT_REVEAL_ANIMATION_INTERPOLATOR
        private set

    /** Duration (ms) of the data-change animation (grow/shrink). */
    public var dataChangeAnimationDuration: Long = DEFAULT_DATA_CHANGE_ANIMATION_DURATION
        private set

    /** Interpolator used for the data-change animation (grow/shrink). */
    public var dataChangeAnimationInterpolator: TimeInterpolator = DEFAULT_DATA_CHANGE_ANIMATION_INTERPOLATOR
        private set

    // ------------------------------------------------------------------
    //  Data state
    // ------------------------------------------------------------------
    /** What [setData] was given, without the slices that have no value. */
    private var sourceData: List<PieChartData> = emptyList()

    /** The sum of the values of [sourceData]: the whole that every share is a share of. */
    private var sourceTotal: BigDecimal = BigDecimal.ZERO

    /**
     * The target dataset (what the chart shows once animations settle): [sourceData], or, with
     * the small slices grouped, the slices that stand for them.
     */
    private var dataset: List<PieChartData> = emptyList()

    /**
     * The first this many slices of [dataset] are the band of an expanded group: the big slices,
     * drawn together in one arc. They can not be selected.
     */
    private var bandCount: Int = 0
    private var selectedIndexRaw: Int = -1

    /** The selected index; changing it updates the center and notifies the listener. */
    @set:JvmName("assignSelectedIndex") // the public setSelectedIndex(index) already exists
    private var selectedIndex: Int
        get() = selectedIndexRaw
        set(value) {
            if (selectedIndexRaw == value) return
            selectedIndexRaw = value
            onSelectionChanged()
        }

    /**
     * What is actually drawn: the target dataset plus, while a data-change
     * animation runs, "exiting" slices that shrink to zero. When idle this
     * is exactly [dataset].
     */
    private var renderList: List<PieChartData> = emptyList()

    /** renderList index -> dataset index, or -1 for an exiting slice. */
    private var renderIndexMap: IntArray = IntArray(0)

    /** The data-change animation that is running, if any. */
    private var morph: Morph? = null

    private var revealAnimator: ValueAnimator? = null
    private var morphAnimator: ValueAnimator? = null

    /** Stores a user's selection request while an animation is running. */
    private var pendingSelectedIndex: Int? = null

    // Precomputed geometry (in degrees)
    private var total: BigDecimal = BigDecimal.ZERO
    private var gapDeg: Float = 0f
    private var innerGapDeg: Float = 0f
    private var fullSweeps: FloatArray = FloatArray(0)
    private var segStarts: FloatArray = FloatArray(0)
    private var segEnds: FloatArray = FloatArray(0)
    private var animatedFractions: FloatArray = FloatArray(0)

    /** Per rendered slice: 1 when it is in the band of an expanded group, 0 when it is not, between while it moves. */
    private var bandWeights: FloatArray = FloatArray(0)

    private var onChunkClickListener: ((PieChartData) -> Unit)? = null
    private var onSelectionChangedListener: ((SelectedSlice?) -> Unit)? = null
    private var onGroupExpandedChangedListener: ((Boolean) -> Unit)? = null

    private val center = CenterPresenter(this)

    /** One [SelectedSlice] per dataset entry; rebuilt with the data, so the instances are stable. */
    private var allSlices: List<SelectedSlice> = emptyList()

    /** [allSlices] without the slices that can not be selected: what a center renderer sees. */
    private var centerSlices: List<SelectedSlice> = emptyList()
    private var isCenterAvailable = false

    // ------------------------------------------------------------------
    //  View geometry (computed in onSizeChanged)
    // ------------------------------------------------------------------
    private var cx: Float = 0f
    private var cy: Float = 0f
    private var outerRadius: Float = 0f
    private var innerRadius: Float = 0f
    private var innerTouchBound: Float = 0f
    private var outerTouchBound: Float = 0f

    private val slicePath = Path()

    /** The ring of the slices, and the same ring shifted toward the hole for the selected slice's shadow. */
    private val sliceRing = RingPathBuilder()
    private val shadowRing = RingPathBuilder()

    // ------------------------------------------------------------------
    //  Paints
    // ------------------------------------------------------------------
    private val slicePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    /** Clears what is already drawn where the shape drawn with it is. */
    private val maskPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT)
    }

    /** The layer's rectangle with a slice's outline cut out of it: what is outside the slice. */
    private val outsidePath = Path()

    // ==================================================================
    //  Public API
    // ==================================================================
    /**
     * The slices as they are shown: with the small slices grouped, the slice that stands for them is
     * in it ([OtherSliceId]); while they are expanded, all the slices are, and the big ones come first.
     */
    public val currentDataset: List<PieChartData> get() = dataset
    public val currentSelectedIndex: Int get() = selectedIndex

    /** The selected slice, or null when nothing is selected. */
    public val currentSelection: SelectedSlice? get() = allSlices.getOrNull(selectedIndex)

    /**
     * Draws information about the selected slice in the hole; null (the default) draws nothing.
     * Try [io.github.mohamadjavadx.piechart.center.DefaultCenterRenderer].
     */
    public var centerRenderer: CenterRenderer? = null
        set(value) {
            field = value
            updateCenterAvailability()
            invalidate()
        }

    /** When [centerRenderer] is shown. By default only while it fits in the hole. */
    public var centerVisibility: CenterVisibility = CenterVisibility.WhenFits
        set(value) {
            field = value
            updateCenterAvailability()
        }

    /**
     * The hole, for apps that draw their own center content, for example a view placed over the
     * chart. It is empty until the chart has a size, and changes with the size and [holeRadiusRatio].
     */
    public var centerArea: CenterArea = CenterArea(0f, 0f, 0f)
        private set

    @MainThread
    public fun setData(newDataset: List<PieChartData>) {
        sourceData = newDataset.filter { it.value.signum() > 0 }
        sourceTotal = sourceData.sumOf { it.value }
        showSource(animate = true)
    }

    /** Removes all data, clears the selection, and shows the disabled placeholder. */
    @MainThread
    public fun clearData() {
        sourceData = emptyList()
        sourceTotal = BigDecimal.ZERO
        val wasExpanded = isGroupExpanded
        isGroupExpanded = false
        clearDisplayed()
        if (wasExpanded) onGroupExpandedChangedListener?.invoke(false)
    }

    /**
     * Expands the grouped small slices and selects the first of them, as a tap on the group does;
     * nothing happens without a group.
     */
    @MainThread
    public fun expandGroup() {
        setGroupExpanded(true)
    }

    /**
     * Brings the expanded small slices back together and selects the first slice, as a tap on the
     * arc of big slices does. Anything that takes the user out of the expanded view, such as a back
     * button, can call it.
     */
    @MainThread
    public fun collapseGroup() {
        setGroupExpanded(false)
    }

    private fun setGroupExpanded(expanded: Boolean) {
        if (isGroupExpanded == expanded) return
        if (expanded && !groupingOf(sourceData).hasGroup) return
        isGroupExpanded = expanded
        showSource(animate = true)
        onGroupExpandedChangedListener?.invoke(expanded)
        selectAfterGroupChange(if (expanded) bandCount else 0)
    }

    /**
     * Selects the slice at [index] of the dataset that the group's change has just put on the ring,
     * as a tap on that slice would: at once, as the slices are already in their new places as far as
     * the selection goes, and the drawing follows them through the animation.
     */
    private fun selectAfterGroupChange(index: Int) {
        if (index !in dataset.indices || !isSelectable(index)) return
        onChunkClickListener?.invoke(dataset[index])
        selectedIndex = index
    }

    /**
     * Called when the group is expanded or collapsed, by a tap, by [expandGroup] or
     * [collapseGroup], or because there is no group any more. Null removes the listener.
     */
    @MainThread
    public fun setOnGroupExpandedChangedListener(listener: ((isExpanded: Boolean) -> Unit)?) {
        onGroupExpandedChangedListener = listener
    }

    private fun groupingOf(source: List<PieChartData>): Grouping =
        if (groupSmallSlices) {
            groupSlices(source, visualGapDeg, isGroupExpanded, otherSliceColor)
        } else {
            Grouping(source, hasGroup = false)
        }

    /** Shows [sourceData], grouped as it is now; the change is animated when [animate] is true. */
    private fun showSource(animate: Boolean) {
        val grouping = groupingOf(sourceData)
        val groupGone = isGroupExpanded && !grouping.hasGroup
        if (groupGone) isGroupExpanded = false
        if (grouping.slices.isEmpty()) clearDisplayed() else showDisplayed(grouping.slices, grouping.bandCount, animate)
        if (groupGone) onGroupExpandedChangedListener?.invoke(false)
    }

    /**
     * The slices to show depend on the gap and on the style, which change without new data: this
     * follows them, at once.
     */
    private fun syncGroups() {
        if (sourceData.isEmpty()) return
        val grouping = groupingOf(sourceData)
        val groupGone = isGroupExpanded && !grouping.hasGroup
        if (groupGone) isGroupExpanded = false
        if (grouping.slices != dataset || grouping.bandCount != bandCount) {
            showDisplayed(grouping.slices, grouping.bandCount, animate = false)
        }
        if (groupGone) onGroupExpandedChangedListener?.invoke(false)
    }

    private fun showDisplayed(clean: List<PieChartData>, newBandCount: Int, animate: Boolean) {
        // The selection follows its slice into the new data, matched by the slice's key: it stays
        // when the slice is still there, even at another index, and is cleared when it is not.
        // A selection requested during an animation counts, and so does a request to deselect.
        val previousKey = dataset.getOrNull(selectedIndexRaw)?.let(::sliceKey)
        val keptKey = dataset.getOrNull(pendingSelectedIndex ?: selectedIndexRaw)?.let(::sliceKey)
        pendingSelectedIndex = null

        if (dataset.isEmpty()) {
            // First data: every slice grows into place.
            dataset = clean
            bandCount = newBandCount
            renderList = clean
            renderIndexMap = IntArray(clean.size) { it }
            precomputeSegments()
            if (animate) animateIn() else animatedFractions.fill(1f)
        } else if (animate) {
            // Existing data: morph from the current layout to the new one.
            startMorph(clean, newBandCount)
        } else {
            dataset = clean
            bandCount = newBandCount
            snapToFinalState()
        }

        rebuildSlices()
        selectedIndexRaw = if (keptKey == null) -1 else clean.indexOfFirst { sliceKey(it) == keptKey }
        // A slice that is in the band can not be selected: the selection ends when its slice goes there.
        if (selectedIndexRaw in 0 until newBandCount) selectedIndexRaw = -1
        updateCenterAvailability()
        // Not a change of selection when the same slice stays selected, whatever its index or value.
        if (clean.getOrNull(selectedIndexRaw)?.let(::sliceKey) != previousKey) {
            onSelectionChangedListener?.invoke(currentSelection)
        }
        invalidate()
    }

    private fun clearDisplayed() {
        revealAnimator?.cancel()
        morphAnimator?.let { anim ->
            morphAnimator = null // Prevent finishMorph() from running via the listener
            anim.cancel()
        }
        dataset = emptyList()
        bandCount = 0
        renderList = emptyList()
        renderIndexMap = IntArray(0)
        morph = null
        selectedIndex = -1
        pendingSelectedIndex = null
        resetSegments()
        onDatasetChanged()
        invalidate()
    }

    /** Whether the slice at [index] of the dataset can be selected: not the group's, nor one in the band. */
    private fun isSelectable(index: Int) = index >= bandCount && dataset[index].id !== OtherSliceId

    /**
     * Sets the currently selected slice index.
     * If an animation is in progress, the choice is queued and applied when it ends.
     *
     * @param index The index of the slice to select, or -1 to deselect.
     * @param shouldInvalidate Whether to trigger a redraw immediately.
     */
    @JvmOverloads
    @MainThread
    public fun setSelectedIndex(index: Int, shouldInvalidate: Boolean = true) {
        if (index != -1 && index !in dataset.indices) return
        if (index != -1 && !isSelectable(index)) return

        if (isAnimating()) {
            // Wait for animation to be done
            pendingSelectedIndex = index
        } else {
            selectedIndex = index
            if (shouldInvalidate) invalidate()
        }
    }

    /**
     * Called with the slice that a tap selects, before it is selected; null removes the listener.
     * That is the slice the tap lands on, except for a tap on the group of small slices, which selects
     * the first of them, and a tap on the arc of big slices, which selects the first slice (see
     * [isGroupExpanded]). [expandGroup] and [collapseGroup] select them too, and call it as well.
     */
    @MainThread
    public fun setOnChunkClickListener(listener: ((data: PieChartData) -> Unit)?) {
        onChunkClickListener = listener
    }

    /**
     * Called when the selection changes, however it changed: a tap, [setSelectedIndex] (once any
     * running animation is done), or new data that no longer contains the selected slice.
     * Receives null when nothing is selected. It is not called when new data keeps the same
     * slice selected, even if the slice moved or its value changed.
     */
    @MainThread
    public fun setOnSelectionChangedListener(listener: ((selection: SelectedSlice?) -> Unit)?) {
        onSelectionChangedListener = listener
    }

    /**
     * Immediately cancels all running animations (reveal and morph),
     * snaps the chart to its final layout, and applies any pending user selection.
     */
    private fun snapToFinalState() {
        // 1. Cancel all animations. Null out references first so the
        // AnimatorListenerAdapter checks fail and skip side-effects.
        morphAnimator?.let {
            morphAnimator = null
            it.cancel()
        }
        revealAnimator?.let {
            revealAnimator = null
            it.cancel()
        }

        // 2. Reset morph state
        morph = null

        // 3. Restore steady state layout
        if (dataset.isNotEmpty()) {
            renderList = dataset
            renderIndexMap = IntArray(dataset.size) { it }
            precomputeSegments()
            animatedFractions.fill(1f)
        } else {
            resetSegments()
        }

        // 4. Apply any pending selection the user made before the snap
        applyPendingSelection()
        invalidate()
    }

    // ==================================================================
    //  Padding handling
    // ==================================================================
    override fun setPadding(left: Int, top: Int, right: Int, bottom: Int) {
        super.setPadding(left, top, right, bottom)
        relayout()
    }

    override fun setPaddingRelative(start: Int, top: Int, end: Int, bottom: Int) {
        super.setPaddingRelative(start, top, end, bottom)
        relayout()
    }

    // ==================================================================
    //  Lifecycle
    // ==================================================================
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // A running animation can't be resumed after this, so finish it: otherwise the chart stays
        // frozen mid-animation (and a queued selection is never applied) until the next update.
        if (isAnimating()) snapToFinalState()
        // After the snap, which may have started a fade of the center: this ends it in its final state.
        center.cancel()
    }

    // ==================================================================
    //  Center content
    // ==================================================================
    private fun onSelectionChanged() {
        refreshCenter()
        onSelectionChangedListener?.invoke(currentSelection)
    }

    private fun onDatasetChanged() {
        rebuildSlices()
        updateCenterAvailability()
    }

    private fun rebuildSlices() {
        // A slice is a share of the whole data, not of what is on the ring: with the group collapsed,
        // one slice stands for the small ones and takes its share of the big ones' angle.
        allSlices = dataset.mapIndexed { index, data ->
            val fraction = if (sourceTotal.signum() > 0) data.value.divide(sourceTotal, MathContext.DECIMAL64).toFloat() else 0f
            SelectedSlice(index, data, sourceTotal, fraction)
        }
        centerSlices = allSlices.filter { isSelectable(it.index) }
    }

    /** Whether the center fits is worked out when the size, the hole or the data change, not per selection. */
    private fun updateCenterAvailability() {
        isCenterAvailable = computeCenterAvailability()
        refreshCenter()
    }

    private fun refreshCenter() {
        center.update(currentSelection, isCenterAvailable)
    }

    private fun computeCenterAvailability(): Boolean {
        val renderer = centerRenderer ?: return false
        if (centerArea.isEmpty || centerSlices.isEmpty()) return false
        return when (val visibility = centerVisibility) {
            CenterVisibility.Always -> true
            CenterVisibility.Never -> false
            CenterVisibility.WhenFits -> renderer.fits(centerArea, centerSlices)
            is CenterVisibility.MinHoleRatio -> holeRadiusRatio >= visibility.ratio
        }
    }

    private fun drawCenter(canvas: Canvas) {
        val renderer = centerRenderer ?: return
        val slice = center.displayed ?: return
        val alpha = center.alpha
        val area = centerArea
        if (alpha <= 0f || area.isEmpty) return

        if (alpha >= 1f) {
            renderer.draw(canvas, area, slice, centerSlices)
        } else {
            // Any renderer fades with the chart, whether or not it knows about alpha.
            val checkpoint = canvas.saveLayerAlpha(
                cx - innerRadius, cy - innerRadius, cx + innerRadius, cy + innerRadius,
                (alpha * 255f).toInt()
            )
            renderer.draw(canvas, area, slice, centerSlices)
            canvas.restoreToCount(checkpoint)
        }
    }

    // ==================================================================
    //  Data precomputation (final layout)
    // ==================================================================
    private fun precomputeSegments() {
        if (dataset.isEmpty()) {
            resetSegments()
            return
        }

        total = dataset.sumOf { it.value }

        allocateSegmentArrays(renderList.size)
        for (i in bandWeights.indices) bandWeights[i] = if (i < bandCount) 1f else 0f
        computeSegmentBounds()
    }

    private fun resetSegments() {
        total = BigDecimal.ZERO
        gapDeg = 0f
        innerGapDeg = 0f
        fullSweeps = FloatArray(0)
        segStarts = FloatArray(0)
        segEnds = FloatArray(0)
        animatedFractions = FloatArray(0)
        bandWeights = FloatArray(0)
    }

    private fun allocateSegmentArrays(size: Int) {
        // Only reallocate if the size has changed. When the size matches, the
        // previous contents (including reveal fractions) are preserved.
        if (fullSweeps.size != size) {
            fullSweeps = FloatArray(size)
            segStarts = FloatArray(size)
            segEnds = FloatArray(size)
            animatedFractions = FloatArray(size)
            bandWeights = FloatArray(size)
        }
    }

    private fun computeSegmentBounds() {
        if (dataset.isEmpty()) return

        gapDeg = computeGapDeg(gapSliceCount(dataset.size, bandCount), visualGapDeg, ensureRenderableSlices)
        val sweeps = computeTargetSweeps(
            dataset, total, gapDeg, ensureRenderableSlices, bandCount, EXPANDED_BAND_SWEEP_DEG
        )
        for (i in sweeps.indices) {
            fullSweeps[i] = sweeps[i]
        }
        syncInnerGapDeg()
        applyAnglesToSegments()
    }

    /** The band of an expanded group is one slice as far as the gaps go: it has none inside. */
    private fun gapSliceCount(size: Int, band: Int) = if (band > 0) size - band + 1 else size

    /**
     * Synchronizes the inner angular gap corresponding to [gapDeg] on the outer radius.
     */
    private fun syncInnerGapDeg() {
        innerGapDeg = computeInnerGapDeg(gapDeg, holeRadiusRatio, innerRadius, fullSweeps.isNotEmpty())
    }

    private fun applyAnglesToSegments() {
        var cursor = gapDeg / 2f
        for (i in fullSweeps.indices) {
            segStarts[i] = cursor - gapDeg / 2f
            cursor += fullSweeps[i]
            segEnds[i] = cursor - gapDeg / 2f
        }
    }

    // ==================================================================
    //  Animations
    // ==================================================================
    private fun isAnimating(): Boolean {
        return morphAnimator?.isStarted == true || revealAnimator?.isStarted == true
    }

    private fun applyPendingSelection() {
        val pending = pendingSelectedIndex
        if (pending != null) {
            pendingSelectedIndex = null
            if (pending == -1 || (pending in dataset.indices && isSelectable(pending))) {
                selectedIndex = pending
                invalidate()
            }
        }
    }

    /** Entry animation: every slice grows from its start angle to its full sweep, all at once. */
    private fun animateIn() {
        revealAnimator?.cancel()
        revealAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = revealAnimationDuration
            interpolator = revealAnimationInterpolator
            addUpdateListener { anim ->
                val progress = anim.animatedValue as Float
                animatedFractions.fill(progress)
                invalidate()
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (revealAnimator === animation) {
                        revealAnimator = null
                        applyPendingSelection()
                        invalidate()
                    }
                }
            })
        }
        revealAnimator?.start()
    }

    /**
     * Animates from the current visual state to [newData]; see [planMorph]. Start angles are
     * recomputed cumulatively every frame, so the pie is always complete.
     */
    private fun startMorph(newData: List<PieChartData>, newBandCount: Int) {
        // 1. Snapshot the CURRENT visual state before any cancellation runs.
        val oldRender = renderList
        val oldMap = renderIndexMap
        val oldSweeps = fullSweeps.copyOf()
        val oldBand = bandWeights.copyOf()
        val fractionSeed = animatedFractions.firstOrNull() ?: 1f
        val fromGap = gapDeg

        revealAnimator?.cancel()
        morphAnimator?.cancel()

        // 2. Final enforced layout of the new dataset.
        dataset = newData
        bandCount = newBandCount
        total = dataset.sumOf { it.value }

        val toGap = computeGapDeg(gapSliceCount(newData.size, newBandCount), visualGapDeg, ensureRenderableSlices)
        val targetSweeps = computeTargetSweeps(
            dataset, total, toGap, ensureRenderableSlices, newBandCount, EXPANDED_BAND_SWEEP_DEG
        )

        // 3. Plan the animation. The gap moves from what is on screen now to the final gap, so it
        //    does not jump when the animation ends.
        val plan = planMorph(
            oldRender, oldMap, oldSweeps, newData, targetSweeps, fractionSeed, fromGap, toGap, oldBand, newBandCount
        )
        morph = plan
        renderList = plan.renderList
        renderIndexMap = plan.renderIndexMap
        allocateSegmentArrays(plan.renderList.size)

        if (plan.isVisuallyIdentical) {
            // Layout is identical (e.g. a color-only change) — nothing to animate.
            finishMorph()
            return
        }

        // Ensure a valid first frame exists before the animator's first callback.
        applyMorphProgress(0f)

        morphAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = dataChangeAnimationDuration
            interpolator = dataChangeAnimationInterpolator
            addUpdateListener { anim ->
                applyMorphProgress(anim.animatedValue as Float)
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    // Skip ends of animators that were cancelled because a newer
                    // morph / clearData already took over the state.
                    if (morphAnimator === animation) finishMorph()
                }
            })
        }
        morphAnimator?.start()
    }

    /** Moves the render layout, the gap and the reveal fraction to [progress] of the running morph. */
    private fun applyMorphProgress(progress: Float) {
        val morph = morph ?: return
        for (i in fullSweeps.indices) {
            fullSweeps[i] = morph.sweepAt(i, progress)
            bandWeights[i] = morph.bandAt(i, progress)
        }
        animatedFractions.fill(morph.fractionAt(progress))
        gapDeg = morph.gapAt(progress)
        syncInnerGapDeg()
        applyAnglesToSegments()
        invalidate()
    }

    /** Restores the steady state: renderList == dataset, final layout, fully revealed. */
    private fun finishMorph() {
        morphAnimator = null
        morph = null
        renderList = dataset
        renderIndexMap = IntArray(dataset.size) { it }
        if (dataset.isEmpty()) {
            resetSegments()
            applyPendingSelection()
            invalidate()
            return
        }
        precomputeSegments()
        animatedFractions.fill(1f)   // after precompute: it may reallocate the array
        applyPendingSelection()
        invalidate()
    }

    // ==================================================================
    //  Layout
    // ==================================================================
    /** The chart is a circle, so the view is square: the smaller of the two sizes it is offered. */
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val widthMode = MeasureSpec.getMode(widthMeasureSpec)
        val heightMode = MeasureSpec.getMode(heightMeasureSpec)
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val height = MeasureSpec.getSize(heightMeasureSpec)
        val size = when {
            widthMode == MeasureSpec.UNSPECIFIED && heightMode == MeasureSpec.UNSPECIFIED ->
                maxOf(suggestedMinimumWidth, suggestedMinimumHeight)
            widthMode == MeasureSpec.UNSPECIFIED -> height
            heightMode == MeasureSpec.UNSPECIFIED -> width
            else -> minOf(width, height)
        }
        setMeasuredDimension(size, size)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        relayout()
    }

    private fun calculateBounds(w: Int, h: Int) {
        if (w <= 0 || h <= 0) return

        val padLeft = paddingLeft.toFloat()
        val padRight = paddingRight.toFloat()
        val padTop = paddingTop.toFloat()
        val padBottom = paddingBottom.toFloat()

        val availableWidth = (w - padLeft - padRight).coerceAtLeast(0f)
        val availableHeight = (h - padTop - padBottom).coerceAtLeast(0f)

        if (availableWidth <= 0f || availableHeight <= 0f) {
            clearBounds()
            return
        }

        cx = padLeft + availableWidth / 2f
        cy = padTop + availableHeight / 2f

        outerRadius = minOf(availableWidth, availableHeight) / 2f
        innerRadius = outerRadius * holeRadiusRatio
        val thickness = (outerRadius - innerRadius).coerceAtLeast(0f)

        // A size given in dp becomes its ratio (or degrees) here, for the chart's size now, and
        // the chart draws with that: the corners are a share of half the thickness, the shadow
        // offset a share of the hole's radius, and the gap an angle on the outer edge.
        val density = resources.displayMetrics.density
        cornerRadiusDp?.let { cornerRadiusRatio = ratioOfPx(it * density, thickness / 2f) }
        selectedShadowOffsetDp?.let { selectedShadowOffsetRatio = ratioOfPx(it * density, innerRadius) }
        visualGapDp?.let { visualGapDeg = degreesOfArc(it * density, outerRadius) }

        sliceRing.setRing(cx, cy, outerRadius, innerRadius)
        // The shadow is the slice again, shifted toward the hole by a share of the hole's radius.
        // It stays behind the slice, so only the part that sticks out on the hole side shows.
        // Never more than half the donut's thickness, so the shadow stays close to the slice.
        val shadowOffset = minOf(innerRadius * selectedShadowOffsetRatio, thickness / 2f)
        shadowRing.setRing(cx, cy, outerRadius - shadowOffset, innerRadius - shadowOffset)

        innerTouchBound = innerRadius - touchPaddingPx
        outerTouchBound = outerRadius + touchPaddingPx

        updateCenterArea(cx, cy, innerRadius)
    }

    /** There is no room for a chart (the padding takes it all): draw nothing and take no touches. */
    private fun clearBounds() {
        outerRadius = 0f
        innerRadius = 0f
        sliceRing.setRing(cx, cy, 0f, 0f)
        shadowRing.setRing(cx, cy, 0f, 0f)
        innerTouchBound = 1f
        outerTouchBound = 0f // an empty range: no touch is inside it
        updateCenterArea(cx, cy, 0f)
    }

    /**
     * The area is a new instance only when the hole changes, as [centerArea] promises, so a
     * renderer that caches by identity keeps its work when only the style changes elsewhere.
     */
    private fun updateCenterArea(cx: Float, cy: Float, radius: Float) {
        val area = centerArea
        if (area.cx == cx && area.cy == cy && area.radius == radius) return
        centerArea = CenterArea(cx, cy, radius)
        updateCenterAvailability()
    }

    // ==================================================================
    //  Drawing
    // ==================================================================
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (outerRadius <= 0f) return
        if (dataset.isEmpty()) {
            drawPlaceholderSlice(canvas)
            return
        }
        if (total.signum() <= 0) return
        drawSlices(canvas)
        drawCenter(canvas)
    }

    /**
     * Empty-state view: one full, disabled slice. Same geometry as the
     * single-slice case (full circle, no gap, no rounded corners) but drawn
     * in [disabledColor] and not interactive.
     */
    private fun drawPlaceholderSlice(canvas: Canvas) {
        slicePaint.color = disabledColor   // setColor includes alpha, so no leftover slice alpha
        if (innerRadius <= 0f) {
            canvas.drawCircle(cx, cy, outerRadius, slicePaint)
        } else {
            slicePath.reset()
            sliceRing.buildFullRing(slicePath)
            canvas.drawPath(slicePath, slicePaint)
        }
    }

    private fun drawSlices(canvas: Canvas) {
        var sliceStart = startAngleDeg
        var bandFirst = -1
        var bandLast = -1
        var bandStart = 0f

        for (i in fullSweeps.indices) {
            val sweep = fullSweeps[i]
            val fraction = animatedFractions[i]
            val bandWeight = bandWeights[i]
            val visibleSweep = (sweep - gapDeg) * fraction

            if (bandWeight > 0f) {
                if (bandFirst < 0) {
                    bandFirst = i
                    bandStart = sliceStart
                }
                bandLast = i
            }

            // A slice that is all in the band is drawn there, with the others.
            if (visibleSweep > 0f && bandWeight < 1f) {
                configureSlicePaint(i)
                // On its way into or out of the band, a slice fades with its share of it.
                if (bandWeight > 0f) slicePaint.alpha = (slicePaint.alpha * (1f - bandWeight)).toInt()

                val outerStart = sliceStart + gapDeg / 2f
                drawDonutSlice(canvas, sweep, sliceStart, outerStart, visibleSweep, i)
            }

            sliceStart += sweep
        }

        if (bandFirst >= 0) drawBand(canvas, bandFirst, bandLast, bandStart)
    }

    /**
     * The slices [first]..[last] of the band of an expanded group, from angle [start]: side by side,
     * without gaps or rounded corners, dimmed by [mainSliceDim], and cut to the outline of one
     * rounded slice as wide as all of them, as if they were drawn inside it.
     */
    private fun drawBand(canvas: Canvas, first: Int, last: Int, start: Float) {
        var weight = 0f
        var end = start
        for (i in first..last) {
            weight = maxOf(weight, bandWeights[i])
            end += fullSweeps[i]
        }
        val fraction = animatedFractions[first]
        val outerSweep = (end - start - gapDeg) * fraction
        val innerSweep = (end - start - innerGapDeg) * fraction
        if (outerSweep <= 0f || innerSweep <= 0f) return

        val selectionAlpha = if (selectedIndex < 0) selectedAlpha else unselectedAlpha
        val alpha = (selectionAlpha * (1f - mainSliceDim * weight)).toInt()
        if (alpha <= 0) return

        val checkpoint = canvas.saveLayerAlpha(
            cx - outerRadius, cy - outerRadius, cx + outerRadius, cy + outerRadius, alpha
        )
        var cursor = start
        for (i in first..last) {
            val sweep = fullSweeps[i]
            if (bandWeights[i] > 0f && sweep > 0f) {
                slicePaint.color = renderList[i].color
                slicePaint.alpha = (255f * bandWeights[i]).toInt()
                // A little over the next slice, so that no seam of the background shows between them.
                val drawn = sweep * fraction + BAND_SEAM_OVERLAP_DEG
                slicePath.reset()
                sliceRing.buildSharp(slicePath, cursor, drawn, cursor, drawn)
                canvas.drawPath(slicePath, slicePaint)
            }
            cursor += sweep
        }

        // Cut to the outline: clear everything outside it. (Drawing a shape only changes the pixels
        // it covers, so the outline itself can not be the mask.)
        buildRoundedDonutSlice(
            sliceRing, start + gapDeg / 2f, outerSweep, start + innerGapDeg / 2f, innerSweep
        )
        outsidePath.reset()
        outsidePath.fillType = Path.FillType.EVEN_ODD
        outsidePath.addRect(cx - outerRadius, cy - outerRadius, cx + outerRadius, cy + outerRadius, Path.Direction.CW)
        outsidePath.addPath(slicePath)
        canvas.drawPath(outsidePath, maskPaint)
        canvas.restoreToCount(checkpoint)
    }

    private fun configureSlicePaint(renderIndex: Int) {
        slicePaint.color = renderList[renderIndex].color
        val datasetIndex = renderIndexMap[renderIndex]
        // Nothing selected: every slice is drawn normally, not as "unselected".
        slicePaint.alpha =
            if (selectedIndex < 0 || datasetIndex == selectedIndex) selectedAlpha else unselectedAlpha
    }

    private fun drawDonutSlice(
        canvas: Canvas,
        fullSweep: Float,
        cursor: Float,
        outerStartAngle: Float,
        outerSweep: Float,
        index: Int
    ) {
        val innerSweep = (fullSweep - innerGapDeg) * animatedFractions[index]
        if (innerSweep <= 0f) return

        val innerStartAngle = cursor + innerGapDeg / 2f

        // The selected slice's shadow: the same slice, in a faded color, drawn behind it and
        // shifted toward the hole. It follows the slice through every animation.
        val hasShadow = selectedIndex >= 0 && renderIndexMap[index] == selectedIndex &&
            selectedShadowAlpha > 0 && shadowRing.outerRadius < sliceRing.outerRadius
        if (hasShadow) {
            val sliceAlpha = slicePaint.alpha
            slicePaint.alpha = selectedShadowAlpha
            drawRoundedDonutSlice(canvas, shadowRing, outerStartAngle, outerSweep, innerStartAngle, innerSweep)
            slicePaint.alpha = sliceAlpha
        }

        drawRoundedDonutSlice(canvas, sliceRing, outerStartAngle, outerSweep, innerStartAngle, innerSweep)
    }

    /** Draws a slice on [ring]. */
    private fun drawRoundedDonutSlice(
        canvas: Canvas,
        ring: RingPathBuilder,
        outerStartAngle: Float,
        outerSweep: Float,
        innerStartAngle: Float,
        innerSweep: Float
    ) {
        buildRoundedDonutSlice(ring, outerStartAngle, outerSweep, innerStartAngle, innerSweep)
        canvas.drawPath(slicePath, slicePaint)
    }

    /** Builds the outline of a slice on [ring], with the corners the style asks for, into [slicePath]. */
    private fun buildRoundedDonutSlice(
        ring: RingPathBuilder,
        outerStartAngle: Float,
        outerSweep: Float,
        innerStartAngle: Float,
        innerSweep: Float
    ) {
        slicePath.reset()

        val radii = computeCornerRadii(
            outerSweep, innerSweep, ring.outerRadius, ring.innerRadius,
            holeRadiusRatio, cornerRadiusRatio, roundInnerCorners, renderList.size
        )
        if (radii.outer <= 0f && radii.inner <= 0f) {
            ring.buildSharp(slicePath, outerStartAngle, outerSweep, innerStartAngle, innerSweep)
        } else {
            ring.buildRounded(
                slicePath,
                radii.outer, radii.inner,
                outerStartAngle, outerSweep,
                innerStartAngle, innerSweep
            )
        }
    }

    // ==================================================================
    //  Touch handling
    // ==================================================================
    // Where the current gesture started, and whether it is still a tap (it stops being one when the
    // finger moves further than the touch slop, or a second finger arrives).
    private var downX = 0f
    private var downY = 0f
    private var isTap = false

    override fun onTouchEvent(event: MotionEvent): Boolean {
        // Touch is not available during animation
        if (isAnimating()) return false

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                isTap = true
                return dataset.isNotEmpty()
            }

            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - downX
                val dy = event.y - downY
                if (dx * dx + dy * dy > touchSlop * touchSlop) isTap = false
            }

            MotionEvent.ACTION_POINTER_DOWN -> isTap = false

            MotionEvent.ACTION_UP -> {
                val clickedIndex = if (isTap) hitTestChunk(event.x, event.y) else -1
                if (clickedIndex >= 0) {
                    val clicked = dataset[clickedIndex]
                    when {
                        clicked.id === OtherSliceId -> expandGroup()
                        clickedIndex < bandCount -> collapseGroup()
                        else -> {
                            onChunkClickListener?.invoke(clicked)
                            setSelectedIndex(clickedIndex)
                        }
                    }
                    performClick()
                    return true
                }
            }

            MotionEvent.ACTION_CANCEL -> return false
        }
        return super.onTouchEvent(event)
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    /** The index in the dataset of the slice under (x, y), or -1; see [sliceIndexAt]. */
    private fun hitTestChunk(x: Float, y: Float): Int = sliceIndexAt(
        x, y, cx, cy, innerTouchBound, outerTouchBound, startAngleDeg, gapDeg,
        fullSweeps, segStarts, segEnds, renderIndexMap, bandCount
    )

    private companion object {
        private val touchPaddingPx: Float = 8f.dp

        // Default style values
        private const val DEFAULT_VISUAL_GAP_DEG = 1f
        private const val DEFAULT_START_ANGLE_DEG = -90f
        private const val DEFAULT_SELECTED_ALPHA = 255
        private const val DEFAULT_UNSELECTED_ALPHA = 102
        private const val DEFAULT_SELECTED_SHADOW_ALPHA = 51 // 20% of 255
        private const val DEFAULT_SELECTED_SHADOW_OFFSET_RATIO = 0.06f
        private const val DEFAULT_HOLE_RADIUS_RATIO = 0.85f
        private const val DEFAULT_CORNER_RADIUS_RATIO = 0.5f
        private const val DEFAULT_ENSURE_RENDERABLE_SLICES = true
        private const val DEFAULT_ROUND_INNER_CORNERS = true
        private const val DEFAULT_DISABLED_COLOR: Int = Color.LTGRAY
        private const val DEFAULT_GROUP_SMALL_SLICES = false
        private const val DEFAULT_OTHER_SLICE_COLOR: Int = 0xFF8A93A6.toInt()
        private const val DEFAULT_MAIN_SLICE_DIM = 0.7f

        /** How far a slice of the band is drawn over the next one, in degrees. */
        private const val BAND_SEAM_OVERLAP_DEG = 0.15f

        // Default animation values
        private const val DEFAULT_REVEAL_ANIMATION_DURATION = 600L
        private val DEFAULT_REVEAL_ANIMATION_INTERPOLATOR: TimeInterpolator = PathInterpolator(.3f, .74f, .38f, .93f)
        private const val DEFAULT_DATA_CHANGE_ANIMATION_DURATION = 600L
        private val DEFAULT_DATA_CHANGE_ANIMATION_INTERPOLATOR: TimeInterpolator = PathInterpolator(.3f, .74f, .38f, .93f)
    }
}