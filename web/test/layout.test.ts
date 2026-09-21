import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/core/decimal.ts";
import { computeSegments, gapSliceCount, outlineOf, ringOf, shadowRingOf, slicePath } from "../src/core/layout.ts";
import { parsePath } from "./svgPath.ts";
import type { Slice } from "../src/core/types.ts";

const near = (actual: number, expected: number, tolerance = 1e-9): void =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected} (±${tolerance})`);
const data = (...values: string[]): Slice[] => values.map((v, i) => ({ id: i, label: "", value: Decimal.from(v), color: "" }));
const style = { holeRadiusRatio: 0.85, cornerRadiusRatio: 0.5, roundInnerCorners: true };

test("the ring is the largest circle in the box, centered, with the hole a share of its radius", () => {
  const ring = ringOf(400, 300, 0.85);
  assert.deepEqual(ring, { cx: 200, cy: 150, outerRadius: 150, innerRadius: 127.5 });
  assert.equal(ringOf(-5, 10, 0.5).outerRadius, 0);
  assert.equal(ringOf(100, 100, 0).innerRadius, 0);
});

test("the shadow ring is shifted toward the hole, by at most half the thickness", () => {
  const ring = ringOf(200, 200, 0.85); // 100 and 85: 15 thick
  assert.deepEqual(shadowRingOf(ring, 0.06), { cx: 100, cy: 100, outerRadius: 100 - 5.1, innerRadius: 85 - 5.1 });
  const far = shadowRingOf(ring, 1); // 85 would be asked for; half the thickness is 7.5
  near(far.outerRadius, 92.5);
  near(far.innerRadius, 77.5);
  assert.deepEqual(shadowRingOf(ring, 0), ring);
});

test("the segments are contiguous, add up to 360, and carry the gap", () => {
  const ring = ringOf(200, 200, 0.85);
  const layout = computeSegments(data("1", "1", "2"), ring, { visualGapDeg: 2, ensureRenderableSlices: true, holeRadiusRatio: 0.85, bandCount: 0 });
  assert.equal(layout.gapDeg, 2);
  assert.equal(layout.innerGapDeg, 2);
  assert.deepEqual(layout.sweeps, [90, 90, 180]);
  assert.deepEqual(layout.starts, [0, 90, 180]);
  assert.deepEqual(layout.ends, [90, 180, 360]);
});

test("there is no gap for a single slice, and no inner gap for a small hole", () => {
  const one = computeSegments(data("5"), ringOf(200, 200, 0.85), { visualGapDeg: 5, ensureRenderableSlices: true, holeRadiusRatio: 0.85, bandCount: 0 });
  assert.equal(one.gapDeg, 0);
  const small = computeSegments(data("1", "1"), ringOf(200, 200, 0.2), { visualGapDeg: 5, ensureRenderableSlices: true, holeRadiusRatio: 0.2, bandCount: 0 });
  assert.equal(small.gapDeg, 5);
  assert.equal(small.innerGapDeg, 0);
});

test("an expanded band counts as one slice for the gaps, and takes 90° of the ring", () => {
  assert.equal(gapSliceCount(30, 0), 30);
  assert.equal(gapSliceCount(30, 6), 25);
  const layout = computeSegments(data("50", "25", "12.5", "6.25", "3.125", "3.125"), ringOf(200, 200, 0.85), {
    visualGapDeg: 1, ensureRenderableSlices: true, holeRadiusRatio: 0.85, bandCount: 2,
  });
  near(layout.sweeps[0]! + layout.sweeps[1]!, 90);
  near(layout.ends.at(-1)!, 360);
});

test("a slice's outline leaves the gap out of its sweep, half at each side", () => {
  const ring = ringOf(200, 200, 0.85);
  const layout = { gapDeg: 4, innerGapDeg: 4 };
  const path = slicePath(ring, style, layout, -90, 90, 1, 4)!;
  // 12 o'clock is -90°: the outline starts 2° after it and ends 2° before 3 o'clock.
  const [subpath] = parsePath(path.d);
  const arcs = subpath!.filter((p) => p.kind === "arc");
  const first = arcs[0]!;
  assert.ok(Math.hypot(first.from.x - 100, first.from.y - 100) > 0);
  const start = Math.atan2(first.from.y - 100, first.from.x - 100) * (180 / Math.PI);
  assert.ok(Math.abs(start - (-90 + 2 + Math.asin(3.75 / (100 - 3.75)) * (180 / Math.PI))) < 0.05, `starts at ${start}`);
});

test("nothing is left to draw when the gap takes the whole sweep, or none of it is revealed", () => {
  const ring = ringOf(200, 200, 0.85);
  assert.equal(slicePath(ring, style, { gapDeg: 5, innerGapDeg: 5 }, 0, 5, 1, 3), null);
  assert.equal(slicePath(ring, style, { gapDeg: 1, innerGapDeg: 1 }, 0, 90, 0, 3), null);
  assert.notEqual(slicePath(ring, style, { gapDeg: 1, innerGapDeg: 1 }, 0, 90, 0.5, 3), null);
});

test("a single slice is a closed ring, without corners", () => {
  const ring = ringOf(200, 200, 0.85);
  const whole = slicePath(ring, style, { gapDeg: 0, innerGapDeg: 0 }, -90, 360, 1, 1)!;
  assert.equal(whole.evenOdd, true);
  assert.equal(parsePath(whole.d).length, 2);
});

test("corners follow the style: none when the ratio is 0, and a sharp outline then", () => {
  const ring = ringOf(200, 200, 0.85);
  const round = outlineOf(ring, style, -90, 80, -90, 80, 5);
  const sharp = outlineOf(ring, { ...style, cornerRadiusRatio: 0 }, -90, 80, -90, 80, 5);
  assert.equal(parsePath(round.d)[0]!.filter((p) => p.kind === "arc").length, 6);
  assert.equal(parsePath(sharp.d)[0]!.filter((p) => p.kind === "arc").length, 2);
});
