import { canvasTextMeasurer } from "./measure.js";
import { DEFAULT_CENTER_STYLE, DefaultCenterRenderer, defaultInfo } from "./defaultRenderer.js";
export * from "./area.js";
export * from "./defaultRenderer.js";
export * from "./measure.js";
export * from "./presenter.js";
export * from "./renderer.js";
export * from "./theme.js";
/** The default center renderer, measuring text with a canvas in the style's font. Call it in a browser. */
export function createDefaultCenter(style = {}, formatter = defaultInfo) {
    return new DefaultCenterRenderer(canvasTextMeasurer(style.fontFamily ?? DEFAULT_CENTER_STYLE.fontFamily), style, formatter);
}
