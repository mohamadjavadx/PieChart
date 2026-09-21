# Changelog of the web version

The Android library has its own, in [`../CHANGELOG.md`](../CHANGELOG.md). Web releases are tagged `web-v<version>`.

## 0.1.1

Documentation only: the code is the same as in 0.1.0.

- The README has pictures of the chart, the install command and the release status, and a link to the live demo.
- **[Live demo](https://mohamadjavadx.github.io/PieChart/)**: a chart to tap, the settings playground of the Android demo,
  and the web component and React demos. The demo pages no longer zoom when a button is tapped twice quickly.

## 0.1.0

The first release of the web version: the Android library's look and features, drawn with SVG, with no dependencies.

- **The chart.** A donut or pie chart with rounded corners, gaps, a shadow for the selected slice, and the animations of the
  Android chart: the entry, and the morph when the data changes. Exact decimal values. Small slices can be grouped into one,
  which opens into a dimmed arc of the big slices and the small ones. The same settings as on Android (in CSS px for dp, and
  the dimming as 0 to 1), checked against the Android library's own Kotlin code and against its rendering, pixel by pixel.
- **The text in the hole.** The selected slice's label, value and total, scaled to fit, faded when the selection changes.
- **Three ways to use it.** A `<pie-chart>` web component (`@mohamadjavadx/piechart/element/register`), a React component
  (`@mohamadjavadx/piechart/react`), and the plain `PieChart` class, which the others are made of. `ChartModel` and the SVG
  functions are there too, for anything else, such as drawing on a server.
- **Accessible.** Screen readers get the chart as a list of its slices, and the keyboard selects them (arrows, Home, End,
  Enter, Space, and Escape to close a group). Animations are skipped for people who ask their system for less motion. What
  is said can be reworded or translated.
- **Fast.** A frame of 30 slices costs about half a millisecond of script; see the README for more.
