# PieChart

[![](https://jitpack.io/v/mohamadjavadx/PieChart.svg)](https://jitpack.io/#mohamadjavadx/PieChart)

An animated **pie / donut chart view** for Android (Kotlin, plain `View` — no Compose, no XML).
Tap a slice to select it: the slice gets a soft shadow and its details appear in the middle of the ring.

<p align="center">
  <img src="docs/images/chart-default.png" width="260" alt="Donut chart with the first slice selected: its label and value are shown in the hole">
  <img src="docs/images/chart-dim.png" width="260" alt="The same chart with the other slices dimmed">
  <img src="docs/images/chart-selection-moved.png" width="260" alt="Another slice selected: the shadow and the center text moved with it">
</p>

## Features

- **Donut or pie**, with a configurable hole, gap between slices and corner rounding (outer and inner corners).
- **Exact values.** Slice values are `BigDecimal`, so totals and shares are not distorted by floating point;
  only the drawing angles are floats.
- **Animated.** The first data grows into place; later data changes *morph*: slices that stay resize,
  new ones grow in, removed ones shrink away where they were.
- **Tap selection** with a shadow behind the selected slice and optional dimming of the others.
  The selection follows its slice when the data changes.
- **Details in the hole.** A pluggable renderer draws information about the selected slice in the middle.
  The default one shows a label, a value and a total, scales its text to the hole and hides itself when
  the hole is too small.
- **Always square,** and a single small dependency (`androidx.core`).

## Install

The library is on [JitPack](https://jitpack.io/#mohamadjavadx/PieChart):

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://jitpack.io")
    }
}

// build.gradle.kts of your app
dependencies {
    implementation("com.github.mohamadjavadx:PieChart:v1.0.0")
}
```

You can also download the `.aar` from the [Releases](https://github.com/mohamadjavadx/PieChart/releases) page, or add
the `:piechart` module to your project. Requires `minSdk 24`.

## Quick start

```kotlin
val chart = PieChartView(context)          // constructor takes only a Context
container.addView(chart, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

chart.centerRenderer = DefaultCenterRenderer()   // show the selected slice in the hole

// Post the data once the view has a size, or the entry animation is skipped.
chart.post {
    chart.setData(
        listOf(
            PieChartData(id = 1, label = "Rent",      value = BigDecimal("1200"), color = 0xFFF24822.toInt()),
            PieChartData(id = 2, label = "Food",      value = BigDecimal("450"),  color = 0xFFFF9E42.toInt()),
            PieChartData(id = 3, label = "Transport", value = BigDecimal("150"),  color = 0xFFFFC943.toInt()),
        )
    )
}

chart.setOnSelectionChangedListener { slice ->     // SelectedSlice? — null when nothing is selected
    println(slice?.data?.label)
}
```

### Data

| `PieChartData` | |
|---|---|
| `id: Any` | Identity of the slice. Must be unique. Data changes are animated by matching ids, and the selection follows the id. |
| `label: String` | Shown by the default center renderer. |
| `value: BigDecimal` | Slices with a value of zero or less are ignored. |
| `color: Int` | ARGB color of the slice. |

`setData` can be called again at any time; `clearData()` shows an empty (gray) ring.

## Selection

- **Tap** a slice, or call `setSelectedIndex(index)` (`-1` clears it). If an animation is running, the request is
  applied when it ends.
- `currentSelection` gives the selected `SelectedSlice` (`index`, `data`, exact `total`, `fraction`).
- `setOnSelectionChangedListener` is called when the selection moves to another slice or to nothing.
  It is **not** called when new data keeps the same slice selected, even if the slice moved or its value changed.
- **The selection survives `setData`** as long as a slice with the same `id` is still in the data.
- While nothing is selected every slice is drawn normally. While one is selected, the others use
  `unselectedAlpha` (default 40%), and the selected one gets a **shadow**: the same slice, faded and shifted toward
  the hole, drawn behind it.

## Styling

Everything is set in one call so the chart redraws once:

```kotlin
chart.setStyle(
    holeRadiusRatio = 0.7f,             // 0..1 of the chart radius
    cornerRadiusRatio = 0.5f,           // 0..1 of half the ring thickness
    visualGapDeg = 2f,                  // angle between slices
    unselectedAlpha = 255,              // 255 = don't dim the others
    selectedShadowAlpha = 51,           // 0 turns the shadow off
    selectedShadowOffsetRatio = 0.06f,  // how far the shadow is shifted, as a share of the hole radius
)
```

| Option | Default | Meaning |
|---|---|---|
| `holeRadiusRatio` | `0.85` | Hole size as a share of the chart radius. |
| `cornerRadiusRatio` | `0.5` | Corner radius as a share of half the ring's thickness (then limited so it always fits). |
| `roundInnerCorners` | `true` | Round the corners on the hole side too (only for holes above 25%). |
| `visualGapDeg` | `1` | Gap between slices, in degrees. |
| `startAngleDeg` | `-90` | Where the first slice starts (`-90` is 12 o'clock). |
| `ensureRenderableSlices` | `false` | Give every slice at least the gap plus 1° so tiny ones stay visible. |
| `selectedAlpha` / `unselectedAlpha` | `255` / `102` | Alpha of the selected slice (and of all slices when none is selected) / of the others. |
| `selectedShadowAlpha` | `51` (20%) | Alpha of the shadow behind the selected slice. |
| `selectedShadowOffsetRatio` | `0.06` | Shadow shift as a share of the hole radius; never more than half the ring thickness. |
| `disabledColor` | light gray | Color of the empty-state ring. |

**Exact sizes in px.** The hole, the corner radius and the shadow offset can also be given in pixels instead of as
ratios, with the same `setStyle`:

```kotlin
val density = resources.displayMetrics.density
chart.setStyle(
    holeRadiusPx = 96 * density,          // instead of holeRadiusRatio
    cornerRadiusPx = 8 * density,         // instead of cornerRadiusRatio
    selectedShadowOffsetPx = 4 * density, // instead of selectedShadowOffsetRatio
)
```

The chart draws with ratios, so the sizes are converted to ratios at the chart's size at that moment (once it has a
size, if it is not laid out yet). The ratios are what stays if the chart is resized afterwards, and the ratio
properties hold them. The limits are those of the ratios (a hole is at most the chart's radius, a corner at most half
the ring's thickness, a shadow shift at most the hole's radius and half the thickness). A size in px wins over the
ratio of the same name in the same call. The gap between slices is an angle, so it has no px form.

Animations: `setAnimationConfig(revealAnimationDuration, revealAnimationInterpolator, dataChangeAnimationDuration, dataChangeAnimationInterpolator)`
(defaults: 600 ms each). Padding works as on any view and the chart is drawn in the largest circle inside it.

> Note: `setStyle` and padding changes end any running animation and jump to the final layout.

## Details in the hole

Set a `CenterRenderer` and the chart draws it for the selected slice, fading it in and out.

```kotlin
chart.centerRenderer = DefaultCenterRenderer(
    style = CenterInfoStyle(labelColor = 0xFF8A93A6.toInt(), valueColor = 0xFF1F2633.toInt()),
    formatter = { slice ->                       // return null to draw nothing for a slice
        CenterInfo(
            label = slice.data.label,
            value = "${(slice.fraction * 100).roundToInt()}%",
        )
    },
)
```

`DefaultCenterRenderer` draws a label above a value with an optional suffix (by default the slice's value and `/total`):

<p align="center">
  <img src="docs/images/hole-60.png" width="220" alt="Hole 60%">
  <img src="docs/images/hole-30.png" width="220" alt="Hole 30%: the label is shortened">
  <img src="docs/images/hole-15.png" width="220" alt="Hole 15%: tiny text, the suffix on its own line">
</p>

**How it adapts to the hole**

- Text sizes are real `sp` sizes (label 14, value 32, suffix 16) and follow the user's font scale.
- When the hole is smaller, the value and the suffix shrink together, but never below `minTextSizeSp` (11) for the value.
  The label follows the scale with the same floor and is shortened with an ellipsis.
- When the suffix would drop below `minInlineSuffixSizeSp` (8), it moves to its own line under the value.
- The text is sized for the selected slice alone, so a short value is not shrunk because another slice has a long one.
- **Whether the center is shown** is decided from *every* slice, each at its smallest size, so it never comes and goes
  as the selection moves. Control it with `chart.centerVisibility`:
  `WhenFits` (default), `Always`, `Never`, `MinHoleRatio(ratio)` or `MinHoleRadiusPx(px)`.

**Your own content.** Implement `CenterRenderer`; the chart handles when to show it and the fading:

```kotlin
class DotRenderer : CenterRenderer {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    // Called when the size, hole or data change; decide from geometry and all slices, not the selected one.
    override fun fits(area: CenterArea, slices: List<SelectedSlice>) = area.radius > 60f

    override fun draw(canvas: Canvas, area: CenterArea, slice: SelectedSlice, slices: List<SelectedSlice>) {
        paint.color = slice.data.color
        canvas.drawCircle(area.cx, area.cy, area.radius * 0.3f, paint)
    }
}
```

`CenterArea` gives the hole (`cx`, `cy`, `radius`, `safeRect`, and `widthFor(height)` for the width available to
a block of a given height). If you would rather use a normal `View` in the middle, read `chart.centerArea` and
`setOnSelectionChangedListener` and place it yourself.

## How it works

```mermaid
flowchart LR
    A["setData(list)"] --> B["drop values <= 0<br/>exact total (BigDecimal)"]
    B --> C["sweeps = value / total x 360°<br/>gap and minimum sweep"]
    C -->|first data| D["reveal animation"]
    C -->|data changed| E["planMorph: match slices by id"]
    D --> F["onDraw"]
    E --> F
    F --> G["each slice: a Path of arcs<br/>with rounded corners"]
    G --> H["selected slice: faded copy<br/>behind it, shifted to the hole"]
    F --> I["center renderer<br/>faded in and out"]
```

- **Angles.** A slice's sweep is `value / total × 360°`, computed from exact `BigDecimal`s. The gap between slices is
  taken out of each sweep. With `ensureRenderableSlices`, slices smaller than the gap plus 1° are raised to that minimum and
  the difference is taken proportionally from the larger ones.
- **Rounded corners.** Each corner is a circle tangent to the ring's edge and to the slice's side. Its radius is limited by
  the ring's thickness, by the angle available at that end of the slice, and by the space the outer and inner corner
  share, so any slice size or hole size gives a valid shape.
- **Morphing.** `planMorph` matches the old and new slices by `id`. Slices that stay interpolate from their old sweep to the
  new one, new slices grow from zero, and removed slices stay as "ghosts" that shrink to zero in place. Both layouts add up
  to 360°, so the ring is always complete, and the gap moves smoothly too. An interrupted animation continues from what is on
  screen.
- **Selection shadow.** The shadow is the slice's own shape drawn again on the same ring shifted toward the hole, at low alpha,
  *behind* the slice, so only the part that sticks out shows.
- **Hit testing.** A tap counts when it is within the ring (plus 8 dp) and its angle, measured from the start angle,
  falls in a slice that is actually drawn. Touches are ignored while an animation runs.
- **Center content.** A presenter fades the old content out and the new in when the slice changes (and updates in place when the
  same slice gets a new value). The default renderer works out one scale per slice from the width of the hole's chord at the
  height of its text block.

**Source layout**

| Path | What |
|---|---|
| `PieChartView.kt` | The view: state, animation, drawing, touch. |
| `geometry/SliceMath.kt` | Pure math: gap, sweeps, corner radii, hit test. |
| `geometry/Morph.kt` | Plans and describes one data-change animation. |
| `geometry/RingPathBuilder.kt` | Builds the outline of a slice on any ring. |
| `center/` | `CenterRenderer`, `DefaultCenterRenderer`, visibility rules and the fade presenter. |

## Demo app

The `:app` module is a settings playground for the chart: change the number of segments, hole size, corners, gap and
shadow, toggle dimming, and edit the data (label and value of every row, with Next moving between values).

<p align="center">
  <img src="docs/images/demo-settings.png" width="260" alt="Demo: chart settings">
  <img src="docs/images/demo-data.png" width="260" alt="Demo: editing the data">
</p>

## Limitations

- No XML attributes: create it in code (`PieChartView(context)`).
- No accessibility support yet: slices are not exposed to screen readers.
- No state saving: keep the data and the selected id in your own state (the demo does so in its view model).
- Main thread only. Touch is ignored while an animation is running.
- Right-to-left layouts are not mirrored.

## Contributing

Issues and pull requests are welcome. Run the demo (`./gradlew :app:installDebug`) and `./gradlew :piechart:lintRelease`
before sending a change.

## License

Copyright 2026 Mohamadjavad Pourmoradian.

Licensed under the [Apache License, Version 2.0](LICENSE). You may use, modify and distribute it, including in
commercial apps, as long as you keep the license and copyright notices; the license also grants you the right to use any
patents the code needs.
