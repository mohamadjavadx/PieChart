/** Colors for slices that are given none: the ones the Android demo uses, which look good side by side in this order. */
export const DEFAULT_PALETTE = [
    "#F24822", "#FF9E42", "#FFC943", "#A8D94F", "#2EA659", "#B485B8", "#A55EEA", "#FFB6A2", "#336314", "#5AD8CC",
    "#3373E5", "#C8B222", "#8C6640", "#D94099", "#3DADFF", "#DEBAF6", "#4247A6", "#D77C63", "#9D486B", "#49A9AE",
    "#6C5CE7", "#E885F1", "#A2041C", "#AC9754", "#5C6B84", "#FF7096", "#861E86", "#19D27F", "#0E7C86", "#878BF2",
];
/** Fills in the ids and colors that were left out. */
export function normalizeData(data) {
    const taken = new Set(data.filter((slice) => slice.id !== undefined).map((slice) => slice.id));
    return data.map((slice, i) => {
        let id = slice.id;
        if (id === undefined) {
            id = slice.label;
            for (let n = 2; taken.has(id); n++)
                id = `${slice.label} #${n}`;
            taken.add(id);
        }
        return { id, label: slice.label, value: slice.value, color: slice.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] };
    });
}
/** Whether two data sets say the same, so that a page which rebuilds an equal array does not restart the morph. */
export function sameData(a, b) {
    return a.length === b.length && a.every((slice, i) => {
        const other = b[i];
        return slice.id === other.id && slice.label === other.label && slice.color === other.color && String(slice.value) === String(other.value);
    });
}
