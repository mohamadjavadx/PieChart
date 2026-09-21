import type { SelectedSlice } from "../chart/model.ts";
import type { SvgNode } from "../svg/node.ts";
import type { CenterArea } from "./area.ts";

/**
 * Draws information about the selected slice in the hole of a chart. [DefaultCenterRenderer] draws a
 * label and a value; implement this for anything else. The chart decides when to show it and fades it in
 * and out, so a renderer only needs to draw at full opacity.
 *
 * Both functions receive [slices], every slice that can be selected (the same array until the data
 * changes), so a renderer can decide from all of them, for example whether its content fits, and not
 * only from the selected one.
 */
export interface CenterRenderer {
  /**
   * Whether [area] is big enough for this renderer. The chart asks when its size, hole or data changes
   * and shows the renderer only while it says yes (with the default `whenFits`). Decide from the geometry
   * and the data as a whole, not from the selected slice: otherwise the center would come and go as the
   * selection moves between slices.
   */
  fits?(area: CenterArea, slices: readonly SelectedSlice[]): boolean;

  /**
   * The SVG elements that draw [slice] inside [area], in the chart's coordinates. Stay within the hole.
   * This runs on every frame while the chart animates: return the same array again when nothing changed.
   */
  render(area: CenterArea, slice: SelectedSlice, slices: readonly SelectedSlice[]): readonly SvgNode[];

  /**
   * Forgets any layout it has kept, so that the next `fits` and `render` work from scratch. The chart calls it
   * when something a renderer measures changes without its area or data changing, such as a font that has loaded.
   */
  invalidate?(): void;
}

/** When a [CenterRenderer] is shown. */
export type CenterVisibility =
  /** Only while the renderer's `fits` says the hole is big enough. The default. */
  | "whenFits"
  /** Whenever there is a hole and a selected slice, however small the hole is. */
  | "always"
  | "never"
  /** Only while the hole is at least this share of the chart's radius, regardless of the chart's size. */
  | { readonly minHoleRatio: number };

/** The width of [text] set at [fontSize] px in the given weight: what a browser or a canvas can tell, and a test can fake. */
export type TextMeasurer = (text: string, fontSize: number, fontWeight: number) => number;
