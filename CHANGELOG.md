# Changelog

## Unreleased

- Small slices can be grouped: `setStyle(groupSmallSlices = true)` merges the slices that would have less than 1° left
  after the gap into one slice (`otherSliceColor`, drawn at least 8° wide). A tap on it, or `expandGroup()`, opens it: one
  slice (`mainSliceColor`) of 90° stands for all the big slices and the small ones share the other 270°. A tap on the main
  slice, or `collapseGroup()`, goes back. New: `isGroupExpanded`, `expandGroup()`, `collapseGroup()`,
  `setOnGroupExpandedChangedListener`, `OtherSliceId`, `MainSliceId`. These two slices can not be selected, and a
  `SelectedSlice` keeps the total and the share of all the data you gave. Off by default. `setStyle` got three more
  parameters, so recompile against it.
- `setStyle` takes the corner radius, the shadow offset and the gap in dp too (`cornerRadiusDp`,
  `selectedShadowOffsetDp`, `visualGapDp`), each on its own, so the corners can be in dp while the shadow is a ratio.
  The ratio (degrees for the gap) and dp parameters of a setting are nullable, and null keeps the setting as it is.
  A size in dp stays that size when the chart is resized; `cornerRadiusDp`, `selectedShadowOffsetDp` and
  `visualGapDp` tell which unit is in charge. The signature of `setStyle` changed, so recompile against it.
- `setStyle` ignores numbers that are not finite (NaN, infinity) instead of drawing garbage, and the gap is at most a
  full turn.
- `setOnChunkClickListener` accepts `null`, like `setOnSelectionChangedListener`.
- `centerArea` is a new instance only when the hole changes, so a `CenterRenderer` that caches by identity keeps its
  work when only another style setting changes.
- With no room for a chart (the padding takes it all) nothing is drawn, instead of the last ring.
- The library depends on `androidx.annotation` only, not on all of `androidx.core`.

## 1.0.0

First public version.

- `PieChartView`: donut / pie chart with animated reveal and data-change morphs, tap selection, hole, gap,
  rounded corners and exact `BigDecimal` values.
- Selected slice shadow and optional dimming of the other slices; the selection follows its slice across data changes.
- Center content: `CenterRenderer`, `DefaultCenterRenderer` and `CenterVisibility`.
