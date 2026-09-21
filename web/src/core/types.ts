import type { Decimal, DecimalInput } from "./decimal.ts";

/**
 * Identifies a slice across data changes: a slice that keeps its id animates from its old size to
 * its new one, and stays selected. Ids are compared with `===`, so use strings, numbers or symbols
 * (or the same object every time), and keep them unique.
 */
export type SliceId = unknown;

/** The id of the slice that stands for the small slices while they are grouped. */
export const OtherSliceId: unique symbol = Symbol("PieChart.Other");

/** What the chart is given for one slice. */
export interface SliceInput {
  readonly id: SliceId;
  readonly label: string;
  /** The size of the slice, exact. A slice whose value is not above zero is left out. */
  readonly value: DecimalInput;
  /** Any CSS color. The core never looks at it. */
  readonly color: string;
}

/** A slice as the core works with it. */
export interface Slice {
  readonly id: SliceId;
  readonly label: string;
  readonly value: Decimal;
  readonly color: string;
}
