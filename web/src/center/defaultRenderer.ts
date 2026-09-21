import type { SelectedSlice } from "../chart/model.ts";
import type { SvgNode } from "../svg/node.ts";
import type { CenterArea } from "./area.ts";
import type { CenterRenderer, TextMeasurer } from "./renderer.ts";

// Draws the selected slice's label and value in the hole, scaled to fit. A port of the Android library's
// DefaultCenterRenderer: the same sizes, the same rules for when the suffix leaves the value's line, and
// the same fitting, with the text measured by a function that is given, as a canvas or a test can.

/** What [DefaultCenterRenderer] draws: a small label above a large value, with an optional suffix after it. */
export interface CenterInfo {
  readonly label: string | null;
  readonly value: string;
  readonly suffix?: string | null;
}

/**
 * Look of [DefaultCenterRenderer]. The text sizes are the ones used when the hole is roomy, in CSS px
 * (Android's are in sp). In a smaller hole the value and the suffix are scaled down together, never so far
 * that the value drops below [minTextSize]; when it still does not fit, the center is not shown. The label
 * does not decide any of that: it follows the scale but keeps at least [minTextSize], and is ellipsized
 * when it is too wide.
 */
export interface CenterInfoStyle {
  labelColor: string;
  valueColor: string;
  suffixColor: string;
  fontFamily: string;
  labelWeight: number;
  valueWeight: number;
  suffixWeight: number;
  labelTextSize: number;
  valueTextSize: number;
  suffixTextSize: number;
  /** Space between the label and the value, and between the value and a suffix on its own line. */
  lineGap: number;
  /** The smallest size the value may be scaled down to, and the smallest the label may reach. */
  minTextSize: number;
  /**
   * When the suffix, scaled together with the value, would be smaller than this, it moves to its own line
   * under the value and keeps at least this size.
   */
  minInlineSuffixSize: number;
}

export const DEFAULT_CENTER_STYLE: Readonly<CenterInfoStyle> = {
  labelColor: "#8A93A6",
  valueColor: "#1F2633",
  suffixColor: "#1F2633",
  fontFamily: "Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif",
  labelWeight: 400,
  valueWeight: 700,
  suffixWeight: 700,
  labelTextSize: 14,
  valueTextSize: 32,
  suffixTextSize: 16,
  lineGap: 6,
  minTextSize: 11,
  minInlineSuffixSize: 8,
};

export type CenterFormatter = (slice: SelectedSlice) => CenterInfo | null;

/** The slice's label, its value, and `/total`. */
export const defaultInfo: CenterFormatter = (slice) => ({
  label: slice.data.label === "" ? null : slice.data.label,
  value: slice.data.value.toString(),
  suffix: `/${slice.total.toString()}`,
});

/** Cap height as a share of the text size, for a typical sans-serif face. */
const CAP_HEIGHT = 0.72;
/** How much of the width of the hole's chord the text may use. */
const FILL = 0.9;
const SEARCH_STEPS = 12;

/** How one slice is drawn: the scale of the value line, and whether the suffix has its own line. */
interface Fit {
  readonly scale: number;
  readonly isSuffixOnOwnLine: boolean;
}

/**
 * Whether the center is shown is decided from every slice, each at its smallest allowed size, so it does
 * not come and go as the selection moves. The size of the text is then worked out for the selected slice
 * alone: a short value is not shrunk because another slice has a long one. Labels are not measured for any
 * of this: they follow the scale but never drop below the minimum, and are ellipsized to fit.
 *
 * An instance keeps the layout it worked out for the chart it draws in, so give each chart its own.
 */
export class DefaultCenterRenderer implements CenterRenderer {
  private readonly measure: TextMeasurer;
  private readonly style: CenterInfoStyle;
  private readonly formatter: CenterFormatter;

  // Whether every slice fits at its smallest size, for one (slices, area) pair.
  private referenceSlices: readonly SelectedSlice[] | null = null;
  private referenceArea: CenterArea | null = null;
  private fitsAtMinimum = false;
  private minScale = 1;

  // The text and positions of one slice, so that drawing a frame does no work.
  private laidOutSlice: SelectedSlice | null = null;
  private laidOutArea: CenterArea | null = null;
  private nodes: readonly SvgNode[] = [];

  constructor(measure: TextMeasurer, style: Partial<CenterInfoStyle> = {}, formatter: CenterFormatter = defaultInfo) {
    this.measure = measure;
    this.style = { ...DEFAULT_CENTER_STYLE, ...(style.valueColor && !style.suffixColor ? { suffixColor: style.valueColor } : {}), ...style };
    this.formatter = formatter;
  }

  invalidate(): void {
    this.referenceSlices = null;
    this.referenceArea = null;
    this.laidOutSlice = null;
    this.laidOutArea = null;
  }

  fits(area: CenterArea, slices: readonly SelectedSlice[]): boolean {
    this.prepare(area, slices);
    return this.fitsAtMinimum;
  }

  render(area: CenterArea, slice: SelectedSlice, slices: readonly SelectedSlice[]): readonly SvgNode[] {
    this.prepare(area, slices);
    if (this.laidOutSlice !== slice || this.laidOutArea !== area) this.layout(area, slice);
    return this.nodes;
  }

  /** Works out, once per data set and hole, whether every slice fits at its smallest size. */
  private prepare(area: CenterArea, slices: readonly SelectedSlice[]): void {
    if (this.referenceSlices === slices && this.referenceArea === area) return;
    this.referenceSlices = slices;
    this.referenceArea = area;
    this.laidOutSlice = null;
    this.minScale = Math.min(Math.max(this.style.minTextSize / this.style.valueTextSize, 0.01), 1); // the suffix scales with the value
    this.fitsAtMinimum = false;
    if (area.isEmpty) return;

    let count = 0;
    for (const slice of slices) {
      const info = this.formatter(slice);
      if (info === null) continue;
      if (this.fitFor(area, info) === null) return;
      count++;
    }
    this.fitsAtMinimum = count > 0;
  }

  /**
   * The largest scale at which [info] fits in [area], or null if it does not fit even at the smallest
   * size. The suffix stays on the value's line for as long as it would not be smaller than
   * `minInlineSuffixSize`; after that it goes on the next line.
   */
  private fitFor(area: CenterArea, info: CenterInfo): Fit | null {
    const s = this.style;
    const valueWidth = this.measure(info.value, s.valueTextSize, s.valueWeight);
    const suffixWidth = info.suffix ? this.measure(info.suffix, s.suffixTextSize, s.suffixWeight) : 0;
    const hasLabel = !!info.label;
    const hasSuffix = suffixWidth > 0;

    const smallestInline = hasSuffix ? Math.max(this.minScale, s.minInlineSuffixSize / s.suffixTextSize) : this.minScale;
    if (smallestInline <= 1) {
      const scale = largestScale(smallestInline, (scale) =>
        area.widthFor(this.inlineHeight(hasLabel, scale)) * FILL >= (valueWidth + suffixWidth) * scale);
      if (scale !== null) return { scale, isSuffixOnOwnLine: false };
    }
    if (!hasSuffix) return null;

    const scale = largestScale(this.minScale, (scale) => {
      const widest = Math.max(valueWidth * scale, (suffixWidth * this.stackedSuffixSize(scale)) / s.suffixTextSize);
      return area.widthFor(this.stackedHeight(hasLabel, scale)) * FILL >= widest;
    });
    return scale === null ? null : { scale, isSuffixOnOwnLine: true };
  }

  private layout(area: CenterArea, slice: SelectedSlice): void {
    this.laidOutSlice = slice;
    this.laidOutArea = area;
    const info = this.formatter(slice);
    if (info === null || area.isEmpty) {
      this.nodes = [];
      return;
    }

    const s = this.style;
    const hasLabel = !!info.label;
    // Sized for this slice alone. Shown at the smallest size when it still does not fit (only possible
    // with visibility "always").
    const fit = this.fitFor(area, info) ?? { scale: this.minScale, isSuffixOnOwnLine: true };
    const scale = fit.scale;
    const onOwnLine = fit.isSuffixOnOwnLine;
    const suffixSize = onOwnLine ? this.stackedSuffixSize(scale) : s.suffixTextSize * scale;
    const labelSize = this.labelSizeAt(scale);
    const valueSize = s.valueTextSize * scale;

    const height = onOwnLine ? this.stackedHeight(hasLabel, scale) : this.inlineHeight(hasLabel, scale);
    const available = area.widthFor(height) * FILL;
    const label = hasLabel ? ellipsize(info.label!, available, (text) => this.measure(text, labelSize, s.labelWeight)) : null;
    const suffix = info.suffix ? info.suffix : null;

    const valueWidth = this.measure(info.value, valueSize, s.valueWeight);
    const suffixWidth = suffix ? this.measure(suffix, suffixSize, s.suffixWeight) : 0;
    let valueX: number;
    let suffixX: number;
    if (onOwnLine) {
      valueX = area.cx - valueWidth / 2;
      suffixX = area.cx - suffixWidth / 2;
    } else {
      valueX = area.cx - (valueWidth + suffixWidth) / 2;
      suffixX = valueX + valueWidth;
    }

    // Stack the label, the value and, on its own line, the suffix; center the block on the hole.
    const blockTop = area.cy - height / 2;
    const labelHeight = hasLabel ? labelSize * CAP_HEIGHT : 0;
    const labelBaseline = blockTop + labelHeight;
    const valueBaseline = blockTop + labelHeight + (hasLabel ? s.lineGap * scale : 0) + valueSize * CAP_HEIGHT;
    const suffixBaseline = onOwnLine ? valueBaseline + s.lineGap * scale + suffixSize * CAP_HEIGHT : valueBaseline;

    const nodes: SvgNode[] = [];
    if (label !== null) nodes.push(this.textNode(label, area.cx, labelBaseline, labelSize, s.labelWeight, s.labelColor, true));
    nodes.push(this.textNode(info.value, valueX, valueBaseline, valueSize, s.valueWeight, s.valueColor, false));
    if (suffix !== null) nodes.push(this.textNode(suffix, suffixX, suffixBaseline, suffixSize, s.suffixWeight, s.suffixColor, false));
    this.nodes = nodes;
  }

  private textNode(text: string, x: number, y: number, size: number, weight: number, color: string, centered: boolean): SvgNode {
    return {
      tag: "text",
      text,
      attrs: {
        x: round(x), y: round(y), "font-size": round(size), "font-weight": weight, "font-family": this.style.fontFamily,
        fill: color, "text-anchor": centered ? "middle" : "start",
      },
    };
  }

  /** The label follows the scale, but keeps at least the minimum size and never grows past its own size. */
  private labelSizeAt(scale: number): number {
    const { labelTextSize, minTextSize } = this.style;
    return Math.min(labelTextSize, Math.max(minTextSize, labelTextSize * scale));
  }

  /** A suffix on its own line follows the scale but keeps at least the inline minimum. */
  private stackedSuffixSize(scale: number): number {
    const { suffixTextSize, minInlineSuffixSize } = this.style;
    return Math.min(suffixTextSize, Math.max(minInlineSuffixSize, suffixTextSize * scale));
  }

  /** Height of the label and the value, with the suffix on the value's line. */
  private inlineHeight(hasLabel: boolean, scale: number): number {
    const s = this.style;
    return s.valueTextSize * scale * CAP_HEIGHT + (hasLabel ? this.labelSizeAt(scale) * CAP_HEIGHT + s.lineGap * scale : 0);
  }

  /** Height of the label, the value and the suffix on the line below it. */
  private stackedHeight(hasLabel: boolean, scale: number): number {
    return this.inlineHeight(hasLabel, scale) + this.style.lineGap * scale + this.stackedSuffixSize(scale) * CAP_HEIGHT;
  }
}

/**
 * The largest scale from [low] up to 1 for which [fits] is true, or null. The text gets bigger with the
 * scale while the hole's chord gets shorter, so everything up to some scale fits.
 */
function largestScale(low: number, fits: (scale: number) => boolean): number | null {
  if (fits(1)) return 1;
  if (!fits(low)) return null;
  let lo = low;
  let hi = 1;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** [text] cut short, with an ellipsis, to be at most [width] wide; empty if not even the ellipsis fits. */
export function ellipsize(text: string, width: number, measure: (text: string) => number): string {
  if (measure(text) <= width) return text;
  for (let length = text.length - 1; length > 0; length--) {
    const cut = `${text.slice(0, length).trimEnd()}…`;
    if (measure(cut) <= width) return cut;
  }
  return measure("…") <= width ? "…" : "";
}

const round = (value: number): number => Number(value.toFixed(3));
