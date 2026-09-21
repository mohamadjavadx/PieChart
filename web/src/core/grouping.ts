import { Decimal } from "./decimal.ts";
import { MAX_DEG } from "./math.ts";
import { shareOf, totalOf } from "./slices.ts";
import { OtherSliceId, type Slice } from "./types.ts";

// Grouping of slices that are too small to be seen. Pure data: the chart draws the result like any
// other data. A port of the Android library's Grouping.kt.

/** A slice is grouped when less than this many degrees of it would remain after the gap is cut out. */
export const MIN_VISIBLE_SWEEP_DEG = 2;

/**
 * The group is at least this wide once the gap is cut out of it, so that it can be seen and tapped:
 * the angle it is given is this plus the gap, as every slice loses the gap out of its own angle.
 */
export const MIN_GROUP_SWEEP_DEG = 10;

/** While the group is expanded, all the slices that are not in it share an arc of this many degrees. */
export const EXPANDED_BAND_SWEEP_DEG = 90;

/**
 * What the chart shows for its data: [slices], and whether small slices were found to group. The
 * first [bandCount] of the slices are the big ones of an expanded group, which share a band.
 */
export interface Grouping {
  readonly slices: readonly Slice[];
  readonly hasGroup: boolean;
  readonly bandCount: number;
}

export interface GroupingOptions {
  /** The gap between slices, in degrees. */
  readonly gapDeg: number;
  readonly expanded: boolean;
  /** The color of the slice that stands for the group. */
  readonly otherColor: string;
  /** What the slice that stands for the group is called. */
  readonly otherLabel?: string;
}

/**
 * Groups the slices of [source] (values above zero) that would have less than
 * [MIN_VISIBLE_SWEEP_DEG] left once a gap of `gapDeg` is cut out of them.
 *
 * Collapsed, the big slices stay as they are, in order, followed by one slice for the group. It is
 * as big as the group's values say, but at least [MIN_GROUP_SWEEP_DEG] plus the gap, so that
 * [MIN_GROUP_SWEEP_DEG] of it is seen; the big slices give up the difference.
 *
 * Expanded, the big slices come first, in order, and are the band: the chart draws them together in
 * an arc of [EXPANDED_BAND_SWEEP_DEG]. They are followed by the members of the group, which share
 * the rest of the ring in proportion. Nobody's value changes: the layout is the chart's to do.
 *
 * Nothing is grouped unless at least two slices are small and at least one is not.
 */
export function groupSlices(source: readonly Slice[], options: GroupingOptions): Grouping {
  const none: Grouping = { slices: source, hasGroup: false, bandCount: 0 };
  if (source.length < 3) return none;

  const total = totalOf(source);
  const limit = options.gapDeg + MIN_VISIBLE_SWEEP_DEG;
  const big: Slice[] = [];
  const small: Slice[] = [];
  for (const slice of source) {
    const sweep = shareOf(slice.value, total) * MAX_DEG;
    (sweep < limit ? small : big).push(slice);
  }
  if (small.length < 2 || big.length === 0) return none;

  if (options.expanded) return { slices: [...big, ...small], hasGroup: true, bandCount: big.length };

  const smallTotal = totalOf(small);
  const bigTotal = total.subtract(smallTotal);
  // The gap is cut out of the group's angle like out of any slice's, so it comes on top. Never more
  // than half the ring, whatever the gap.
  const minGroupSweep = Math.min(MIN_GROUP_SWEEP_DEG + options.gapDeg, MAX_DEG / 2);
  const minGroupValue = times(bigTotal, minGroupSweep, MAX_DEG - minGroupSweep);
  const groupValue = smallTotal.compareTo(minGroupValue) >= 0 ? smallTotal : minGroupValue;
  const group: Slice = {
    id: OtherSliceId,
    label: options.otherLabel ?? "Other",
    value: groupValue,
    color: options.otherColor,
  };
  return { slices: [...big, group], hasGroup: true, bandCount: 0 };
}

/** [value] scaled by [numerator] / [denominator], both in degrees. */
function times(value: Decimal, numerator: number, denominator: number): Decimal {
  return value.multiply(Decimal.from(numerator)).divide(Decimal.from(denominator));
}
