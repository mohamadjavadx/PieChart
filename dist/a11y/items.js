import { OtherSliceId } from "../core/types.js";
/** A share as a percentage with three significant digits at most: `50`, `6.25`, `0.098`. */
export function percentText(fraction) {
    return `${Number((fraction * 100).toPrecision(3))}%`;
}
/**
 * A number as it is read out: the value as it is when it is short, and to eight significant digits when it is not,
 * as the sum of many small values can be (`3.244853969082281`, which nobody wants read digit by digit).
 */
export function spokenNumber(value) {
    const text = value.toString();
    if (text.replace(/[-.]/g, "").length <= 10)
        return text;
    const rounded = String(Number(Number(text).toPrecision(8)));
    return rounded.includes("e") ? text : rounded;
}
const plural = (count, one, many) => (count === 1 ? one : many);
export const DEFAULT_ACCESSIBLE_TEXT = {
    label: "Pie chart",
    slice: (slice) => `${slice.data.label}, ${spokenNumber(slice.data.value)} of ${spokenNumber(slice.total)}, ${percentText(slice.fraction)}`,
    group: (slice, count) => `${slice.data.label}, ${count} small ${plural(count, "slice", "slices")}, ${spokenNumber(slice.data.value)} of ${spokenNumber(slice.total)}, ` +
        `${percentText(slice.fraction)}. Activate to show them`,
    back: () => "Back to all slices",
    groupOpened: (count) => `Showing ${count} small ${plural(count, "slice", "slices")}`,
    groupClosed: () => "Showing all slices",
};
/**
 * The options in the order of the ring: while the group is open, the way back first (the band of big slices
 * comes first on the ring), then every slice that can be selected; while it is closed, every slice, and the
 * group's slice where the ring has it.
 */
export function accessibleItems(state, text) {
    const items = [];
    if (state.band > 0)
        items.push({ kind: "back", index: 0, text: text.back(state.band), selected: false });
    for (const slice of state.displayed) {
        if (slice.index < state.band)
            continue; // The band is one option, the way back
        if (slice.data.id === OtherSliceId) {
            items.push({ kind: "group", index: slice.index, text: text.group(slice, state.groupSize), selected: false });
        }
        else {
            items.push({ kind: "slice", index: slice.index, text: text.slice(slice), selected: slice.index === state.selectedIndex });
        }
    }
    return items;
}
/** Where the option with focus is at first: the selected slice, or the first option. -1 when there are none. */
export function initialActive(items) {
    const selected = items.findIndex((item) => item.selected);
    return selected >= 0 ? selected : items.length > 0 ? 0 : -1;
}
/**
 * What a key does. Arrows move one option (and do not wrap: the ends of a list are ends), Home and End go to the
 * first and last, Enter and Space act on the option with focus, Escape and Backspace close an open group.
 * Null for any other key, which is left to the browser.
 */
export function actionForKey(key, items, active, isGroupExpanded) {
    if (items.length === 0)
        return null;
    const clamp = (n) => Math.min(Math.max(n, 0), items.length - 1);
    const at = active < 0 ? 0 : active;
    switch (key) {
        case "ArrowDown":
        case "ArrowRight":
            // From nowhere, the first key goes to the first option rather than the second.
            return { type: "move", to: active < 0 ? 0 : clamp(at + 1) };
        case "ArrowUp":
        case "ArrowLeft":
            return { type: "move", to: active < 0 ? items.length - 1 : clamp(at - 1) };
        case "Home":
            return { type: "move", to: 0 };
        case "End":
            return { type: "move", to: items.length - 1 };
        case "Enter":
        case " ":
            return active < 0 ? null : { type: "activate", at: active };
        case "Escape":
        case "Backspace":
            return isGroupExpanded ? { type: "collapse" } : null;
        default:
            return null;
    }
}
