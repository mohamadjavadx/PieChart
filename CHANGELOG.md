# Changelog

## Unreleased

- `setStyle` overload with the hole, the corner radius and the shadow offset in px (`holeRadiusPx`, `cornerRadiusPx`,
  `selectedShadowOffsetPx`). They are converted to ratios at the chart's size, and the ratios are what is drawn.
  `CenterVisibility.MinHoleRadiusPx` shows the center while the hole is at least that many px. Ratios work as before.
  A `when` over `CenterVisibility` needs a branch for the new case.

## 1.0.0

First public version.

- `PieChartView`: donut / pie chart with animated reveal and data-change morphs, tap selection, hole, gap,
  rounded corners and exact `BigDecimal` values.
- Selected slice shadow and optional dimming of the other slices; the selection follows its slice across data changes.
- Center content: `CenterRenderer`, `DefaultCenterRenderer` and `CenterVisibility`.
