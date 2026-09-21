import type { CenterInfoStyle } from "./defaultRenderer.ts";

/** `r, g, b` of a computed color such as `rgb(31, 38, 51)` or `rgba(31, 38, 51, 0.9)`, or null. */
function channels(color: string): [number, number, number] | null {
  const match = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(color);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * The look of the details in the hole, taken from the page around [element]: its text color and its font, with the label
 * a little fainter than the value. Colors and fonts are read when this is called, because a fill can not take a CSS
 * variable, so call it again when the page's theme changes. The custom properties `--pie-chart-label-color`,
 * `--pie-chart-value-color`, `--pie-chart-suffix-color` and `--pie-chart-font-family` override what is read.
 * Call it in a browser.
 */
export function centerStyleFromPage(element: Element): Partial<CenterInfoStyle> {
  const computed = getComputedStyle(element);
  const pick = (name: string): string | undefined => computed.getPropertyValue(name).trim() || undefined;
  const rgb = channels(computed.color);
  const value = pick("--pie-chart-value-color") ?? computed.color;
  const style: Partial<CenterInfoStyle> = {
    valueColor: value,
    suffixColor: pick("--pie-chart-suffix-color") ?? value,
    labelColor: pick("--pie-chart-label-color") ?? (rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.65)` : value),
    fontFamily: pick("--pie-chart-font-family") ?? (computed.fontFamily || undefined),
  };
  for (const key of Object.keys(style) as (keyof CenterInfoStyle)[]) if (style[key] === undefined) delete style[key];
  return style;
}
