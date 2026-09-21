import { canvasTextMeasurer } from "./measure.ts";
import { DEFAULT_CENTER_STYLE, DefaultCenterRenderer, defaultInfo, type CenterFormatter, type CenterInfoStyle } from "./defaultRenderer.ts";

export * from "./area.ts";
export * from "./defaultRenderer.ts";
export * from "./measure.ts";
export * from "./presenter.ts";
export * from "./renderer.ts";
export * from "./theme.ts";

/** The default center renderer, measuring text with a canvas in the style's font. Call it in a browser. */
export function createDefaultCenter(style: Partial<CenterInfoStyle> = {}, formatter: CenterFormatter = defaultInfo): DefaultCenterRenderer {
  return new DefaultCenterRenderer(canvasTextMeasurer(style.fontFamily ?? DEFAULT_CENTER_STYLE.fontFamily), style, formatter);
}
