# PieChart for the web

The web version of the [Android PieChart library](../README.md): the same look and the same features, drawn with
SVG. It is being built in steps.

| | |
|---|---|
| Done | **The core** (`src/core`): exact decimals, sweeps and gaps, corner radii, small-slice grouping, the morph planner, hit testing, SVG paths. **The chart** (`src/chart`): its state, selection, group expand and collapse, reveal and morph animations. **SVG** (`src/svg`): a scene as SVG text or patched into the DOM. **The text in the hole** (`src/center`). **Accessibility** (`src/a11y`): screen readers and the keyboard. **Three ways to use it**: the `PieChart` class, a `<pie-chart>` web component (`src/element`) and a React component (`src/react`). |
| Next | A canvas renderer for charts with thousands of slices, if anyone needs one. |

```
npm run demo        # builds, and serves demo pages on http://localhost:8765/demo/ (index, element, react)
npm test            # node --test: 163 tests, no packages needed
npm install         # once, for the type checker
npm run typecheck   # tsc --noEmit, strict, tests included
npm run build       # ES modules and .d.ts into dist/
npm run verify      # types, tests, build, and a look at what npm would publish
npm run bench       # what a frame costs, from 5 to 1000 slices
```

Node 22.18 or newer. The source uses only syntax that Node can run as it is, so tests need no build step.

## Using it

Install it (`npm install @mohamadjavadx/piechart`), and pick the way that suits your page. All three are the same chart, and the
options, defaults and behavior are those of the Android library, in dp (CSS px here) and with the `…Dim` options from 0 to 1:
see the Android README's [Styling](../README.md#styling) and [Small slices](../README.md#small-slices).

### A web component

Works in any page and in any framework:

```html
<script type="module">import "@mohamadjavadx/piechart/element/register";</script>

<pie-chart center group-small-slices corner-radius-dp="4" gap-dp="4" label="Spending by category"
  data='[{"label":"Rent","value":1200},{"label":"Food","value":450.50},{"label":"Travel","value":300}]'></pie-chart>
```

```js
const pie = document.querySelector("pie-chart");
pie.data = [{ label: "Rent", value: 1200 }, { label: "Food", value: "450.50" }]; // ids and colors are made up when left out
pie.chartStyle = { holeRadiusRatio: 0.7 };                                        // any setting, over the attributes
pie.addEventListener("selectionchange", (e) => console.log(e.detail?.data.label)); // also: sliceclick, groupchange
```

Attributes: `data` (JSON), `selected-index`, `center`, `label`, `other-label`, `padding` (px, 16 by default), `reduced-motion`
(`auto`, `always`, `never`), `group-small-slices`, `hole-ratio` (0 to 1), `corner-radius-dp`, `gap-dp`, `shadow-offset-dp`,
`unselected-dim` (0 to 1). Properties: `data`, `chartStyle`, `selectedIndex`, `selection`, `centerRenderer`, `accessibility`,
`chart` (the `PieChart` inside), and the methods `expandGroup()`, `collapseGroup()`, `focus()` and `refreshTheme()`. It is a
square as wide as its parent; size it with CSS (`pie-chart { width: 320px }`). It draws in a shadow root, so page styles do not
reach it; the hole's text takes the page's text color and font, or `--pie-chart-label-color`, `--pie-chart-value-color`,
`--pie-chart-suffix-color` and `--pie-chart-font-family`. To register it under another name: `definePieChart("my-pie")` from
`@mohamadjavadx/piechart/element`.

### A React component

```tsx
import { PieChart } from "@mohamadjavadx/piechart/react";

<PieChart
  data={rows}                       // {label, value, id?, color?}; an equal array does not restart the animation
  center                            // the label, value and total in the hole, in the page's colors
  label="Spending by category"
  chartStyle={{ cornerRadiusDp: 4, visualGapDp: 4, groupSmallSlices: true }}
  onSelectionChange={(slice) => setSelected(slice?.data.id)}
  style={{ maxWidth: 360 }}
/>
```

Other props: `selectedIndex`, `onSliceClick`, `onGroupExpandedChange`, `centerStyle`, `padding`, `accessibleText`, `otherLabel`,
`animation`, `reducedMotion`, `id`, `className`. A ref gives `{ chart, expandGroup(), collapseGroup(), focus() }`. React 18 or
newer (a peer dependency); works with server rendering, which sends the empty box, and with StrictMode.

### A class

```ts
import { PieChart, createDefaultCenter } from "@mohamadjavadx/piechart";

const chart = new PieChart(document.querySelector("#chart")!, {
  padding: 16,
  center: createDefaultCenter(), // the selected slice's label, value and total, in the hole
  style: { cornerRadiusDp: 4, visualGapDp: 4, groupSmallSlices: true },
});
chart.setData([
  { label: "Rent", value: "1200" },
  { label: "Food", value: "450.50", color: "#FF9E42" },
]);
chart.model.onSelectionChanged = (slice) => console.log(slice?.data.label);
```

The container needs a size (the chart is a square in it). Data given before it has one waits for it (and so does a selection
made meanwhile), so the entry animation is not played unseen. Values are decimal strings, numbers or bigints; an id left out is
the label (made unique), and a color left out is the next of `DEFAULT_PALETTE`.

### The text in the hole

`createDefaultCenter(style?, formatter?)` draws what the Android `DefaultCenterRenderer` draws: a small label over a large
value, and the total after it (`50/100`), all scaled down together in a small hole, and gone when they would not fit
(`centerVisibility`: `"whenFits"` by default, `"always"`, `"never"`, or `{ minHoleRatio }`). A change of selection fades the
old text out and the new one in. `formatter` picks the text (`(slice) => ({ label, value, suffix })`); `style` the colors,
font, sizes and gaps. A fill can't take a CSS variable, so give colors as values, and set a new renderer with
`chart.model.setCenterRenderer(...)` when the theme changes (the demo does; `centerStyleFromPage(element)` reads the page's
text color and font, and the web component and the React component do all of this for you). To draw something else, implement
`CenterRenderer` (`render(area, slice, slices)` returns SVG nodes, and an optional `fits`).

## Accessibility

The drawing is hidden from assistive technology, and the chart is given to it as what it is, a list of its slices.

- **Screen readers** find a listbox named by `label` (`Pie chart` by default) whose options are the slices in the order of the
  ring: `Rent, 1200 of 3000, 40%`. The selected slice is the selected option, and selecting one, by finger or by keyboard, is
  the same as tapping it. While small slices are grouped, the group is an option too (`Other, 24 small slices, … Activate to
  show them`), and once it is open the way back is the first option, and opening and closing are announced.
- **The keyboard.** The chart takes focus with Tab (and shows the browser's focus ring). Arrows move to the next and previous
  slice, and select it; Home and End go to the first and last; Enter or Space acts on the option with focus (it opens the
  group, or closes it from the way back); Escape or Backspace closes an open group, as the Back button does on Android.
- **Reduced motion.** When the system asks for less motion (`prefers-reduced-motion`), the entry and morph animations are
  skipped. `reducedMotion: "always"` or `"never"` decides it in code.
- **Words.** Everything that is said can be reworded or translated: `accessibleText` (React), `accessibility` (element) or the
  `accessibility` option (class) take any of `label`, `slice(slice)`, `group(slice, count)`, `back(count)`, `groupOpened(count)`
  and `groupClosed()`. Long sums are read to eight significant digits.

The chart does not rely on color alone for the selected slice (it pops out and casts a shadow), but the slices' colors are
yours: keep enough contrast between neighbors and with the background. This is new in the web version: the Android chart does
not describe itself to TalkBack yet.

## Performance

A frame of an animation costs the model's step, one scene, and patching the SVG in place; nothing is made or thrown away per
frame, and nothing runs while the chart is still. Measured with `npm run bench` (Node 22, a laptop; a 60 fps frame is 16.7 ms), and
with the same steps in a browser, where patching the DOM and recalculating style and layout come on top:

| Slices | Script per frame (Node) | Script + DOM patch + style and layout (browser) | SVG elements |
|---|---|---|---|
| 5 | 0.04 ms | 0.3 ms | 10 |
| 30 | 0.13 ms | 0.4 ms | 35 |
| 100 | 0.35 ms | 1.1 ms | 105 |
| 300 | 1.0 ms | 1.7 ms | 305 |
| 1000 | 3.4 ms | 9.3 ms | 1005 |

Painting is the browser's and was not measured (the frames were stepped by a script, not by the display). Up to a few hundred
slices there is a lot of room; a chart with thousands of slices is not what an SVG chart is for.

## Layers

| Path | What |
|---|---|
| `src/core` | A port, function by function, of the Android library's pure Kotlin code (`SliceMath`, `Grouping`, `Morph`, `RingPathBuilder`), and `Decimal`, exact decimals with Java's `DECIMAL64` division. Nothing here touches the DOM. |
| `src/chart/model.ts` | `ChartModel`, the port of `PieChartView`'s state machine: data, selection, grouping, animations. Time comes in through `advance(now)`, so it runs (and is tested) without a browser. |
| `src/chart/scene.ts` | What to draw for one frame: shapes in paint order, with colors and opacities. The port of the view's drawing, with the canvas taken out. |
| `src/center` | The text in the hole: the area it may use, the renderer that fits and lays out text (measured through a `TextMeasurer`: a canvas in a browser, a function in tests), and the presenter that fades it. |
| `src/a11y` | The chart for screen readers and the keyboard: the options (pure functions, tested without a browser), and the listbox that holds the drawing and answers keys. |
| `src/element` | The `<pie-chart>` custom element, over `PieChart`. |
| `src/react` | The React component, over `PieChart`. |
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
- The text in the hole is set in `Roboto, system-ui, …` (or the page's font, in the web and React components) and measured with a
  canvas; it is measured again when a font finishes loading (`document.fonts`). On Android's own screenshots, the label and value
  baselines land within 1 px of the web chart's at the same size; the shapes of the letters differ where the fonts do.
- The chart describes itself to screen readers and the keyboard, which the Android chart does not do yet.
- `id` and `color` of a slice can be left out, and the group's label can be changed (`otherLabel`).
