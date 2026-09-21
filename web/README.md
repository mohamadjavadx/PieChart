# PieChart for the web

The web version of the [Android PieChart library](../README.md): the same look and the same features, drawn with
SVG. It is being built in steps, and **this first step is the core**: everything that decides *what* is drawn, with
nothing that touches the DOM, so that any renderer can sit on top of it.

| | |
|---|---|
| Done | The core (`src/core`): exact decimals, sweeps and gaps, corner radii, grouping of small slices, the morph planner, hit testing, and the SVG path of a slice. |
| Next | The chart itself: the animated state (reveal, morph, selection), an SVG renderer, then a `<pie-chart>` web component and a React wrapper. |

## The core

A port, function by function, of the Android library's pure Kotlin code. Angles are in degrees, clockwise from 3
o'clock, which is also how SVG's y-down plane reads them, so the geometry carries over unchanged.

| File | Ports | What |
|---|---|---|
| `decimal.ts` | `BigDecimal` | Exact decimals, with Java's `DECIMAL64` division (16 digits, half to even), so totals and shares are exact. |
| `sliceMath.ts` | `SliceMath.kt` | The gap, the target sweeps (with the flush band of an expanded group), the minimum sweep, corner radii, hit testing. |
| `grouping.ts` | `Grouping.kt` | Small slices into one "Other" (under the gap plus 2°; the group is given the gap plus 10°), and the expanded layout. |
| `morph.ts` | `Morph.kt` | Plans a data-change animation: matches slices by id, keeps ghosts of removed ones, moves the band weights. |
| `ringPath.ts` | `RingPathBuilder.kt` | The outline of a slice as SVG path data: sharp, or with corners that are circles tangent to the edge and to the side. |
| `layout.ts` | `PieChartView` | From slices to shapes: the ring, the shadow ring, the segments, a slice's outline. |
| `slices.ts`, `types.ts`, `math.ts` | | Input normalization, the slice types, shared constants. |

It has no dependencies and uses only syntax that Node can run as it is, so there is no build step to test it.

```
npm test            # node --test: 85 tests, no packages needed
npm install         # once, for the type checker
npm run typecheck   # tsc --noEmit, strict
```

## Kept the same as Android

`test/fixtures/core.json` is what the Android library's own Kotlin code answered for many inputs: divisions,
gaps, sweeps (with and without a band), corner radii over a grid, grouping, morph plans, and hit tests at random
points. `test/parity.test.ts` runs every one of them through this port. Kotlin computes in 32-bit floats and this in
64-bit, so numbers agree to a small tolerance; exact decimals agree to the last digit.

The file comes from `tools/kotlin-fixtures`, a small JVM program that compiles the library's Kotlin files as they
are (not copies) and writes the answers. After a change to the Kotlin logic, from the repository root:

```
./gradlew -p web/tools/kotlin-fixtures run
cd web && npm test
```

If the Android logic changes, the fixtures change, and the parity test says what the port still has to do.

## Differences from Android on purpose

- Values are decimal strings, numbers or bigints (a number is taken by its shortest decimal form), and colors are
  any CSS color, not an ARGB int.
- Ids are compared with `===` and can be strings, numbers or symbols; the group's slice has the id `OtherSliceId`
  (a symbol).
- The group's label is a parameter (`otherLabel`) instead of a fixed English word.
