import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/core/decimal.ts";
import {
  computeCornerRadii, computeGapDeg, computeInnerGapDeg, computeTargetSweeps, degreesOfArc, enforceMinSweepAngle,
  ratioOfPx, sliceIndexAt, type HitTestInput,
} from "../src/core/sliceMath.ts";
import { totalOf } from "../src/core/slices.ts";
import type { Slice } from "../src/core/types.ts";

const slice = (id: number, value: string): Slice => ({ id, label: `Row ${id}`, value: Decimal.from(value), color: "#000" });
const near = (actual: number, expected: number, tolerance = 1e-9): void =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected} (±${tolerance})`);
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

test("ratioOfPx is a share of the whole, from 0 to 1", () => {
  assert.equal(ratioOfPx(25, 100), 0.25);
  assert.equal(ratioOfPx(500, 100), 1);
  assert.equal(ratioOfPx(-5, 100), 0);
  assert.equal(ratioOfPx(10, 0), 0);
});

test("degreesOfArc is the angle an arc of that length has on that circle", () => {
  near(degreesOfArc(Math.PI, 2), 90);
  near(degreesOfArc(100, 100), 180 / Math.PI);
  assert.equal(degreesOfArc(10, 0), 0);
  assert.equal(degreesOfArc(1e9, 1), 360);
});

test("computeGapDeg", () => {
  assert.equal(computeGapDeg(1, 5, true), 0);
  assert.equal(computeGapDeg(0, 5, true), 0);
  assert.equal(computeGapDeg(10, -3, false), 0);
  assert.equal(computeGapDeg(10, 2, false), 2);
  assert.equal(computeGapDeg(200, 2, false), 2);
  assert.equal(computeGapDeg(10, 2, true), 2);
  near(computeGapDeg(200, 1, true), 0.8); // 200 slices need 200 * (gap + 1) <= 360
  assert.equal(computeGapDeg(400, 1, true), 0); // no room for any gap
});

test("computeInnerGapDeg", () => {
  assert.equal(computeInnerGapDeg(2, 0.85, 80, true), 2);
  assert.equal(computeInnerGapDeg(2, 0.2, 20, true), 0); // hole too small for inner features
  assert.equal(computeInnerGapDeg(2, 0.85, 0, true), 0);
  assert.equal(computeInnerGapDeg(0, 0.85, 80, true), 0);
  assert.equal(computeInnerGapDeg(2, 0.85, 80, false), 0);
});

test("enforceMinSweepAngle raises the small and takes it from the large, keeping 360", () => {
  const sweeps = [10, 0.5, 0.5, 349];
  enforceMinSweepAngle(sweeps, 2);
  assert.equal(sweeps[1], 2);
  assert.equal(sweeps[2], 2);
  near(sweeps[0]!, 10 - (8 / 355) * 3);
  near(sweeps[3]!, 349 - (347 / 355) * 3);
  near(sum(sweeps), 360);
});

test("enforceMinSweepAngle leaves zero sweeps alone, and does nothing when nothing is small", () => {
  const withZero = [0, 100, 260];
  enforceMinSweepAngle(withZero, 2);
  assert.deepEqual(withZero, [0, 100, 260]);
  const big = [180, 180];
  enforceMinSweepAngle(big, 2);
  assert.deepEqual(big, [180, 180]);
});

test("computeTargetSweeps shares 360 in proportion to the values", () => {
  const data = [slice(1, "1"), slice(2, "1"), slice(3, "2")];
  assert.deepEqual(computeTargetSweeps(data, totalOf(data), 1, false), [90, 90, 180]);
});

test("computeTargetSweeps enforces the minimum on request", () => {
  const data = [slice(1, "1000"), slice(2, "1"), slice(3, "1")];
  const raw = computeTargetSweeps(data, totalOf(data), 1, false);
  const enforced = computeTargetSweeps(data, totalOf(data), 1, true);
  assert.ok(raw[1]! < 1);
  assert.equal(enforced[1], 2); // gap + 1
  near(sum(enforced), 360);
});

test("computeTargetSweeps skips the minimum when there is no room for it", () => {
  const data = Array.from({ length: 200 }, (_, i) => slice(i + 1, i === 0 ? "1000" : "1"));
  const sweeps = computeTargetSweeps(data, totalOf(data), 1.5, true); // 200 * 2.5 > 360
  assert.ok(sweeps[5]! < 1);
});

test("a band takes exactly its sweep, in proportion inside, and the rest share what is left", () => {
  const data = [slice(1, "3"), slice(2, "1"), slice(3, "1"), slice(4, "1")];
  const sweeps = computeTargetSweeps(data, totalOf(data), 1, false, 2, 90);
  near(sweeps[0]!, 67.5);
  near(sweeps[1]!, 22.5);
  near(sweeps[2]!, 135);
  near(sweeps[3]!, 135);
  near(sum(sweeps), 360);
});

test("no minimum is enforced inside a band, and the others are enforced among themselves", () => {
  const data = [slice(1, "1000"), slice(2, "1"), slice(3, "1"), slice(4, "1"), slice(5, "1")];
  const sweeps = computeTargetSweeps(data, totalOf(data), 1, true, 3, 90);
  near(sweeps[0]! + sweeps[1]! + sweeps[2]!, 90);
  assert.ok(sweeps[1]! < 1, "a slice of the band stays as small as its share");
  assert.equal(sweeps[3]! > 0, true);
  near(sum(sweeps), 360);
});

test("a band that is all the data, or none of it, is not a band", () => {
  const data = [slice(1, "1"), slice(2, "1")];
  assert.deepEqual(computeTargetSweeps(data, totalOf(data), 0, false, 2, 90), [180, 180]);
  assert.deepEqual(computeTargetSweeps(data, totalOf(data), 0, false, 0, 90), [180, 180]);
});

test("computeCornerRadii", () => {
  const radii = (o: number, i: number, ratio = 0.5, hole = 0.85, inner = true, count = 5) =>
    computeCornerRadii(o, i, 100, hole * 100, hole, ratio, inner, count);
  assert.deepEqual(radii(90, 90), { outer: 3.75, inner: 3.75 }); // half the thickness (15 / 2) times 0.5
  assert.deepEqual(radii(90, 90, 0), { outer: 0, inner: 0 });
  assert.deepEqual(radii(90, 90, 0.5, 0.85, true, 1), { outer: 0, inner: 0 }); // a single slice is a closed ring
  assert.deepEqual(computeCornerRadii(90, 90, 0, 0, 0.85, 0.5, true, 5), { outer: 0, inner: 0 }); // no ring
  assert.equal(radii(90, 90, 0.5, 0.85, false).inner, 0);
  assert.equal(radii(90, 90, 0.5, 0.2).inner, 0); // a small hole has no inner corners
  // A thin slice cannot have corners as big as the thick ones: they are limited by its sweep.
  const thin = radii(2, 2);
  near(thin.outer, (Math.sin(Math.PI / 180) * 100) / (1 + Math.sin(Math.PI / 180)), 1e-12);
  near(thin.inner, (Math.sin(Math.PI / 180) * 85) / (1 - Math.sin(Math.PI / 180)), 1e-12);
  // Together they never take more than the ring's thickness.
  const big = radii(90, 90, 1.5);
  near(big.outer + big.inner, 15);
  near(big.outer, 7.5);
});

const ring = { cx: 100, cy: 100, innerTouchBound: 80, outerTouchBound: 108, startAngleDeg: -90, gapDeg: 0 };
const four = {
  ...ring,
  fullSweeps: [90, 90, 90, 90],
  segStarts: [0, 90, 180, 270],
  segEnds: [90, 180, 270, 360],
  renderIndexMap: [0, 1, 2, 3],
};
const hit = (x: number, y: number, extra: Partial<HitTestInput> = {}): number => sliceIndexAt({ ...four, x, y, ...extra });

test("sliceIndexAt finds the slice under a point, counting from the start angle", () => {
  assert.equal(hit(105, 10), 0); // just right of 12 o'clock
  assert.equal(hit(190, 105), 1); // 3 o'clock, a bit below
  assert.equal(hit(95, 190), 2); // 6 o'clock, a bit left
  assert.equal(hit(10, 95), 3); // 9 o'clock, a bit above
});

test("sliceIndexAt is -1 outside the ring", () => {
  assert.equal(hit(100, 100), -1); // in the hole
  assert.equal(hit(100, 30), -1); // radius 70 < 80
  assert.equal(hit(100, -10), -1); // radius 110 > 108
});

test("sliceIndexAt handles any start angle", () => {
  assert.equal(hit(105, 10, { startAngleDeg: 0 }), 3); // 12 o'clock is 270° after 3 o'clock
  assert.equal(hit(190, 105, { startAngleDeg: 1080 - 90 }), 1);
});

test("sliceIndexAt ignores exiting slices, and slices too small to be drawn", () => {
  assert.equal(hit(105, 10, { renderIndexMap: [-1, 1, 2, 3] }), -1);
  assert.equal(hit(105, 10, { gapDeg: 90 }), -1); // sweeps that do not exceed the gap are not drawn
  // ... but a slice of a band is drawn without gaps, so it is always there.
  assert.equal(hit(105, 10, { gapDeg: 90, bandCount: 1 }), 0);
  assert.equal(hit(190, 105, { gapDeg: 90, bandCount: 1 }), -1);
});
