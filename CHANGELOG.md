# Changelog

## Unreleased

- `setStyle` takes the corner radius, the shadow offset and the gap in dp too (`cornerRadiusDp`,
  `selectedShadowOffsetDp`, `visualGapDp`), each on its own, so the corners can be in dp while the shadow is a ratio.
  The ratio (degrees for the gap) and dp parameters of a setting are nullable, and null keeps the setting as it is.
  A size in dp stays that size when the chart is resized; `cornerRadiusDp`, `selectedShadowOffsetDp` and
  `visualGapDp` tell which unit is in charge. The signature of `setStyle` changed, so recompile against it.

## 1.0.0

First public version.

- `PieChartView`: donut / pie chart with animated reveal and data-change morphs, tap selection, hole, gap,
  rounded corners and exact `BigDecimal` values.
- Selected slice shadow and optional dimming of the other slices; the selection follows its slice across data changes.
- Center content: `CenterRenderer`, `DefaultCenterRenderer` and `CenterVisibility`.
