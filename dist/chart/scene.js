import { outlineOf, slicePath } from "../core/layout.js";
import { fullRingPath, sharpSlicePath } from "../core/ringPath.js";
/** How far a slice of the band is drawn over the next one, in degrees, so that no seam of the background shows. */
export const BAND_SEAM_OVERLAP_DEG = 0.15;
/** The paint alpha (0..255) of something dimmed by [dim] (0..1). */
export const alphaOfDim = (dim) => Math.min(Math.max(Math.round((1 - dim) * 255), 0), 255);
export function buildScene(frame) {
    const { width, height, style } = frame;
    if (frame.ring.outerRadius <= 0)
        return { width, height, slices: [], band: null, placeholder: null, center: null };
    if (!frame.hasData) {
        return {
            width, height, slices: [], band: null, center: null,
            placeholder: { color: style.disabledColor, path: fullRingPath(frame.ring) },
        };
    }
    const outline = {
        holeRadiusRatio: style.holeRadiusRatio,
        cornerRadiusRatio: style.cornerRadiusRatio,
        roundInnerCorners: style.roundInnerCorners,
    };
    const layout = { gapDeg: frame.gapDeg, innerGapDeg: frame.innerGapDeg };
    const count = frame.renderList.length;
    const slices = [];
    let sliceStart = style.startAngleDeg;
    let bandFirst = -1;
    let bandLast = -1;
    let bandStart = 0;
    for (let i = 0; i < frame.fullSweeps.length; i++) {
        const sweep = frame.fullSweeps[i];
        const fraction = frame.animatedFractions[i];
        const bandWeight = frame.bandWeights[i];
        if (bandWeight > 0) {
            if (bandFirst < 0) {
                bandFirst = i;
                bandStart = sliceStart;
            }
            bandLast = i;
        }
        // A slice that is all in the band is drawn there, with the others.
        if ((sweep - frame.gapDeg) * fraction > 0 && bandWeight < 1) {
            const datasetIndex = frame.renderIndexMap[i];
            // Nothing selected: every slice is drawn normally, not as "unselected".
            const dim = frame.selectedIndex < 0 || datasetIndex === frame.selectedIndex ? style.selectedDim : style.unselectedDim;
            let alpha = alphaOfDim(dim);
            // On its way into or out of the band, a slice fades with its share of it.
            if (bandWeight > 0)
                alpha = Math.trunc(alpha * (1 - bandWeight));
            // The selected slice's shadow: the same slice, in a faded color, drawn behind it and shifted
            // toward the hole. It follows the slice through every animation.
            const hasShadow = frame.selectedIndex >= 0 && datasetIndex === frame.selectedIndex && style.selectedShadowDim < 1 &&
                frame.shadowRing.outerRadius < frame.ring.outerRadius;
            const color = frame.renderList[i].color;
            if (hasShadow) {
                const shadow = slicePath(frame.shadowRing, outline, layout, sliceStart, sweep, fraction, count);
                if (shadow)
                    slices.push({ kind: "shadow", color, opacity: alphaOfDim(style.selectedShadowDim) / 255, path: shadow });
            }
            const path = slicePath(frame.ring, outline, layout, sliceStart, sweep, fraction, count);
            if (path)
                slices.push({ kind: "slice", color, opacity: alpha / 255, path });
        }
        sliceStart += sweep;
    }
    const band = bandFirst >= 0 ? buildBand(frame, outline, bandFirst, bandLast, bandStart) : null;
    return { width, height, slices, band, placeholder: null, center: frame.center };
}
/** The slices [first]..[last] of the band of an expanded group, from angle [start]. */
function buildBand(frame, outline, first, last, start) {
    const { style } = frame;
    let weight = 0;
    let end = start;
    for (let i = first; i <= last; i++) {
        weight = Math.max(weight, frame.bandWeights[i]);
        end += frame.fullSweeps[i];
    }
    const fraction = frame.animatedFractions[first];
    const outerSweep = (end - start - frame.gapDeg) * fraction;
    const innerSweep = (end - start - frame.innerGapDeg) * fraction;
    if (outerSweep <= 0 || innerSweep <= 0)
        return null;
    const selectionDim = frame.selectedIndex < 0 ? style.selectedDim : style.unselectedDim;
    const alpha = Math.round(255 * (1 - selectionDim) * (1 - style.mainSliceDim * weight));
    if (alpha <= 0)
        return null;
    const sectors = [];
    let cursor = start;
    for (let i = first; i <= last; i++) {
        const sweep = frame.fullSweeps[i];
        const bandWeight = frame.bandWeights[i];
        if (bandWeight > 0 && sweep > 0) {
            const drawn = sweep * fraction + BAND_SEAM_OVERLAP_DEG;
            sectors.push({
                color: frame.renderList[i].color,
                opacity: Math.trunc(255 * bandWeight) / 255,
                path: sharpSlicePath(frame.ring, cursor, drawn, cursor, drawn),
            });
        }
        cursor += sweep;
    }
    // Cut to the outline: one rounded slice as wide as all of them, with the gap at both ends.
    const cut = outlineOf(frame.ring, outline, start + frame.gapDeg / 2, outerSweep, start + frame.innerGapDeg / 2, innerSweep, frame.renderList.length);
    return { opacity: alpha / 255, outline: cut, sectors };
}
