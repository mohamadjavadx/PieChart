import { groupSlices, EXPANDED_BAND_SWEEP_DEG } from "../core/grouping.js";
import { gapSliceCount, shadowRingOf } from "../core/layout.js";
import { Morph, planMorph, sliceKey } from "../core/morph.js";
import { computeGapDeg, computeInnerGapDeg, computeTargetSweeps, degreesOfArc, ratioOfPx, sliceIndexAt, } from "../core/sliceMath.js";
import { shareOf, toSlices, totalOf } from "../core/slices.js";
import { OtherSliceId } from "../core/types.js";
import { CenterArea } from "../center/area.js";
import { CenterPresenter } from "../center/presenter.js";
import { buildScene } from "./scene.js";
import { applyStyle, DEFAULT_ANIMATION, DEFAULT_STYLE, } from "./style.js";
const NO_PADDING = { left: 0, top: 0, right: 0, bottom: 0 };
const sameSlices = (a, b) => a.length === b.length &&
    a.every((slice, i) => {
        const other = b[i];
        return slice.id === other.id && slice.label === other.label && slice.color === other.color && slice.value.compareTo(other.value) === 0;
    });
export class ChartModel {
    onSelectionChanged = null;
    /** Called with the slice that a tap selects, before it is selected. */
    onSliceClick = null;
    onGroupExpandedChanged = null;
    /** Called whenever what is drawn has changed. */
    onInvalidate = null;
    currentStyle = { ...DEFAULT_STYLE };
    animation = { ...DEFAULT_ANIMATION };
    clock;
    density;
    touchPadding;
    // The box, and the ring in it.
    width = 0;
    height = 0;
    padding = NO_PADDING;
    cx = 0;
    cy = 0;
    ring = { cx: 0, cy: 0, outerRadius: 0, innerRadius: 0 };
    shadowRing = this.ring;
    innerTouchBound = 1;
    outerTouchBound = 0;
    // What the chart was given, and what it shows for it.
    otherLabelText = "Other";
    sourceData = [];
    sourceTotal = totalOf([]);
    dataset = [];
    bandCount = 0;
    expanded = false;
    selectedIndexRaw = -1;
    pendingSelectedIndex = null;
    // What is drawn: the dataset plus leaving slices, and where and how much of each.
    renderList = [];
    renderIndexMap = [];
    morph = null;
    revealAnimation = null;
    morphAnimation = null;
    total = totalOf([]);
    gapDeg = 0;
    innerGapDeg = 0;
    fullSweeps = [];
    segStarts = [];
    segEnds = [];
    animatedFractions = [];
    bandWeights = [];
    allSlices = [];
    centerSlicesList = [];
    // The details of the selected slice, in the hole.
    renderer = null;
    visibility = "whenFits";
    area = new CenterArea(0, 0, 0);
    isCenterAvailable = false;
    presenter;
    constructor(options = {}) {
        this.clock = options.clock ?? (() => performance.now());
        this.density = options.density ?? 1;
        this.touchPadding = options.touchPadding ?? 8;
        this.otherLabelText = options.otherLabel ?? "Other";
        this.presenter = new CenterPresenter(this.clock, () => this.invalidate());
        if (options.animation)
            this.animation = { ...this.animation, ...options.animation };
        if (options.style)
            this.currentStyle = applyStyle(this.currentStyle, options.style);
    }
    // ------------------------------------------------------------------ Reading
    get style() {
        return this.currentStyle;
    }
    /** The slices as they are shown: with small slices grouped, the one that stands for them is in it. */
    get slices() {
        return this.dataset;
    }
    /** How many of the first slices of [slices] are the big ones of an expanded group, which share a band. */
    get band() {
        return this.bandCount;
    }
    get isGroupExpanded() {
        return this.expanded;
    }
    get selectedIndex() {
        return this.selectedIndexRaw;
    }
    get selection() {
        return this.allSlices[this.selectedIndexRaw] ?? null;
    }
    /** Every slice on the ring, with its share of the whole: those in [slices], the group's included. */
    get displayed() {
        return this.allSlices;
    }
    /** How many small slices are grouped (as the group's slice while it is closed, or on the ring while it is open); 0 with no group. */
    get groupSize() {
        if (this.expanded)
            return this.dataset.length - this.bandCount;
        const last = this.dataset[this.dataset.length - 1];
        return last?.id === OtherSliceId ? this.sourceData.length - (this.dataset.length - 1) : 0;
    }
    /** The slices that a center renderer sees: those that can be selected. */
    get selectableSlices() {
        return this.centerSlicesList;
    }
    get isAnimating() {
        return this.morphAnimation !== null || this.revealAnimation !== null;
    }
    /**
     * The hole, for content that is placed over the chart. It is a new instance only when the hole changes,
     * so a renderer that caches by identity keeps its work when only another style setting changes.
     */
    get centerArea() {
        return this.area;
    }
    get centerRenderer() {
        return this.renderer;
    }
    get centerVisibility() {
        return this.visibility;
    }
    // ------------------------------------------------------------------ The center
    /** Draws information about the selected slice in the hole; null (the default) draws nothing. */
    setCenterRenderer(renderer) {
        this.renderer = renderer;
        this.updateCenterAvailability();
        this.invalidate();
    }
    /** Lays the center out again from scratch, for when what the renderer measures has changed, such as a font that has loaded. */
    relayoutCenter() {
        this.renderer?.invalidate?.();
        this.updateCenterAvailability();
        this.invalidate();
    }
    /** When the renderer is shown. By default only while it fits in the hole. */
    setCenterVisibility(visibility) {
        this.visibility = visibility;
        this.updateCenterAvailability();
    }
    /** Whether the center is shown is worked out when the size, the hole or the data change, not per selection. */
    updateCenterAvailability() {
        this.isCenterAvailable = this.computeCenterAvailability();
        this.refreshCenter();
    }
    refreshCenter() {
        this.presenter.update(this.selection, this.isCenterAvailable);
    }
    computeCenterAvailability() {
        const renderer = this.renderer;
        if (!renderer || this.area.isEmpty || this.centerSlicesList.length === 0)
            return false;
        const visibility = this.visibility;
        if (visibility === "always")
            return true;
        if (visibility === "never")
            return false;
        if (visibility === "whenFits")
            return renderer.fits ? renderer.fits(this.area, this.centerSlicesList) : true;
        return this.currentStyle.holeRadiusRatio >= visibility.minHoleRatio;
    }
    /**
     * The area is a new instance only when the hole changes, as [centerArea] promises, so a renderer that
     * caches by identity keeps its work when only the style changes elsewhere.
     */
    updateCenterArea(cx, cy, radius) {
        const area = this.area;
        if (area.cx === cx && area.cy === cy && area.radius === radius)
            return;
        this.area = new CenterArea(cx, cy, radius);
        this.updateCenterAvailability();
    }
    // ------------------------------------------------------------------ Size and style
    /** The chart is the largest circle inside the box of [width] by [height], less [padding]. */
    setSize(width, height, padding = NO_PADDING) {
        this.width = width;
        this.height = height;
        this.padding = typeof padding === "number" ? { left: padding, top: padding, right: padding, bottom: padding } : padding;
        this.relayout();
    }
    /** Changes the style. It ends any running animation and jumps to the final layout. */
    setStyle(input) {
        this.currentStyle = applyStyle(this.currentStyle, input);
        this.relayout();
    }
    /** Renames the slice that stands for the grouped small slices, in place. */
    setOtherLabel(label) {
        if (label === this.otherLabelText)
            return;
        this.otherLabelText = label;
        this.syncGroups();
    }
    setAnimationConfig(config) {
        this.animation = {
            ...this.animation, ...config,
            revealDuration: Math.max(config.revealDuration ?? this.animation.revealDuration, 0),
            dataChangeDuration: Math.max(config.dataChangeDuration ?? this.animation.dataChangeDuration, 0),
        };
    }
    // ------------------------------------------------------------------ Data
    setData(input) {
        this.sourceData = toSlices(input);
        this.sourceTotal = totalOf(this.sourceData);
        this.showSource(true);
    }
    /** Removes all data, clears the selection, and shows the empty ring. */
    clearData() {
        this.sourceData = [];
        this.sourceTotal = totalOf([]);
        const wasExpanded = this.expanded;
        this.expanded = false;
        this.clearDisplayed();
        if (wasExpanded)
            this.onGroupExpandedChanged?.(false);
    }
    /** Expands the grouped small slices and selects the first of them, as a tap on the group does. */
    expandGroup() {
        this.setGroupExpanded(true);
    }
    /** Brings the expanded small slices back together and selects the first slice. */
    collapseGroup() {
        this.setGroupExpanded(false);
    }
    setGroupExpanded(expanded) {
        if (this.expanded === expanded)
            return;
        if (expanded && !this.groupingOf(this.sourceData).hasGroup)
            return;
        this.expanded = expanded;
        this.showSource(true);
        this.onGroupExpandedChanged?.(expanded);
        this.selectAfterGroupChange(expanded ? this.bandCount : 0);
    }
    /** Selects the slice at [index] of the dataset that the group's change has just put on the ring, at once. */
    selectAfterGroupChange(index) {
        const slice = this.dataset[index];
        if (!slice || !this.isSelectable(index))
            return;
        this.onSliceClick?.(slice);
        this.setSelected(index);
    }
    groupingOf(source) {
        if (!this.currentStyle.groupSmallSlices)
            return { slices: source, hasGroup: false, bandCount: 0 };
        return groupSlices(source, {
            gapDeg: this.currentStyle.visualGapDeg,
            expanded: this.expanded,
            otherColor: this.currentStyle.otherSliceColor,
            otherLabel: this.otherLabelText,
        });
    }
    /** Shows the data as it is grouped now; the change is animated when [animate] is true. */
    showSource(animate) {
        const grouping = this.groupingOf(this.sourceData);
        const groupGone = this.expanded && !grouping.hasGroup;
        if (groupGone)
            this.expanded = false;
        if (grouping.slices.length === 0)
            this.clearDisplayed();
        else
            this.showDisplayed([...grouping.slices], grouping.bandCount, animate);
        if (groupGone)
            this.onGroupExpandedChanged?.(false);
    }
    /** The slices to show depend on the gap and on the style, which change without new data: this follows them, at once. */
    syncGroups() {
        if (this.sourceData.length === 0)
            return;
        const grouping = this.groupingOf(this.sourceData);
        const groupGone = this.expanded && !grouping.hasGroup;
        if (groupGone)
            this.expanded = false;
        if (!sameSlices(grouping.slices, this.dataset) || grouping.bandCount !== this.bandCount) {
            this.showDisplayed([...grouping.slices], grouping.bandCount, false);
        }
        if (groupGone)
            this.onGroupExpandedChanged?.(false);
    }
    showDisplayed(clean, newBandCount, animate) {
        // The selection follows its slice into the new data, matched by the slice's key: it stays when the
        // slice is still there, even at another index, and is cleared when it is not. A selection requested
        // during an animation counts, and so does a request to deselect.
        const previous = this.dataset[this.selectedIndexRaw];
        const previousKey = previous ? sliceKey(previous) : undefined;
        const kept = this.dataset[this.pendingSelectedIndex ?? this.selectedIndexRaw];
        const keptKey = kept ? sliceKey(kept) : undefined;
        this.pendingSelectedIndex = null;
        if (this.dataset.length === 0) {
            // First data: every slice grows into place.
            this.dataset = clean;
            this.bandCount = newBandCount;
            this.renderList = clean;
            this.renderIndexMap = clean.map((_, i) => i);
            this.precomputeSegments();
            if (animate)
                this.animateIn();
            else
                this.animatedFractions.fill(1);
        }
        else if (animate) {
            // Existing data: morph from the current layout to the new one.
            this.startMorph(clean, newBandCount);
        }
        else {
            this.dataset = clean;
            this.bandCount = newBandCount;
            this.snapToFinalState();
        }
        this.rebuildSlices();
        this.selectedIndexRaw = keptKey === undefined ? -1 : clean.findIndex((slice) => sliceKey(slice) === keptKey);
        // A slice that is in the band can not be selected: the selection ends when its slice goes there.
        if (this.selectedIndexRaw >= 0 && this.selectedIndexRaw < newBandCount)
            this.selectedIndexRaw = -1;
        this.updateCenterAvailability();
        // Not a change of selection when the same slice stays selected, whatever its index or value.
        const nowSelected = clean[this.selectedIndexRaw];
        if ((nowSelected ? sliceKey(nowSelected) : undefined) !== previousKey)
            this.onSelectionChanged?.(this.selection);
        this.invalidate();
    }
    clearDisplayed() {
        this.revealAnimation = null;
        this.morphAnimation = null;
        this.dataset = [];
        this.bandCount = 0;
        this.renderList = [];
        this.renderIndexMap = [];
        this.morph = null;
        this.setSelected(-1);
        this.pendingSelectedIndex = null;
        this.resetSegments();
        this.rebuildSlices();
        this.updateCenterAvailability();
        this.invalidate();
    }
    // ------------------------------------------------------------------ Selection
    /** Whether the slice at [index] of the dataset can be selected: not the group's, nor one in the band. */
    isSelectable(index) {
        const slice = this.dataset[index];
        return slice !== undefined && index >= this.bandCount && slice.id !== OtherSliceId;
    }
    /** Selects the slice at [index] of [slices] (-1 clears the selection). While an animation runs, it is applied when it ends. */
    setSelectedIndex(index) {
        if (index !== -1 && (index < 0 || index >= this.dataset.length))
            return;
        if (index !== -1 && !this.isSelectable(index))
            return;
        if (this.isAnimating) {
            // Wait for the animation to be done.
            this.pendingSelectedIndex = index;
        }
        else {
            this.setSelected(index);
            this.invalidate();
        }
    }
    /** The selected index; changing it notifies the listener. */
    setSelected(index) {
        if (this.selectedIndexRaw === index)
            return;
        this.selectedIndexRaw = index;
        this.refreshCenter();
        this.onSelectionChanged?.(this.selection);
    }
    applyPendingSelection() {
        const pending = this.pendingSelectedIndex;
        if (pending === null)
            return;
        this.pendingSelectedIndex = null;
        if (pending === -1 || (pending >= 0 && pending < this.dataset.length && this.isSelectable(pending))) {
            this.setSelected(pending);
            this.invalidate();
        }
    }
    rebuildSlices() {
        // A slice is a share of the whole data, not of what is on the ring: with the group collapsed, one
        // slice stands for the small ones and takes its share of the big ones' angle.
        this.allSlices = this.dataset.map((data, index) => ({
            index, data, total: this.sourceTotal, fraction: shareOf(data.value, this.sourceTotal),
        }));
        this.centerSlicesList = this.allSlices.filter((slice) => this.isSelectable(slice.index));
    }
    // ------------------------------------------------------------------ Touch
    /**
     * A tap at ([x], [y]), in the chart's coordinates: selects the slice under it, opens the group of small
     * slices, or closes it from the arc of big ones. False when nothing was hit, or an animation runs (a tap
     * is not taken while the chart moves).
     */
    tap(x, y) {
        if (this.isAnimating)
            return false;
        const index = this.sliceIndexAt(x, y);
        if (index < 0)
            return false;
        this.activate(index);
        return true;
    }
    /**
     * What a tap on the slice at [index] of [slices] does: selects it, opens the group when it is the group's
     * slice, closes the group when it is in the band. For the keyboard and screen readers, which act on a
     * slice without a point; unlike a tap it is taken while the chart moves (a selection then waits for the end).
     */
    activate(index) {
        const clicked = this.dataset[index];
        if (!clicked)
            return;
        if (clicked.id === OtherSliceId)
            this.expandGroup();
        else if (index < this.bandCount)
            this.collapseGroup();
        else {
            this.onSliceClick?.(clicked);
            this.setSelectedIndex(index);
        }
    }
    /** The index in the dataset of the slice under ([x], [y]), or -1. */
    sliceIndexAt(x, y) {
        return sliceIndexAt({
            x, y, cx: this.cx, cy: this.cy,
            innerTouchBound: this.innerTouchBound, outerTouchBound: this.outerTouchBound,
            startAngleDeg: this.currentStyle.startAngleDeg, gapDeg: this.gapDeg,
            fullSweeps: this.fullSweeps, segStarts: this.segStarts, segEnds: this.segEnds,
            renderIndexMap: this.renderIndexMap, bandCount: this.bandCount,
        });
    }
    // ------------------------------------------------------------------ Time
    /** Moves the animations to [now] (ms). True while any is still running: call again next frame. */
    advance(now) {
        const fading = this.presenter.advance(now);
        for (const animation of [this.revealAnimation, this.morphAnimation]) {
            if (!animation)
                continue;
            const progress = animation.duration <= 0 ? 1 : Math.min(Math.max((now - animation.startedAt) / animation.duration, 0), 1);
            animation.update(animation.easing(progress));
            if (progress >= 1 && (animation === this.revealAnimation || animation === this.morphAnimation))
                animation.end();
        }
        return this.isAnimating || fading || this.presenter.isFading;
    }
    /** Entry animation: every slice grows from its start angle to its full sweep, all at once. */
    animateIn() {
        const animation = {
            startedAt: this.clock(),
            duration: this.animation.revealDuration,
            easing: this.animation.revealEasing,
            update: (progress) => {
                this.animatedFractions.fill(progress);
                this.invalidate();
            },
            end: () => {
                if (this.revealAnimation !== animation)
                    return;
                this.revealAnimation = null;
                this.applyPendingSelection();
                this.invalidate();
            },
        };
        this.revealAnimation = animation;
    }
    /**
     * Animates from the current visual state to [newData]; see [planMorph]. Start angles are recomputed
     * cumulatively every frame, so the pie is always complete.
     */
    startMorph(newData, newBandCount) {
        // 1. Snapshot the CURRENT visual state before any cancellation runs.
        const oldRender = this.renderList;
        const oldMap = this.renderIndexMap;
        const oldSweeps = [...this.fullSweeps];
        const oldBand = [...this.bandWeights];
        const fractionSeed = this.animatedFractions[0] ?? 1;
        const fromGap = this.gapDeg;
        this.revealAnimation = null;
        this.morphAnimation = null;
        // 2. Final enforced layout of the new dataset.
        this.dataset = newData;
        this.bandCount = newBandCount;
        this.total = totalOf(newData);
        const { ensureRenderableSlices, visualGapDeg } = this.currentStyle;
        const toGap = computeGapDeg(gapSliceCount(newData.length, newBandCount), visualGapDeg, ensureRenderableSlices);
        const targetSweeps = computeTargetSweeps(newData, this.total, toGap, ensureRenderableSlices, newBandCount, EXPANDED_BAND_SWEEP_DEG);
        // 3. Plan the animation. The gap moves from what is on screen now to the final gap, so it does not
        //    jump when the animation ends.
        const plan = planMorph(oldRender, oldMap, oldSweeps, newData, targetSweeps, fractionSeed, fromGap, toGap, oldBand, newBandCount);
        this.morph = plan;
        this.renderList = [...plan.renderList];
        this.renderIndexMap = [...plan.renderIndexMap];
        this.allocateSegmentArrays(plan.renderList.length);
        if (plan.isVisuallyIdentical) {
            // The layout is identical (a color-only change): there is nothing to animate.
            this.finishMorph();
            return;
        }
        // Ensure a valid first frame exists.
        this.applyMorphProgress(0);
        const animation = {
            startedAt: this.clock(),
            duration: this.animation.dataChangeDuration,
            easing: this.animation.dataChangeEasing,
            update: (progress) => this.applyMorphProgress(progress),
            end: () => {
                if (this.morphAnimation === animation)
                    this.finishMorph();
            },
        };
        this.morphAnimation = animation;
    }
    /** Moves the render layout, the gap and the reveal fraction to [progress] of the running morph. */
    applyMorphProgress(progress) {
        const morph = this.morph;
        if (!morph)
            return;
        for (let i = 0; i < this.fullSweeps.length; i++) {
            this.fullSweeps[i] = morph.sweepAt(i, progress);
            this.bandWeights[i] = morph.bandAt(i, progress);
        }
        this.animatedFractions.fill(morph.fractionAt(progress));
        this.gapDeg = morph.gapAt(progress);
        this.syncInnerGapDeg();
        this.applyAnglesToSegments();
        this.invalidate();
    }
    /** Restores the steady state: renderList == dataset, final layout, fully revealed. */
    finishMorph() {
        this.morphAnimation = null;
        this.morph = null;
        this.renderList = this.dataset;
        this.renderIndexMap = this.dataset.map((_, i) => i);
        if (this.dataset.length === 0) {
            this.resetSegments();
            this.applyPendingSelection();
            this.invalidate();
            return;
        }
        this.precomputeSegments();
        this.animatedFractions.fill(1); // after precompute: it may reallocate the array
        this.applyPendingSelection();
        this.invalidate();
    }
    /** Immediately ends all running animations, jumps to the final layout, and applies any pending selection. */
    snapToFinalState() {
        this.morphAnimation = null;
        this.revealAnimation = null;
        this.morph = null;
        if (this.dataset.length > 0) {
            this.renderList = this.dataset;
            this.renderIndexMap = this.dataset.map((_, i) => i);
            this.precomputeSegments();
            this.animatedFractions.fill(1);
        }
        else {
            this.resetSegments();
        }
        this.applyPendingSelection();
        this.invalidate();
    }
    // ------------------------------------------------------------------ Layout
    /** New bounds, the slices to show for them, and the final layout. */
    relayout() {
        this.calculateBounds();
        this.syncGroups();
        this.snapToFinalState();
    }
    calculateBounds() {
        const { left, top, right, bottom } = this.padding;
        const availableWidth = Math.max(this.width - left - right, 0);
        const availableHeight = Math.max(this.height - top - bottom, 0);
        if (availableWidth <= 0 || availableHeight <= 0) {
            // There is no room for a chart: draw nothing and take no touches.
            this.ring = { cx: this.cx, cy: this.cy, outerRadius: 0, innerRadius: 0 };
            this.shadowRing = this.ring;
            this.innerTouchBound = 1;
            this.outerTouchBound = 0;
            this.updateCenterArea(this.cx, this.cy, 0);
            return;
        }
        this.cx = left + availableWidth / 2;
        this.cy = top + availableHeight / 2;
        const outerRadius = Math.min(availableWidth, availableHeight) / 2;
        const innerRadius = outerRadius * this.currentStyle.holeRadiusRatio;
        const thickness = Math.max(outerRadius - innerRadius, 0);
        // A size given in dp becomes its ratio (or degrees) here, for the chart's size now, and the chart draws
        // with that: the corners are a share of half the thickness, the shadow offset a share of the hole's
        // radius, and the gap an angle on the outer edge.
        const style = this.currentStyle;
        if (style.cornerRadiusDp !== null)
            style.cornerRadiusRatio = ratioOfPx(style.cornerRadiusDp * this.density, thickness / 2);
        if (style.selectedShadowOffsetDp !== null) {
            style.selectedShadowOffsetRatio = ratioOfPx(style.selectedShadowOffsetDp * this.density, innerRadius);
        }
        if (style.visualGapDp !== null)
            style.visualGapDeg = degreesOfArc(style.visualGapDp * this.density, outerRadius);
        this.ring = { cx: this.cx, cy: this.cy, outerRadius, innerRadius };
        this.shadowRing = shadowRingOf(this.ring, style.selectedShadowOffsetRatio);
        this.innerTouchBound = innerRadius - this.touchPadding;
        this.outerTouchBound = outerRadius + this.touchPadding;
        this.updateCenterArea(this.cx, this.cy, innerRadius);
    }
    precomputeSegments() {
        if (this.dataset.length === 0) {
            this.resetSegments();
            return;
        }
        this.total = totalOf(this.dataset);
        this.allocateSegmentArrays(this.renderList.length);
        for (let i = 0; i < this.bandWeights.length; i++)
            this.bandWeights[i] = i < this.bandCount ? 1 : 0;
        this.computeSegmentBounds();
    }
    resetSegments() {
        this.total = totalOf([]);
        this.gapDeg = 0;
        this.innerGapDeg = 0;
        this.fullSweeps = [];
        this.segStarts = [];
        this.segEnds = [];
        this.animatedFractions = [];
        this.bandWeights = [];
    }
    /** Only reallocates if the size has changed; when it matches, the previous contents (the reveal fractions among them) stay. */
    allocateSegmentArrays(size) {
        if (this.fullSweeps.length === size)
            return;
        this.fullSweeps = new Array(size).fill(0);
        this.segStarts = new Array(size).fill(0);
        this.segEnds = new Array(size).fill(0);
        this.animatedFractions = new Array(size).fill(0);
        this.bandWeights = new Array(size).fill(0);
    }
    computeSegmentBounds() {
        if (this.dataset.length === 0)
            return;
        const { ensureRenderableSlices, visualGapDeg } = this.currentStyle;
        this.gapDeg = computeGapDeg(gapSliceCount(this.dataset.length, this.bandCount), visualGapDeg, ensureRenderableSlices);
        const sweeps = computeTargetSweeps(this.dataset, this.total, this.gapDeg, ensureRenderableSlices, this.bandCount, EXPANDED_BAND_SWEEP_DEG);
        for (let i = 0; i < sweeps.length; i++)
            this.fullSweeps[i] = sweeps[i];
        this.syncInnerGapDeg();
        this.applyAnglesToSegments();
    }
    /** The inner angular gap that goes with the gap. */
    syncInnerGapDeg() {
        this.innerGapDeg = computeInnerGapDeg(this.gapDeg, this.currentStyle.holeRadiusRatio, this.ring.innerRadius, this.fullSweeps.length > 0);
    }
    applyAnglesToSegments() {
        let cursor = 0;
        for (let i = 0; i < this.fullSweeps.length; i++) {
            this.segStarts[i] = cursor;
            cursor += this.fullSweeps[i];
            this.segEnds[i] = cursor;
        }
    }
    // ------------------------------------------------------------------ Drawing
    /** The details of the selected slice, while there are any to show. */
    centerScene() {
        const renderer = this.renderer;
        const slice = this.presenter.displayed;
        const alpha = this.presenter.alpha;
        if (!renderer || !slice || alpha <= 0 || this.area.isEmpty)
            return null;
        return { opacity: alpha, nodes: renderer.render(this.area, slice, this.centerSlicesList) };
    }
    /** What to draw now. */
    frame() {
        return {
            width: this.width, height: this.height, ring: this.ring, shadowRing: this.shadowRing, style: this.currentStyle,
            hasData: this.dataset.length > 0, renderList: this.renderList, renderIndexMap: this.renderIndexMap,
            fullSweeps: this.fullSweeps, animatedFractions: this.animatedFractions, bandWeights: this.bandWeights,
            gapDeg: this.gapDeg, innerGapDeg: this.innerGapDeg, selectedIndex: this.selectedIndexRaw,
            center: this.centerScene(),
        };
    }
    scene() {
        return buildScene(this.frame());
    }
    invalidate() {
        this.onInvalidate?.();
    }
}
