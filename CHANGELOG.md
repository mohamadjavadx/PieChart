# Changelog

## Unreleased

- Small slices can be grouped: `setStyle(groupSmallSlices = true)` merges the slices that would have less than 2° left
  after the gap into one slice (`otherSliceColor`, at least 10° of it seen, whatever the gap). A tap on it, or `expandGroup()`, opens it: the
  big slices are squeezed into a 90° arc, drawn dimmed (`mainSliceDim`, 0.7 by default) inside one rounded slice, and
  the small ones share the other 270°. A tap on the arc, or `collapseGroup()`, goes back. Expanding selects
  the first of the small slices, and collapsing selects the first slice, by tap or by calling the functions
  (`setOnChunkClickListener` gets it). New: `isGroupExpanded`,
  `expandGroup()`, `collapseGroup()`, `setOnGroupExpandedChangedListener`, `OtherSliceId`. The group's slice and the
  big slices in the arc can not be selected, and a `SelectedSlice` keeps the total and the share of all the data you
  gave. Off by default. `setStyle` got three more parameters, so recompile against it.
- `ensureRenderableSlices` is on by default: a slice is never drawn smaller than the gap plus 1°, and the larger slices
  give up the difference. Pass `ensureRenderableSlices = false` to draw the sizes as they are.
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
