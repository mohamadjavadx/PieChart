import { Decimal } from "./decimal.js";
/** The slices of [input] that have a value above zero, with exact values: what a chart shows for its data. */
export function toSlices(input) {
    const slices = [];
    for (const item of input) {
        const value = Decimal.from(item.value);
        if (value.signum() > 0)
            slices.push({ id: item.id, label: item.label, value, color: item.color });
    }
    return slices;
}
/** The sum of the values of [slices]: the whole that every share is a share of. */
export function totalOf(slices) {
    return Decimal.sum(slices.map((slice) => slice.value));
}
/** The share of [value] in [total], from 0 to 1, from exact values: only for drawing and rounding. */
export function shareOf(value, total) {
    return total.signum() > 0 ? value.divide(total).toNumber() : 0;
}
