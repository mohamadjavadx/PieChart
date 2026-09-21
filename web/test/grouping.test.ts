import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/core/decimal.ts";
import { groupSlices, MIN_GROUP_SWEEP_DEG, MIN_VISIBLE_SWEEP_DEG, EXPANDED_BAND_SWEEP_DEG } from "../src/core/grouping.ts";
import { computeTargetSweeps } from "../src/core/sliceMath.ts";
import { totalOf } from "../src/core/slices.ts";
import { OtherSliceId, type Slice } from "../src/core/types.ts";

const near = (actual: number, expected: number, tolerance = 1e-6): void =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected} (±${tolerance})`);
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** The demo's data: values halve, the last two are equal, 100 in all. */
function halving(count: number): Slice[] {
  const values = Array.from({ length: count }, (_, i) => {
    const k = Math.min(i + 1, count - 1);
    return Decimal.parse(`${100n * 5n ** BigInt(k)}e-${k}`);
  });
  return values.map((value, i) => ({ id: i + 1, label: `Row ${i + 1}`, value, color: `#${i}` }));
}

const OTHER = "#8a93a6";
const group = (source: readonly Slice[], gapDeg: number, expanded: boolean, otherLabel?: string) =>
  groupSlices(source, { gapDeg, expanded, otherColor: OTHER, otherLabel });

test("the rules are the ones of the Android library", () => {
  assert.equal(MIN_VISIBLE_SWEEP_DEG, 2);
  assert.equal(MIN_GROUP_SWEEP_DEG, 10);
  assert.equal(EXPANDED_BAND_SWEEP_DEG, 90);
});

test("collapsed: the big slices, then one slice for the small ones", () => {
  const source = halving(30);
  assert.equal(totalOf(source).toString(), "100");
  const result = group(source, 1, false);
  // With a gap of 1° a slice under 3° is small: 2.8125° (row 7) is the first.
  assert.equal(result.hasGroup, true);
  assert.equal(result.bandCount, 0);
  assert.equal(result.slices.length, 7);
  assert.deepEqual(result.slices.slice(0, 6).map((s) => s.id), [1, 2, 3, 4, 5, 6]);

  const other = result.slices[6]!;
  assert.equal(other.id, OtherSliceId);
  assert.equal(other.label, "Other");
  assert.equal(other.color, OTHER);
  // The small ones add up to 1.5625 (5.6°), less than the 11° the group is given (10° plus the gap):
  // it is worth big * 11 / 349, and takes exactly 11° of the ring.
  near(other.value.toNumber(), (98.4375 * 11) / 349, 1e-12);
  const sweeps = computeTargetSweeps(result.slices, totalOf(result.slices), 1, false);
  near(sweeps[6]!, 11);
  near(sum(sweeps), 360);
});

test("collapsed: a group that is bigger than its minimum keeps its own size", () => {
  const source: Slice[] = [
    { id: "a", label: "A", value: Decimal.from("80"), color: "#a" },
    { id: "b", label: "B", value: Decimal.from("6"), color: "#b" },
    { id: "c", label: "C", value: Decimal.from("6"), color: "#c" },
    { id: "d", label: "D", value: Decimal.from("0.5"), color: "#d" },
    { id: "e", label: "E", value: Decimal.from("0.5"), color: "#e" },
    { id: "f", label: "F", value: Decimal.from("7"), color: "#f" },
  ];
  // Total 100: 0.5 is 1.8°, under the gap plus 2°; 6 is 21.6°. The two small ones add up to 1 (3.6°), under 11°.
  const grouped = group(source, 0.5, false);
  assert.equal(grouped.slices.length, 5); // a, b, c, f and the group
  // Now many small ones that together are worth more than 10°.
  const many = [source[0]!, ...Array.from({ length: 20 }, (_, i): Slice => ({ id: `s${i}`, label: "s", value: Decimal.from("1"), color: "#s" }))];
  const wide = group(many, 20, false); // gap 20°: everything under 22° is small (each one is 3.6°)
  assert.equal(wide.hasGroup, true);
  assert.equal(wide.slices.length, 2);
  // Together they are 20 of 100, 72° of the ring: more than the 30° (10 + 20) a group is given at least.
  assert.equal(wide.slices[1]!.value.toString(), "20");
});

test("expanded: the big slices are the band, the small ones follow, and no value changes", () => {
  const source = halving(30);
  const result = group(source, 1, true);
  assert.equal(result.hasGroup, true);
  assert.equal(result.bandCount, 6);
  assert.equal(result.slices.length, 30);
  assert.deepEqual(result.slices.map((s) => s.id), source.map((s) => s.id)); // the source order is already big first
  for (const [i, s] of result.slices.entries()) assert.equal(s.value, source[i]!.value);

  const sweeps = computeTargetSweeps(result.slices, totalOf(result.slices), 1, true, result.bandCount, EXPANDED_BAND_SWEEP_DEG);
  near(sum(sweeps.slice(0, 6)), 90);
  near(sum(sweeps.slice(6)), 270);
  // The band keeps its proportions: 50 : 25 : ... : 1.5625.
  near(sweeps[0]! / sweeps[1]!, 2, 1e-9);
  // The small ones are raised to the gap plus 1° = 2° where they would be smaller.
  assert.ok(sweeps.slice(6).every((s) => s >= 2 - 1e-9));
});

test("expanded: the big slices come first even when they were not first", () => {
  const source: Slice[] = [
    { id: "tiny1", label: "", value: Decimal.from("0.1"), color: "#1" },
    { id: "big1", label: "", value: Decimal.from("60"), color: "#2" },
    { id: "tiny2", label: "", value: Decimal.from("0.1"), color: "#3" },
    { id: "big2", label: "", value: Decimal.from("39.8"), color: "#4" },
  ];
  const result = group(source, 1, true);
  assert.deepEqual(result.slices.map((s) => s.id), ["big1", "big2", "tiny1", "tiny2"]);
  assert.equal(result.bandCount, 2);
  const collapsed = group(source, 1, false);
  assert.deepEqual(collapsed.slices.map((s) => s.id), ["big1", "big2", OtherSliceId]);
});

test("nothing is grouped without two small slices and one that is not", () => {
  const three: Slice[] = [
    { id: 1, label: "", value: Decimal.from("99"), color: "" },
    { id: 2, label: "", value: Decimal.from("0.5"), color: "" },
    { id: 3, label: "", value: Decimal.from("0.5"), color: "" },
  ];
  assert.equal(group(three, 1, false).hasGroup, true);
  const oneSmall = [three[0]!, { ...three[1]!, value: Decimal.from("20") }, three[2]!];
  const notGrouped = group(oneSmall, 1, false);
  assert.equal(notGrouped.hasGroup, false);
  assert.equal(notGrouped.slices, oneSmall); // the same list, untouched
  assert.equal(notGrouped.bandCount, 0);
  assert.equal(group(three.slice(0, 2), 1, false).hasGroup, false); // fewer than 3 slices
  assert.equal(group([], 1, false).hasGroup, false);
});

test("nothing is grouped when every slice is small", () => {
  const equal = Array.from({ length: 3 }, (_, i): Slice => ({ id: i, label: "", value: Decimal.from("1"), color: "" }));
  assert.equal(group(equal, 200, false).hasGroup, false); // 120° each is under 202°
});

test("the group is given the gap plus 10°, so that 10° of it is seen whatever the gap", () => {
  // 342°, 10.8° and three that are 1.8°, 1.8° and 3.6°: with any gap up to 8° two or three of them are small,
  // and together they are worth less than the 10° (plus the gap) that the group is given at least.
  const source: Slice[] = ["95", "3", "0.5", "0.5", "1"].map((v, i) => ({ id: i, label: "", value: Decimal.from(v), color: "" }));
  for (const gap of [0, 1, 5, 8]) {
    const result = group(source, gap, false);
    assert.equal(result.hasGroup, true, `gap ${gap}`);
    const sweeps = computeTargetSweeps(result.slices, totalOf(result.slices), gap, false);
    near(sweeps[sweeps.length - 1]!, 10 + gap, 1e-9);
  }
});

test("a larger gap makes more slices small", () => {
  const source = halving(8);
  const bigCount = (gap: number): number => group(source, gap, false).slices.length - 1;
  assert.ok(bigCount(0.5) > bigCount(30));
  assert.equal(bigCount(30), 3); // 180°, 90° and 45° are over 32°; 22.5° is not
});

test("the group never takes more than half the ring, whatever the gap", () => {
  const source: Slice[] = ["70", "20", "4", "3", "3"].map((v, i) => ({ id: i, label: "", value: Decimal.from(v), color: "" }));
  const result = group(source, 175, false); // 185° would be asked for
  assert.equal(result.hasGroup, true);
  assert.equal(result.slices.length, 2); // only the 252° slice is over 177°
  const sweeps = computeTargetSweeps(result.slices, totalOf(result.slices), 175, false);
  near(sweeps[1]!, 180, 1e-9);
});

test("the group's label can be another", () => {
  const source = halving(12);
  assert.equal(group(source, 1, false, "Autres").slices.at(-1)!.label, "Autres");
});
