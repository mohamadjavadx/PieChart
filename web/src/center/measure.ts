import type { TextMeasurer } from "./renderer.ts";

/**
 * Measures text with a canvas, in the given font family: what the browser will draw the SVG text with,
 * as long as the font is loaded. Call it in a browser (it needs a canvas).
 */
export function canvasTextMeasurer(fontFamily: string): TextMeasurer {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("A canvas is needed to measure text");
  return (text, fontSize, fontWeight) => {
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  };
}

/**
 * A measurer that needs no browser: each character is a fixed share of the font size wide (a bit wider when
 * bold). Good for tests and for drawing on a server, where it is only as right as the guess.
 */
export function approximateTextMeasurer(characterWidth = 0.56): TextMeasurer {
  return (text, fontSize, fontWeight) => text.length * fontSize * characterWidth * (fontWeight >= 600 ? 1.06 : 1);
}
