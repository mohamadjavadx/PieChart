import { test } from "node:test";
import assert from "node:assert/strict";
import { fullRingPath, roundedSlicePath, sharpSlicePath, type Ring } from "../src/core/ringPath.ts";
import { computeCornerRadii } from "../src/core/sliceMath.ts";
import { cornerCount, parsePath, tangents, type Primitive } from "./svgPath.ts";

const ring: Ring = { cx: 100, cy: 100, outerRadius: 50, innerRadius: 40 };
const dist = (p: { x: number; y: number }, r: Ring): number => Math.hypot(p.x - r.cx, p.y - r.cy);

test("a sharp slice is two arcs and two sides", () => {
  // A quarter from 3 o'clock to 6 o'clock: out along the outer edge, in along the inner edge.
  const { d, evenOdd } = sharpSlicePath(ring, 0, 90, 0, 90);
  assert.equal(d, "M150 100A50 50 0 0 1 100 150L100 140A40 40 0 0 0 140 100Z");
  assert.equal(evenOdd, false);
});

test("a sweep of more than half a turn is a large arc", () => {
  const { d } = sharpSlicePath(ring, -90, 270, -90, 270);
  assert.match(d, /^M100 50A50 50 0 1 1 50 100L60 100A40 40 0 1 0 100 60Z$/);
});

test("angles are clockwise from 3 o'clock, and negative ones are fine", () => {
  const { d } = sharpSlicePath(ring, -90, 90, -90, 90); // 12 o'clock to 3 o'clock
  assert.equal(d, "M100 50A50 50 0 0 1 150 100L140 100A40 40 0 0 0 100 60Z");
});

test("a full turn is the whole ring: two circles, filled even-odd so the hole stays open", () => {
  const whole = sharpSlicePath(ring, 0, 360, 0, 360);
  assert.equal(whole.evenOdd, true);
  assert.deepEqual(whole, fullRingPath(ring));
  const subpaths = parsePath(whole.d);
  assert.equal(subpaths.length, 2);
  assert.ok(subpaths[0]!.every((p) => p.kind === "arc" && p.radius === 50));
  assert.ok(subpaths[1]!.every((p) => p.kind === "arc" && p.radius === 40));
});

test("with no hole the whole ring is a disc, and a slice comes to the center", () => {
  const disc = fullRingPath({ ...ring, innerRadius: 0 });
  assert.equal(disc.evenOdd, false);
  assert.equal(parsePath(disc.d).length, 1);
  const pie = sharpSlicePath({ ...ring, innerRadius: 0 }, 0, 90, 0, 90);
  assert.ok(!pie.d.includes("NaN"));
  assert.ok(pie.d.startsWith("M150 100A50 50 0 0 1 100 150L100 100"));
  assert.ok(pie.d.endsWith("Z"));
});

test("path data has no trailing zeros, no negative zero and no long fractions", () => {
  const { d } = sharpSlicePath({ cx: 0, cy: 0, outerRadius: 1 / 3, innerRadius: 0.2 }, 0, 45, 0, 45);
  assert.ok(!/\.\d{4}/.test(d), d);
  assert.ok(!/\.0(?!\d)/.test(d), d);
  assert.ok(!d.includes("-0 ") && !d.includes("-0A") && !d.includes("-0L") && !d.includes("-0Z"), d);
});

// Rounded slices: every corner is a circle that touches the ring's edge and the slice's side, so the
// outline turns no corner anywhere. That is the whole design, so it is what is checked.

const big: Ring = { cx: 200, cy: 150, outerRadius: 100, innerRadius: 85 };

function roundedOf(r: Ring, hole: number, ratio: number, outerStart: number, sweep: number, gap = 0, roundInner = true): Primitive[] {
  const outerSweep = sweep - gap;
  const radii = computeCornerRadii(outerSweep, outerSweep, r.outerRadius, r.innerRadius, hole, ratio, roundInner, 5);
  const { d } = roundedSlicePath(r, radii.outer, radii.inner, outerStart + gap / 2, outerSweep, outerStart + gap / 2, outerSweep);
  const subpaths = parsePath(d);
  assert.equal(subpaths.length, 1);
  return subpaths[0]!;
}

test("a rounded slice has two arcs, four corners and two straight sides", () => {
  const p = roundedOf(big, 0.85, 0.5, -90, 60);
  assert.equal(p.filter((x) => x.kind === "arc").length, 6);
  assert.equal(p.filter((x) => x.kind === "line").length, 2);
  const radii = new Set(p.filter((x) => x.kind === "arc").map((x) => (x as { radius: number }).radius));
  assert.deepEqual([...radii].sort((x, y) => x - y), [3.75, 85, 100]);
});

test("the corners join the edges and the sides without a turn", () => {
  const cases: Array<[string, Primitive[]]> = [
    ["a quarter", roundedOf(big, 0.85, 0.5, -90, 90)],
    ["a sixth with a gap", roundedOf(big, 0.85, 0.5, 17, 60, 2)],
    ["a big slice", roundedOf(big, 0.85, 1, 0, 200, 1)],
    ["a thin slice", roundedOf(big, 0.85, 0.5, 100, 4, 1)],
    ["a very thin slice", roundedOf(big, 0.85, 0.5, 100, 1.5, 0.5)],
    ["a thick ring", roundedOf({ ...big, innerRadius: 50 }, 0.5, 0.5, 30, 45, 1)],
    ["a thick ring, big corners", roundedOf({ ...big, innerRadius: 50 }, 0.5, 1, 30, 45, 1)],
    ["a start angle that is large", roundedOf(big, 0.85, 0.5, 810, 60, 1)],
  ];
  for (const [name, primitives] of cases) assert.equal(cornerCount(primitives), 0, name);
});

test("a corner that is not rounded stays a corner: the two on the hole side, when they are off", () => {
  assert.equal(cornerCount(roundedOf(big, 0.85, 0.5, 30, 45, 1, false)), 2);
  assert.equal(cornerCount(roundedOf({ ...big, innerRadius: 20 }, 0.2, 0.5, 30, 45, 1)), 2); // a small hole has none
  assert.equal(cornerCount(sharpSlicePath(big, 0, 60, 0, 60).d ? parsePath(sharpSlicePath(big, 0, 60, 0, 60).d)[0]! : []), 4);
});

test("the sides of a rounded slice are radial", () => {
  const p = roundedOf(big, 0.85, 0.5, 20, 70, 2);
  for (const side of p.filter((x) => x.kind === "line")) {
    const t = tangents(side).start;
    const from = { x: side.from.x - big.cx, y: side.from.y - big.cy };
    assert.ok(Math.abs(t.x * from.y - t.y * from.x) < 1e-2, "along a radius");
  }
});

test("the edges of a rounded slice are on the ring, and it lies between the two radii", () => {
  const p = roundedOf(big, 0.85, 0.5, 20, 70, 2);
  for (const part of p) {
    for (const point of [part.from, part.to]) {
      const distance = dist(point, big);
      assert.ok(distance <= 100 + 5e-3 && distance >= 85 - 5e-3, `${distance} is outside the ring`);
    }
  }
  const outerArc = p.find((x) => x.kind === "arc" && x.radius === 100)!;
  assert.ok(Math.abs(dist(outerArc.from, big) - 100) < 5e-3 && Math.abs(dist(outerArc.to, big) - 100) < 5e-3);
});

test("a rounded slice with no rounding is the sharp one", () => {
  assert.equal(roundedSlicePath(big, 0, 0, 0, 90, 0, 90).d, sharpSlicePath(big, 0, 90, 0, 90).d);
});
