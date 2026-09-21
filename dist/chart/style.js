import { clamp, MAX_DEG } from "../core/math.js";
import { DEFAULT_EASING } from "./easing.js";
export const DEFAULT_STYLE = {
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
const finite = (value) => value !== undefined && Number.isFinite(value);
/**
 * The style after [input] is applied to [current]. A number that is not finite counts as not given, a
 * setting that is not given keeps the unit it has, a unit that is given replaces the one it had, and a
 * setting given in both units is an error.
 */
export function applyStyle(current, input) {
    if (input.visualGapDeg !== undefined && input.visualGapDp !== undefined) {
        throw new TypeError("Give the gap in degrees or in dp, not both.");
    }
    if (input.selectedShadowOffsetRatio !== undefined && input.selectedShadowOffsetDp !== undefined) {
        throw new TypeError("Give the shadow offset as a ratio or in dp, not both.");
    }
    if (input.cornerRadiusRatio !== undefined && input.cornerRadiusDp !== undefined) {
        throw new TypeError("Give the corner radius as a ratio or in dp, not both.");
    }
    const next = { ...current };
    if (finite(input.visualGapDeg)) {
        next.visualGapDeg = clamp(input.visualGapDeg, 0, MAX_DEG);
        next.visualGapDp = null;
    }
    if (finite(input.visualGapDp))
        next.visualGapDp = Math.max(input.visualGapDp, 0);
    if (finite(input.selectedShadowOffsetRatio)) {
        next.selectedShadowOffsetRatio = clamp(input.selectedShadowOffsetRatio, 0, 1);
        next.selectedShadowOffsetDp = null;
    }
    if (finite(input.selectedShadowOffsetDp))
        next.selectedShadowOffsetDp = Math.max(input.selectedShadowOffsetDp, 0);
    if (finite(input.cornerRadiusRatio)) {
        next.cornerRadiusRatio = clamp(input.cornerRadiusRatio, 0, 1);
        next.cornerRadiusDp = null;
    }
    if (finite(input.cornerRadiusDp))
        next.cornerRadiusDp = Math.max(input.cornerRadiusDp, 0);
    if (finite(input.startAngleDeg))
        next.startAngleDeg = input.startAngleDeg;
    if (finite(input.holeRadiusRatio))
        next.holeRadiusRatio = clamp(input.holeRadiusRatio, 0, 1);
    if (finite(input.selectedDim))
        next.selectedDim = clamp(input.selectedDim, 0, 1);
    if (finite(input.unselectedDim))
        next.unselectedDim = clamp(input.unselectedDim, 0, 1);
    if (finite(input.selectedShadowDim))
        next.selectedShadowDim = clamp(input.selectedShadowDim, 0, 1);
    if (finite(input.mainSliceDim))
        next.mainSliceDim = clamp(input.mainSliceDim, 0, 1);
    if (input.ensureRenderableSlices !== undefined)
        next.ensureRenderableSlices = input.ensureRenderableSlices;
    if (input.roundInnerCorners !== undefined)
        next.roundInnerCorners = input.roundInnerCorners;
    if (input.groupSmallSlices !== undefined)
        next.groupSmallSlices = input.groupSmallSlices;
    if (input.otherSliceColor !== undefined)
        next.otherSliceColor = input.otherSliceColor;
    if (input.disabledColor !== undefined)
        next.disabledColor = input.disabledColor;
    return next;
}
export const DEFAULT_ANIMATION = {
    revealDuration: 600,
    revealEasing: DEFAULT_EASING,
    dataChangeDuration: 600,
    dataChangeEasing: DEFAULT_EASING,
};
