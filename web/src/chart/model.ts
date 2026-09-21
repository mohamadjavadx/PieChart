import type { Decimal } from "../core/decimal.ts";
import { groupSlices, EXPANDED_BAND_SWEEP_DEG, type Grouping } from "../core/grouping.ts";
import { gapSliceCount, shadowRingOf } from "../core/layout.ts";
import { Morph, planMorph, sliceKey } from "../core/morph.ts";
import type { Ring } from "../core/ringPath.ts";
import {
  computeGapDeg, computeInnerGapDeg, computeTargetSweeps, degreesOfArc, ratioOfPx, sliceIndexAt,
} from "../core/sliceMath.ts";
import { shareOf, toSlices, totalOf } from "../core/slices.ts";
import { OtherSliceId, type Slice, type SliceInput } from "../core/types.ts";
import { buildScene, type FrameState, type Scene } from "./scene.ts";
import {
  applyStyle, DEFAULT_ANIMATION, DEFAULT_STYLE, type AnimationConfig, type ChartStyle, type StyleInput,
} from "./style.ts";
import type { Easing } from "./easing.ts";

// The state of a chart: its data, what is selected, whether small slices are grouped and open, and the
// animations between one state and the next. A port of the Android library's PieChartView, with the view
// taken out: time comes in through advance(), and what to draw goes out as a Scene.

/** The slice that is selected, as the chart reports it. */
export interface SelectedSlice {
  /** The slice's place in [ChartModel.dataset]. */
  readonly index: number;
  readonly data: Slice;
  /** The sum of all the values that the chart was given, exact; also while small slices are grouped. */
  readonly total: Decimal;
  /** The slice's share of all the data given to the chart, 0..1; only for drawing and rounding. */
  readonly fraction: number;
}

/** The space around the chart, in px. */
export interface Padding {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ChartModelOptions {
  style?: StyleInput;
  animation?: Partial<AnimationConfig>;
  /** The time in ms; animations are measured with it. Defaults to `performance.now()`. */
  clock?: () => number;
  /** How many px a dp is: 1 on the web. */
  density?: number;
  /** How far outside the ring, and inside the hole, a tap still counts, in px. */
  touchPadding?: number;
}

interface RunningAnimation {
  readonly startedAt: number;
  readonly duration: number;
  readonly easing: Easing;
  readonly update: (progress: number) => void;
  readonly end: () => void;
}

const NO_PADDING: Padding = { left: 0, top: 0, right: 0, bottom: 0 };

const sameSlices = (a: readonly Slice[], b: readonly Slice[]): boolean =>
  a.length === b.length &&
  a.every((slice, i) => {
    const other = b[i]!;
    return slice.id === other.id && slice.label === other.label && slice.color === other.color && slice.value.compareTo(other.value) === 0;
  });

export class ChartModel {
  onSelectionChanged: ((selection: SelectedSlice | null) => void) | null = null;
  /** Called with the slice that a tap selects, before it is selected. */
  onSliceClick: ((slice: Slice) => void) | null = null;
  onGroupExpandedChanged: ((isExpanded: boolean) => void) | null = null;
  /** Called whenever what is drawn has changed. */
  onInvalidate: (() => void) | null = null;

  private currentStyle: ChartStyle = { ...DEFAULT_STYLE };
  private animation: AnimationConfig = { ...DEFAULT_ANIMATION };
  private readonly clock: () => number;
  private readonly density: number;
  private readonly touchPadding: number;

  // The box, and the ring in it.
  private width = 0;
  private height = 0;
  private padding: Padding = NO_PADDING;
  private cx = 0;
  private cy = 0;
  private ring: Ring = { cx: 0, cy: 0, outerRadius: 0, innerRadius: 0 };
  private shadowRing: Ring = this.ring;
  private innerTouchBound = 1;
  private outerTouchBound = 0;

  // What the chart was given, and what it shows for it.
  private sourceData: Slice[] = [];
  private sourceTotal: Decimal = totalOf([]);
  private dataset: Slice[] = [];
  private bandCount = 0;
  private expanded = false;
  private selectedIndexRaw = -1;
  private pendingSelectedIndex: number | null = null;

  // What is drawn: the dataset plus leaving slices, and where and how much of each.
  private renderList: Slice[] = [];
  private renderIndexMap: number[] = [];
  private morph: Morph | null = null;
  private revealAnimation: RunningAnimation | null = null;
  private morphAnimation: RunningAnimation | null = null;
  private total: Decimal = totalOf([]);
  private gapDeg = 0;
  private innerGapDeg = 0;
  private fullSweeps: number[] = [];
  private segStarts: number[] = [];
  private segEnds: number[] = [];
  private animatedFractions: number[] = [];
  private bandWeights: number[] = [];

  private allSlices: SelectedSlice[] = [];
  private centerSlicesList: SelectedSlice[] = [];

  constructor(options: ChartModelOptions = {}) {
    this.clock = options.clock ?? (() => performance.now());
    this.density = options.density ?? 1;
    this.touchPadding = options.touchPadding ?? 8;
    if (options.animation) this.animation = { ...this.animation, ...options.animation };
    if (options.style) this.currentStyle = applyStyle(this.currentStyle, options.style);
  }

  // ------------------------------------------------------------------ Reading

  get style(): Readonly<ChartStyle> {
    return this.currentStyle;
  }

  /** The slices as they are shown: with small slices grouped, the one that stands for them is in it. */
  get slices(): readonly Slice[] {
    return this.dataset;
  }

  /** How many of the first slices of [slices] are the big ones of an expanded group, which share a band. */
  get band(): number {
    return this.bandCount;
  }

  get isGroupExpanded(): boolean {
    return this.expanded;
  }

  get selectedIndex(): number {
    return this.selectedIndexRaw;
  }

  get selection(): SelectedSlice | null {
    return this.allSlices[this.selectedIndexRaw] ?? null;
  }

  /** The slices that a center renderer sees: those that can be selected. */
  get selectableSlices(): readonly SelectedSlice[] {
    return this.centerSlicesList;
  }

  get isAnimating(): boolean {
    return this.morphAnimation !== null || this.revealAnimation !== null;
  }

  /** The hole, for content that is placed over the chart. */
  get hole(): { readonly cx: number; readonly cy: number; readonly radius: number } {
    return { cx: this.ring.cx, cy: this.ring.cy, radius: this.ring.innerRadius };
  }

  // ------------------------------------------------------------------ Size and style

  /** The chart is the largest circle inside the box of [width] by [height], less [padding]. */
  setSize(width: number, height: number, padding: Padding | number = NO_PADDING): void {
    this.width = width;
    this.height = height;
    this.padding = typeof padding === "number" ? { left: padding, top: padding, right: padding, bottom: padding } : padding;
    this.relayout();
  }

  /** Changes the style. It ends any running animation and jumps to the final layout. */
  setStyle(input: StyleInput): void {
    this.currentStyle = applyStyle(this.currentStyle, input);
    this.relayout();
  }

  setAnimationConfig(config: Partial<AnimationConfig>): void {
    this.animation = {
      ...this.animation, ...config,
      revealDuration: Math.max(config.revealDuration ?? this.animation.revealDuration, 0),
      dataChangeDuration: Math.max(config.dataChangeDuration ?? this.animation.dataChangeDuration, 0),
    };
  }

  // ------------------------------------------------------------------ Data

  setData(input: readonly SliceInput[]): void {
    this.sourceData = toSlices(input);
    this.sourceTotal = totalOf(this.sourceData);
    this.showSource(true);
  }

  /** Removes all data, clears the selection, and shows the empty ring. */
  clearData(): void {
    this.sourceData = [];
    this.sourceTotal = totalOf([]);
    const wasExpanded = this.expanded;
    this.expanded = false;
    this.clearDisplayed();
    if (wasExpanded) this.onGroupExpandedChanged?.(false);
  }

  /** Expands the grouped small slices and selects the first of them, as a tap on the group does. */
  expandGroup(): void {
    this.setGroupExpanded(true);
  }

  /** Brings the expanded small slices back together and selects the first slice. */
  collapseGroup(): void {
    this.setGroupExpanded(false);
  }

  private setGroupExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return;
    if (expanded && !this.groupingOf(this.sourceData).hasGroup) return;
    this.expanded = expanded;
    this.showSource(true);
    this.onGroupExpandedChanged?.(expanded);
    this.selectAfterGroupChange(expanded ? this.bandCount : 0);
  }

  /** Selects the slice at [index] of the dataset that the group's change has just put on the ring, at once. */
  private selectAfterGroupChange(index: number): void {
    const slice = this.dataset[index];
    if (!slice || !this.isSelectable(index)) return;
    this.onSliceClick?.(slice);
    this.setSelected(index);
  }

  private groupingOf(source: readonly Slice[]): Grouping {
    if (!this.currentStyle.groupSmallSlices) return { slices: source, hasGroup: false, bandCount: 0 };
    return groupSlices(source, {
      gapDeg: this.currentStyle.visualGapDeg,
      expanded: this.expanded,
      otherColor: this.currentStyle.otherSliceColor,
    });
  }

  /** Shows the data as it is grouped now; the change is animated when [animate] is true. */
  private showSource(animate: boolean): void {
    const grouping = this.groupingOf(this.sourceData);
    const groupGone = this.expanded && !grouping.hasGroup;
    if (groupGone) this.expanded = false;
    if (grouping.slices.length === 0) this.clearDisplayed();
    else this.showDisplayed([...grouping.slices], grouping.bandCount, animate);
    if (groupGone) this.onGroupExpandedChanged?.(false);
  }

  /** The slices to show depend on the gap and on the style, which change without new data: this follows them, at once. */
  private syncGroups(): void {
    if (this.sourceData.length === 0) return;
    const grouping = this.groupingOf(this.sourceData);
    const groupGone = this.expanded && !grouping.hasGroup;
    if (groupGone) this.expanded = false;
    if (!sameSlices(grouping.slices, this.dataset) || grouping.bandCount !== this.bandCount) {
      this.showDisplayed([...grouping.slices], grouping.bandCount, false);
    }
    if (groupGone) this.onGroupExpandedChanged?.(false);
  }

  private showDisplayed(clean: Slice[], newBandCount: number, animate: boolean): void {
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
      if (animate) this.animateIn();
      else this.animatedFractions.fill(1);
    } else if (animate) {
      // Existing data: morph from the current layout to the new one.
      this.startMorph(clean, newBandCount);
    } else {
      this.dataset = clean;
      this.bandCount = newBandCount;
      this.snapToFinalState();
    }

    this.rebuildSlices();
    this.selectedIndexRaw = keptKey === undefined ? -1 : clean.findIndex((slice) => sliceKey(slice) === keptKey);
    // A slice that is in the band can not be selected: the selection ends when its slice goes there.
    if (this.selectedIndexRaw >= 0 && this.selectedIndexRaw < newBandCount) this.selectedIndexRaw = -1;
    // Not a change of selection when the same slice stays selected, whatever its index or value.
    const nowSelected = clean[this.selectedIndexRaw];
    if ((nowSelected ? sliceKey(nowSelected) : undefined) !== previousKey) this.onSelectionChanged?.(this.selection);
    this.invalidate();
  }

  private clearDisplayed(): void {
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
    this.invalidate();
  }

  // ------------------------------------------------------------------ Selection

  /** Whether the slice at [index] of the dataset can be selected: not the group's, nor one in the band. */
  private isSelectable(index: number): boolean {
    const slice = this.dataset[index];
    return slice !== undefined && index >= this.bandCount && slice.id !== OtherSliceId;
  }

  /** Selects the slice at [index] of [slices] (-1 clears the selection). While an animation runs, it is applied when it ends. */
  setSelectedIndex(index: number): void {
    if (index !== -1 && (index < 0 || index >= this.dataset.length)) return;
    if (index !== -1 && !this.isSelectable(index)) return;
    if (this.isAnimating) {
      // Wait for the animation to be done.
      this.pendingSelectedIndex = index;
    } else {
      this.setSelected(index);
      this.invalidate();
    }
  }

  /** The selected index; changing it notifies the listener. */
  private setSelected(index: number): void {
    if (this.selectedIndexRaw === index) return;
    this.selectedIndexRaw = index;
    this.onSelectionChanged?.(this.selection);
  }

  private applyPendingSelection(): void {
    const pending = this.pendingSelectedIndex;
    if (pending === null) return;
    this.pendingSelectedIndex = null;
    if (pending === -1 || (pending >= 0 && pending < this.dataset.length && this.isSelectable(pending))) {
      this.setSelected(pending);
      this.invalidate();
    }
  }

  private rebuildSlices(): void {
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
  tap(x: number, y: number): boolean {
    if (this.isAnimating) return false;
    const index = this.sliceIndexAt(x, y);
    if (index < 0) return false;
    const clicked = this.dataset[index]!;
    if (clicked.id === OtherSliceId) this.expandGroup();
    else if (index < this.bandCount) this.collapseGroup();
    else {
      this.onSliceClick?.(clicked);
      this.setSelectedIndex(index);
    }
    return true;
  }

  /** The index in the dataset of the slice under ([x], [y]), or -1. */
  sliceIndexAt(x: number, y: number): number {
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
  advance(now: number): boolean {
    for (const animation of [this.revealAnimation, this.morphAnimation]) {
      if (!animation) continue;
      const progress = animation.duration <= 0 ? 1 : Math.min(Math.max((now - animation.startedAt) / animation.duration, 0), 1);
      animation.update(animation.easing(progress));
      if (progress >= 1 && (animation === this.revealAnimation || animation === this.morphAnimation)) animation.end();
    }
    return this.isAnimating;
  }

  /** Entry animation: every slice grows from its start angle to its full sweep, all at once. */
  private animateIn(): void {
    const animation: RunningAnimation = {
      startedAt: this.clock(),
      duration: this.animation.revealDuration,
      easing: this.animation.revealEasing,
      update: (progress) => {
        this.animatedFractions.fill(progress);
        this.invalidate();
      },
      end: () => {
        if (this.revealAnimation !== animation) return;
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
  private startMorph(newData: Slice[], newBandCount: number): void {
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
    const animation: RunningAnimation = {
      startedAt: this.clock(),
      duration: this.animation.dataChangeDuration,
      easing: this.animation.dataChangeEasing,
      update: (progress) => this.applyMorphProgress(progress),
      end: () => {
        if (this.morphAnimation === animation) this.finishMorph();
      },
    };
    this.morphAnimation = animation;
  }

  /** Moves the render layout, the gap and the reveal fraction to [progress] of the running morph. */
  private applyMorphProgress(progress: number): void {
    const morph = this.morph;
    if (!morph) return;
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
  private finishMorph(): void {
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
  private snapToFinalState(): void {
    this.morphAnimation = null;
    this.revealAnimation = null;
    this.morph = null;

    if (this.dataset.length > 0) {
      this.renderList = this.dataset;
      this.renderIndexMap = this.dataset.map((_, i) => i);
      this.precomputeSegments();
      this.animatedFractions.fill(1);
    } else {
      this.resetSegments();
    }

    this.applyPendingSelection();
    this.invalidate();
  }

  // ------------------------------------------------------------------ Layout

  /** New bounds, the slices to show for them, and the final layout. */
  private relayout(): void {
    this.calculateBounds();
    this.syncGroups();
    this.snapToFinalState();
  }

  private calculateBounds(): void {
    const { left, top, right, bottom } = this.padding;
    const availableWidth = Math.max(this.width - left - right, 0);
    const availableHeight = Math.max(this.height - top - bottom, 0);

    if (availableWidth <= 0 || availableHeight <= 0) {
      // There is no room for a chart: draw nothing and take no touches.
      this.ring = { cx: this.cx, cy: this.cy, outerRadius: 0, innerRadius: 0 };
      this.shadowRing = this.ring;
      this.innerTouchBound = 1;
      this.outerTouchBound = 0;
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
    if (style.cornerRadiusDp !== null) style.cornerRadiusRatio = ratioOfPx(style.cornerRadiusDp * this.density, thickness / 2);
    if (style.selectedShadowOffsetDp !== null) {
      style.selectedShadowOffsetRatio = ratioOfPx(style.selectedShadowOffsetDp * this.density, innerRadius);
    }
    if (style.visualGapDp !== null) style.visualGapDeg = degreesOfArc(style.visualGapDp * this.density, outerRadius);

    this.ring = { cx: this.cx, cy: this.cy, outerRadius, innerRadius };
    this.shadowRing = shadowRingOf(this.ring, style.selectedShadowOffsetRatio);
    this.innerTouchBound = innerRadius - this.touchPadding;
    this.outerTouchBound = outerRadius + this.touchPadding;
  }

  private precomputeSegments(): void {
    if (this.dataset.length === 0) {
      this.resetSegments();
      return;
    }
    this.total = totalOf(this.dataset);
    this.allocateSegmentArrays(this.renderList.length);
    for (let i = 0; i < this.bandWeights.length; i++) this.bandWeights[i] = i < this.bandCount ? 1 : 0;
    this.computeSegmentBounds();
  }

  private resetSegments(): void {
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
  private allocateSegmentArrays(size: number): void {
    if (this.fullSweeps.length === size) return;
    this.fullSweeps = new Array<number>(size).fill(0);
    this.segStarts = new Array<number>(size).fill(0);
    this.segEnds = new Array<number>(size).fill(0);
    this.animatedFractions = new Array<number>(size).fill(0);
    this.bandWeights = new Array<number>(size).fill(0);
  }

  private computeSegmentBounds(): void {
    if (this.dataset.length === 0) return;
    const { ensureRenderableSlices, visualGapDeg } = this.currentStyle;
    this.gapDeg = computeGapDeg(gapSliceCount(this.dataset.length, this.bandCount), visualGapDeg, ensureRenderableSlices);
    const sweeps = computeTargetSweeps(this.dataset, this.total, this.gapDeg, ensureRenderableSlices, this.bandCount, EXPANDED_BAND_SWEEP_DEG);
    for (let i = 0; i < sweeps.length; i++) this.fullSweeps[i] = sweeps[i]!;
    this.syncInnerGapDeg();
    this.applyAnglesToSegments();
  }

  /** The inner angular gap that goes with the gap. */
  private syncInnerGapDeg(): void {
    this.innerGapDeg = computeInnerGapDeg(this.gapDeg, this.currentStyle.holeRadiusRatio, this.ring.innerRadius, this.fullSweeps.length > 0);
  }

  private applyAnglesToSegments(): void {
    let cursor = 0;
    for (let i = 0; i < this.fullSweeps.length; i++) {
      this.segStarts[i] = cursor;
      cursor += this.fullSweeps[i]!;
      this.segEnds[i] = cursor;
    }
  }

  // ------------------------------------------------------------------ Drawing

  /** What to draw now. */
  frame(): FrameState {
    return {
      width: this.width, height: this.height, ring: this.ring, shadowRing: this.shadowRing, style: this.currentStyle,
      hasData: this.dataset.length > 0, renderList: this.renderList, renderIndexMap: this.renderIndexMap,
      fullSweeps: this.fullSweeps, animatedFractions: this.animatedFractions, bandWeights: this.bandWeights,
      gapDeg: this.gapDeg, innerGapDeg: this.innerGapDeg, selectedIndex: this.selectedIndexRaw,
    };
  }

  scene(): Scene {
    return buildScene(this.frame());
  }

  private invalidate(): void {
    this.onInvalidate?.();
  }
}
