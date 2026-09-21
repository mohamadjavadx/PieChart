import { OtherSliceId } from "../core/types.ts";
import type { SelectedSlice } from "../chart/model.ts";

// What a screen reader and the keyboard see of the chart: a list of options in the order of the ring. The chart
// is drawn, so this is a second, text-only description of the same state. Nothing here touches the DOM.

/** The words the chart says to assistive technology. Give all or some of them to translate or reword. */
export interface AccessibleText {
  /** The name of the chart, as a screen reader says it when it gets focus. */
  label: string;
  /** One slice: `Rent, 1200 of 3000, 40%`. */
  slice: (slice: SelectedSlice) => string;
  /** The slice that stands for [count] small ones, while they are grouped. */
  group: (slice: SelectedSlice, count: number) => string;
  /** The way back from the open group: the band of big slices. */
  back: (count: number) => string;
  /** Said when the group opens, and when it closes. */
  groupOpened: (count: number) => string;
  groupClosed: () => string;
}

/** A share as a percentage with three significant digits at most: `50`, `6.25`, `0.098`. */
export function percentText(fraction: number): string {
  return `${Number((fraction * 100).toPrecision(3))}%`;
}

/**
 * A number as it is read out: the value as it is when it is short, and to eight significant digits when it is not,
 * as the sum of many small values can be (`3.244853969082281`, which nobody wants read digit by digit).
 */
export function spokenNumber(value: { toString(): string }): string {
  const text = value.toString();
  if (text.replace(/[-.]/g, "").length <= 10) return text;
  const rounded = String(Number(Number(text).toPrecision(8)));
  return rounded.includes("e") ? text : rounded;
}

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

export const DEFAULT_ACCESSIBLE_TEXT: Readonly<AccessibleText> = {
  label: "Pie chart",
  slice: (slice) => `${slice.data.label}, ${spokenNumber(slice.data.value)} of ${spokenNumber(slice.total)}, ${percentText(slice.fraction)}`,
  group: (slice, count) =>
    `${slice.data.label}, ${count} small ${plural(count, "slice", "slices")}, ${spokenNumber(slice.data.value)} of ${spokenNumber(slice.total)}, ` +
    `${percentText(slice.fraction)}. Activate to show them`,
  back: () => "Back to all slices",
  groupOpened: (count) => `Showing ${count} small ${plural(count, "slice", "slices")}`,
  groupClosed: () => "Showing all slices",
};

/** What one option is: a slice to select, the group's slice to open, or the band that closes the group. */
export type ItemKind = "slice" | "group" | "back";

export interface AccessibleItem {
  readonly kind: ItemKind;
  /** The slice's index in the chart's slices; for the way back, the first of the band. */
  readonly index: number;
  /** The accessible name. */
  readonly text: string;
  readonly selected: boolean;
}

/** The state of the chart that the options are made from; the chart model has all of it. */
export interface ChartState {
  readonly displayed: readonly SelectedSlice[];
  readonly band: number;
  readonly selectedIndex: number;
  readonly isGroupExpanded: boolean;
  readonly groupSize: number;
}

/**
 * The options in the order of the ring: while the group is open, the way back first (the band of big slices
 * comes first on the ring), then every slice that can be selected; while it is closed, every slice, and the
 * group's slice where the ring has it.
 */
export function accessibleItems(state: ChartState, text: AccessibleText): AccessibleItem[] {
  const items: AccessibleItem[] = [];
  if (state.band > 0) items.push({ kind: "back", index: 0, text: text.back(state.band), selected: false });
  for (const slice of state.displayed) {
    if (slice.index < state.band) continue; // The band is one option, the way back
    if (slice.data.id === OtherSliceId) {
      items.push({ kind: "group", index: slice.index, text: text.group(slice, state.groupSize), selected: false });
    } else {
      items.push({ kind: "slice", index: slice.index, text: text.slice(slice), selected: slice.index === state.selectedIndex });
    }
  }
  return items;
}

/** Where the option with focus is at first: the selected slice, or the first option. -1 when there are none. */
export function initialActive(items: readonly AccessibleItem[]): number {
  const selected = items.findIndex((item) => item.selected);
  return selected >= 0 ? selected : items.length > 0 ? 0 : -1;
}

export type KeyAction =
  /** Moves focus to another option. Landing on a slice selects it. */
  | { type: "move"; to: number }
  /** Enter or Space on an option: selects the slice, opens the group, or closes it. */
  | { type: "activate"; at: number }
  /** Escape or Backspace while the group is open, as the Back button does on Android. */
  | { type: "collapse" };

/**
 * What a key does. Arrows move one option (and do not wrap: the ends of a list are ends), Home and End go to the
 * first and last, Enter and Space act on the option with focus, Escape and Backspace close an open group.
 * Null for any other key, which is left to the browser.
 */
export function actionForKey(key: string, items: readonly AccessibleItem[], active: number, isGroupExpanded: boolean): KeyAction | null {
  if (items.length === 0) return null;
  const clamp = (n: number) => Math.min(Math.max(n, 0), items.length - 1);
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
