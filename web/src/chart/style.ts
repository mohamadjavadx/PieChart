import { clamp, MAX_DEG } from "../core/math.ts";
import { DEFAULT_EASING, type Easing } from "./easing.ts";

/**
 * How the chart looks. Every option is a fraction from 0 to 1, an angle in degrees or a length in CSS px
 * (which is what "dp" is on the web), and the defaults are the Android library's.
 *
 * The corner radius, the shadow offset and the gap can each be a ratio (the gap: degrees) or a size in dp,
 * on their own. A size in dp stays that size when the chart is resized; the chart works out the ratio
 * from it, every time it is laid out, and the ratio holds the result. The dp field is null while the
 * setting is a ratio.
 */
export interface ChartStyle {
  /** The gap between slices, in degrees; when [visualGapDp] is set, what it is worth on the outer edge. */
  visualGapDeg: number;
  visualGapDp: number | null;
  /** Where the first slice starts; -90 is 12 o'clock. */
  startAngleDeg: number;
  /** How much the selected slice, and every slice while none is selected, is dimmed: 0 not at all, 1 until it is invisible. */
  selectedDim: number;
  /** How much the slices that are not selected are dimmed, while another slice is. */
  unselectedDim: number;
  /** How much the selected slice's shadow is faded; 1 turns it off. */
  selectedShadowDim: number;
  /** How far the shadow is shifted toward the hole, as a share of the hole's radius. */
  selectedShadowOffsetRatio: number;
  selectedShadowOffsetDp: number | null;
  /** The hole, as a share of the chart's radius. */
  holeRadiusRatio: number;
  /** The corner radius as a share of half the ring's thickness. */
  cornerRadiusRatio: number;
  cornerRadiusDp: number | null;
  /** Never draw a slice smaller than the gap plus 1°: the larger slices give up the difference. */
  ensureRenderableSlices: boolean;
  roundInnerCorners: boolean;
  /** Merge the slices that are too small to see into one that opens on tap. */
  groupSmallSlices: boolean;
  otherSliceColor: string;
  /** How much the big slices are dimmed while the group is expanded. */
  mainSliceDim: number;
  /** The color of the empty ring, drawn when there is no data. */
  disabledColor: string;
}

/** What [ChartStyle] takes when changed: any of its options, but not both units of one setting. */
export type StyleInput = Partial<Omit<ChartStyle, "visualGapDp" | "selectedShadowOffsetDp" | "cornerRadiusDp">> & {
  visualGapDp?: number;
  selectedShadowOffsetDp?: number;
  cornerRadiusDp?: number;
};

export const DEFAULT_STYLE: Readonly<ChartStyle> = {
  visualGapDeg: 1,
  visualGapDp: null,
  startAngleDeg: -90,
  selectedDim: 0,
  unselectedDim: 0.6,
  selectedShadowDim: 0.8,
  selectedShadowOffsetRatio: 0.06,
  selectedShadowOffsetDp: null,
  holeRadiusRatio: 0.85,
  cornerRadiusRatio: 0.5,
  cornerRadiusDp: null,
  ensureRenderableSlices: true,
  roundInnerCorners: true,
  groupSmallSlices: false,
  otherSliceColor: "#8A93A6",
  mainSliceDim: 0.6,
  disabledColor: "#CCCCCC",
};

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);

/**
 * The style after [input] is applied to [current]. A number that is not finite counts as not given, a
 * setting that is not given keeps the unit it has, a unit that is given replaces the one it had, and a
 * setting given in both units is an error.
 */
export function applyStyle(current: Readonly<ChartStyle>, input: StyleInput): ChartStyle {
  if (input.visualGapDeg !== undefined && input.visualGapDp !== undefined) {
    throw new TypeError("Give the gap in degrees or in dp, not both.");
  }
  if (input.selectedShadowOffsetRatio !== undefined && input.selectedShadowOffsetDp !== undefined) {
    throw new TypeError("Give the shadow offset as a ratio or in dp, not both.");
  }
  if (input.cornerRadiusRatio !== undefined && input.cornerRadiusDp !== undefined) {
    throw new TypeError("Give the corner radius as a ratio or in dp, not both.");
  }

  const next: ChartStyle = { ...current };
  if (finite(input.visualGapDeg)) {
    next.visualGapDeg = clamp(input.visualGapDeg, 0, MAX_DEG);
    next.visualGapDp = null;
  }
  if (finite(input.visualGapDp)) next.visualGapDp = Math.max(input.visualGapDp, 0);
  if (finite(input.selectedShadowOffsetRatio)) {
    next.selectedShadowOffsetRatio = clamp(input.selectedShadowOffsetRatio, 0, 1);
    next.selectedShadowOffsetDp = null;
  }
  if (finite(input.selectedShadowOffsetDp)) next.selectedShadowOffsetDp = Math.max(input.selectedShadowOffsetDp, 0);
  if (finite(input.cornerRadiusRatio)) {
    next.cornerRadiusRatio = clamp(input.cornerRadiusRatio, 0, 1);
    next.cornerRadiusDp = null;
  }
  if (finite(input.cornerRadiusDp)) next.cornerRadiusDp = Math.max(input.cornerRadiusDp, 0);

  if (finite(input.startAngleDeg)) next.startAngleDeg = input.startAngleDeg;
  if (finite(input.holeRadiusRatio)) next.holeRadiusRatio = clamp(input.holeRadiusRatio, 0, 1);
  if (finite(input.selectedDim)) next.selectedDim = clamp(input.selectedDim, 0, 1);
  if (finite(input.unselectedDim)) next.unselectedDim = clamp(input.unselectedDim, 0, 1);
  if (finite(input.selectedShadowDim)) next.selectedShadowDim = clamp(input.selectedShadowDim, 0, 1);
  if (finite(input.mainSliceDim)) next.mainSliceDim = clamp(input.mainSliceDim, 0, 1);
  if (input.ensureRenderableSlices !== undefined) next.ensureRenderableSlices = input.ensureRenderableSlices;
  if (input.roundInnerCorners !== undefined) next.roundInnerCorners = input.roundInnerCorners;
  if (input.groupSmallSlices !== undefined) next.groupSmallSlices = input.groupSmallSlices;
  if (input.otherSliceColor !== undefined) next.otherSliceColor = input.otherSliceColor;
  if (input.disabledColor !== undefined) next.disabledColor = input.disabledColor;
  return next;
}

/** How long the animations take, and how they ease. */
export interface AnimationConfig {
  /** The entry animation: the first data grows into place, in ms. */
  revealDuration: number;
  revealEasing: Easing;
  /** A change of data, in ms. */
  dataChangeDuration: number;
  dataChangeEasing: Easing;
}

export const DEFAULT_ANIMATION: Readonly<AnimationConfig> = {
  revealDuration: 600,
  revealEasing: DEFAULT_EASING,
  dataChangeDuration: 600,
  dataChangeEasing: DEFAULT_EASING,
};
