# Changelog

## 2.0.1

### Fixed

- **2.0.0 needed `compileSdk` 36.** It was accidentally published built against a preview Android SDK, so any app on an
  older `compileSdk` (or an Android Gradle Plugin too old to know about 36) failed to build against it at all, with an
  "AAR metadata" error. The library uses nothing above `minSdk`, so this was never intentional. Down to `compileSdk` 24
  (Android 7.0), the lowest it can go since `compileSdk` can't be under `minSdk`: whatever `compileSdk` an app already
  has works now. No source change, so 1.0.0's and 2.0.0's *Upgrading* notes below still apply when moving from an
  earlier version; nothing here needs a code change.

## 2.0.0

Small slices can be grouped into one that opens up on tap, sizes can be given in dp, and `ensureRenderableSlices` is now
on by default. The signature of `setStyle` changed and charts can look different, so read *Upgrading* first.

### Upgrading from 1.0.0

- **Recompile.** `setStyle` has new parameters, and the gap, the corner radius and the shadow offset each take a ratio
  (degrees for the gap) *or* a size in dp: those parameters are nullable, and null keeps the setting as it is. Calls with
  named arguments keep working. A call that passes arguments by position has to be updated, and anything compiled against
  1.0.0 without being rebuilt (another library, for example) fails at run time with `NoSuchMethodError`.
- **The alpha options are dim options now, from 0 to 1.** `selectedAlpha`, `unselectedAlpha` and `selectedShadowAlpha`
  (0 to 255) are renamed `selectedDim`, `unselectedDim` and `selectedShadowDim`, and take a fraction like the new
  `mainSliceDim`: 0 is not dimmed and 1 is invisible, so `dim = 1 - alpha / 255`. The defaults look the same (`0`,
  `0.6` and `0.8`), and a shadow that was off with `selectedShadowAlpha = 0` is off with `selectedShadowDim = 1f`.
- **`ensureRenderableSlices` is on by default.** A slice is never drawn smaller than the gap plus 1°, and the larger slices
  give up the difference, so a chart with tiny slices looks different. Pass `ensureRenderableSlices = false` for the
  1.0.0 look.
- **`androidx.core:core-ktx` is no longer a dependency of the library**, only `androidx.annotation` (for `@MainThread`).
  If your app used core-ktx without declaring it, add it yourself.

### Added

- **Grouping of small slices.** `setStyle(groupSmallSlices = true)` merges the slices that would have less than 2° left
  after the gap into one slice, in `otherSliceColor`, of which at least 10° is seen whatever the gap. It is off by default.
  - A tap on it, or `expandGroup()`, opens it: the big slices are squeezed into a 90° arc, drawn dimmed (`mainSliceDim`,
    0.6 by default) inside one rounded slice, and the small slices share the other 270°. The change is animated: the big
    slices shrink into the arc.
  - A tap on the arc, or `collapseGroup()`, goes back. Expanding selects the first of the small slices and collapsing
    selects the first slice, by tap or by calling the functions, and `setOnChunkClickListener` gets the slice.
  - New API: `groupSmallSlices`, `otherSliceColor`, `mainSliceDim` (a dim like the others, 0 to 1), `isGroupExpanded`, `expandGroup()`, `collapseGroup()`,
    `setOnGroupExpandedChangedListener` and `OtherSliceId`. The group's slice and the big slices in the arc can not be
    selected. A `SelectedSlice` always has the total and the share of all the data you gave.
- **Sizes in dp.** `setStyle` takes `cornerRadiusDp`, `selectedShadowOffsetDp` and `visualGapDp`, each on its own, so the
  corners can be in dp while the shadow is a ratio. A size in dp stays that size when the chart is resized;
  `cornerRadiusDp`, `selectedShadowOffsetDp` and `visualGapDp` tell which unit is in charge.
- **Demo app:** the settings can be switched between dp and relative, small slices can be grouped (or not), the
  number of segments runs on while + or − is held, the sample data has 30 rows in 30 distinct colors, and the sliders
  and the stepper's + button keep the system's back gesture out of their way (a drag that starts at the end of a track no
  longer closes the app), and so do the unit toggles when there is room: Android only honors about 200 dp of such area
  per screen edge.

### Changed

- `setOnChunkClickListener` accepts `null`, like `setOnSelectionChangedListener`.
- `centerArea` is a new instance only when the hole changes, so a `CenterRenderer` that caches by identity keeps its
  work when only another style setting changes.

### Fixed

- `setStyle` ignores numbers that are not finite (NaN, infinity) instead of drawing garbage, and the gap is at most a
  full turn.
- With no room for a chart (the padding takes it all) nothing is drawn, instead of the last ring.

## 1.0.0

First public version.

- `PieChartView`: donut / pie chart with animated reveal and data-change morphs, tap selection, hole, gap,
  rounded corners and exact `BigDecimal` values.
- Selected slice shadow and optional dimming of the other slices; the selection follows its slice across data changes.
- Center content: `CenterRenderer`, `DefaultCenterRenderer` and `CenterVisibility`.
