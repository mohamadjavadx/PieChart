// Writes the SVG that the web chart draws for a state, to compare with a screenshot of the Android chart.
//
//   node tools/svg-of.ts <scenario> <out.svg>
//
// The chart is the size of the Android demo's chart view on the emulator (756 px, density 2.875, padding 16 dp),
// with the demo's default style (a gap of 4 dp, corners of 4 dp, a shadow offset of 6 dp).

import { writeFileSync } from "node:fs";
import { ChartModel } from "../src/chart/model.ts";
import { sceneToSvg } from "../src/svg/nodes.ts";
import type { SliceInput } from "../src/core/types.ts";
import { Decimal } from "../src/core/decimal.ts";

const PALETTE = [
  "#F24822", "#FF9E42", "#FFC943", "#A8D94F", "#2EA659", "#B485B8", "#A55EEA", "#FFB6A2", "#336314", "#5AD8CC",
  "#3373E5", "#C8B222", "#8C6640", "#D94099", "#3DADFF", "#DEBAF6", "#4247A6", "#D77C63", "#9D486B", "#49A9AE",
  "#6C5CE7", "#E885F1", "#A2041C", "#AC9754", "#5C6B84", "#FF7096", "#861E86", "#19D27F", "#0E7C86", "#878BF2",
];

/** The demo's sample data: values halve, and the last two are equal, 100 in all. */
function halving(count: number): SliceInput[] {
  return Array.from({ length: count }, (_, i) => {
    const k = Math.min(i + 1, Math.max(count - 1, 1));
    return { id: i + 1, label: `Row ${i + 1}`, value: Decimal.parse(`${100n * 5n ** BigInt(k)}e-${k}`), color: PALETTE[i % PALETTE.length]! };
  });
}

const [scenario = "default", out = `${scenario}.svg`] = process.argv.slice(2);
const model = new ChartModel({
  density: 2.875,
  // The demo turns the dimming of the other slices off, unless its switch says so.
  style: { cornerRadiusDp: 4, visualGapDp: 4, selectedShadowOffsetDp: 6, otherSliceColor: "#8A93A6", unselectedDim: 0 },
  animation: { revealDuration: 0, dataChangeDuration: 0 },
});
model.setSize(756, 756, 46);

switch (scenario) {
  case "default": // 5 rows, the first slice selected
    model.setData(halving(5));
    model.setSelectedIndex(0);
    break;
  case "selected2": // the second slice selected, the others dimmed
    model.setData(halving(5));
    model.setStyle({ unselectedDim: 0.6 });
    model.setSelectedIndex(1);
    break;
  case "seven":
    model.setData(halving(7));
    model.setSelectedIndex(0);
    break;
  case "grouped": // 30 rows, small slices grouped, the first slice selected
    model.setStyle({ groupSmallSlices: true });
    model.setData(halving(30));
    model.setSelectedIndex(0);
    break;
  case "expanded": // the group opened: the first small slice is selected
    model.setStyle({ groupSmallSlices: true });
    model.setData(halving(30));
    model.expandGroup();
    break;
  default:
    throw new Error(`unknown scenario: ${scenario}`);
}
model.advance(Number.MAX_SAFE_INTEGER);

writeFileSync(out, sceneToSvg(model.scene()));
console.log(`${scenario}: ${model.scene().slices.length} slices${model.scene().band ? ", a band" : ""} -> ${out}`);
