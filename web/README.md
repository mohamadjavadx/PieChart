# PieChart for the web

The web version of the [Android PieChart library](../README.md): the same look and the same features, drawn with
SVG. It is being built in steps.

| | |
|---|---|
| Done | **The core** (`src/core`): exact decimals, sweeps and gaps, corner radii, small-slice grouping, the morph planner, hit testing, SVG paths. **The chart** (`src/chart`): its state, selection, group expand and collapse, reveal and morph animations. **SVG** (`src/svg`): a scene as SVG text or patched into the DOM. `PieChart` puts it on a page. **The text in the hole** (`src/center`): the selected slice's label, value and total, scaled to fit, faded when the selection changes. |
| Next | A `<pie-chart>` web component, a React wrapper, and accessibility (keyboard and screen readers). |

```
npm run demo        # builds, and serves a demo page on http://localhost:8765/
npm test            # node --test: 144 tests, no packages needed
npm install         # once, for the type checker
npm run typecheck   # tsc --noEmit, strict, tests included
npm run build       # ES modules and .d.ts into dist/
```

Node 22.18 or newer. The source uses only syntax that Node can run as it is, so tests need no build step.

## Using it

```ts
import { PieChart, createDefaultCenter } from "./dist/index.js";

const chart = new PieChart(document.querySelector("#chart")!, {
  padding: 16,
  center: createDefaultCenter(), // the selected slice's label, value and total, in the hole
  style: { cornerRadiusDp: 4, visualGapDp: 4, groupSmallSlices: true },
});
chart.setData([
  { id: 1, label: "Rent", value: "1200", color: "#F24822" },
  { id: 2, label: "Food", value: "450.50", color: "#FF9E42" },
]);
chart.model.onSelectionChanged = (slice) => console.log(slice?.data.label);
```

The options, their defaults, and the behavior are those of the Android library, in dp (CSS px here) and with `…Dim`
options from 0 to 1: see the Android README's [Styling](../README.md#styling) and [Small slices](../README.md#small-slices).
Data given before the container has a size waits for it (and so does a selection made meanwhile), so the entry animation is
not played unseen.

### The text in the hole

`createDefaultCenter(style?, formatter?)` draws what the Android `DefaultCenterRenderer` draws: a small label over a large
value, and the total after it (`50/100`), all scaled down together in a small hole, and gone when they would not fit
(`centerVisibility`: `"whenFits"` by default, `"always"`, `"never"`, or `{ minHoleRatio }`). A change of selection fades the
old text out and the new one in. `formatter` picks the text (`(slice) => ({ label, value, suffix })`); `style` the colors,
font, sizes and gaps. A fill can't take a CSS variable, so give colors as values, and set a new renderer with
`chart.model.setCenterRenderer(...)` when the theme changes (the demo does). To draw something else, implement
`CenterRenderer` (`render(area, slice, slices)` returns SVG nodes, and an optional `fits`).

## Layers

| Path | What |
|---|---|
| `src/core` | A port, function by function, of the Android library's pure Kotlin code (`SliceMath`, `Grouping`, `Morph`, `RingPathBuilder`), and `Decimal`, exact decimals with Java's `DECIMAL64` division. Nothing here touches the DOM. |
| `src/chart/model.ts` | `ChartModel`, the port of `PieChartView`'s state machine: data, selection, grouping, animations. Time comes in through `advance(now)`, so it runs (and is tested) without a browser. |
| `src/chart/scene.ts` | What to draw for one frame: shapes in paint order, with colors and opacities. The port of the view's drawing, with the canvas taken out. |
| `src/center` | The text in the hole: the area it may use, the renderer that fits and lays out text (measured through a `TextMeasurer`: a canvas in a browser, a function in tests), and the presenter that fades it. |
| `src/svg` | A scene as a tree of SVG elements: written as text (`sceneToSvg`, also for a server) or patched into the DOM (`patchChildren`), which keeps elements and sets only what changed. |
| `src/chart/pieChart.ts` | `PieChart`: an SVG in an element that follows its size, runs the animation loop and turns pointer events into taps. |

## How it is kept the same as Android

Three checks, from the cheapest to the most convincing:

1. **Unit tests** for every function, including geometry checks that read the generated path data back and confirm that every
   rounded corner joins its neighbors tangentially.
2. **Parity fixtures.** `test/fixtures/core.json` is what the Android library's own Kotlin code answered for many inputs:
   divisions, gaps, sweeps (with and without a band), corner radii over a grid, grouping, morph plans, and hit tests at
   random points. `test/parity.test.ts` runs every one of them through this port. Kotlin computes in 32-bit floats and this
   in 64-bit, so numbers agree to a small tolerance; exact decimals agree to the last digit. The file comes from
   `tools/kotlin-fixtures`, a small JVM program that compiles the library's Kotlin files as they are (not copies). After a
   change to the Kotlin logic, from the repository root: `./gradlew -p web/tools/kotlin-fixtures run`, then `npm test`.
3. **Pixels.** The web chart and the Android demo were drawn in the same states at the same size (756 px, 2.875 density)
   and compared over the ring. The remaining difference is anti-aliasing at the edges:

   | State | Mean error (of 255) | Ring pixels off by more than 32 |
   |---|---|---|
   | 5 slices, the first selected | 0.49 | 0.26% |
   | The second selected, the others dimmed | 0.26 | 0.01% |
   | 7 slices | 0.48 | 0.23% |
   | 30 slices, small ones grouped | 0.61 | 0.22% |
   | The group open: the dimmed arc, 24 small slices, the selected one's shadow | 0.47 | 0.18% |

   No pixel was off by more than 96. To repeat it (macOS, with the Android demo on an emulator): render a state with
   `node tools/svg-of.ts <scenario> out.svg`, turn it into a PNG with `qlmanage -t -s 756 -o . out.svg`, crop the chart view
   from a screenshot of the demo, and run `python3 tools/compare-png.py web.png android.png`.

## Differences from Android on purpose

- Values are decimal strings, numbers or bigints (a number is taken by its shortest decimal form), and colors are any CSS color,
  not an ARGB int.
- Ids are compared with `===` and can be strings, numbers or symbols; the group's slice has the id `OtherSliceId` (a symbol).
- The group's label is a parameter (`otherLabel`) instead of a fixed English word.
- "dp" is a CSS px, and so are the text sizes (Android's are in sp).
- The text in the hole is set in `Roboto, system-ui, …` and measured with a canvas, so it needs the font to be loaded before the
  chart is given data (or `setCenterRenderer` called again after): a font that arrives later changes the width of the text
  and would not be measured again. On Android's own screenshots, the label and value baselines land within 1 px of the web
  chart's at the same size; the shapes of the letters differ where the fonts do.
