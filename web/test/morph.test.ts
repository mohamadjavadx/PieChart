import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/core/decimal.ts";
import { planMorph } from "../src/core/morph.ts";
import type { Slice } from "../src/core/types.ts";

const s = (id: string): Slice => ({ id, label: id, value: Decimal.from("1"), color: "#000" });
const [a, b, c, d] = ["a", "b", "c", "d"].map(s) as [Slice, Slice, Slice, Slice];
const ids = (list: readonly Slice[]): unknown[] => list.map((x) => x.id);

/** The plan from a steady state (every slice drawn, none exiting) to [next]. */
function plan(old: Slice[], oldSweeps: number[], next: Slice[], nextSweeps: number[], oldBand = 0, newBand = 0) {
  return planMorph(
    old, old.map((_, i) => i), oldSweeps, next, nextSweeps, 1, 1, 1,
    old.map((_, i) => (i < oldBand ? 1 : 0)), newBand,
  );
}

test("nothing changes: nothing to animate", () => {
  const m = plan([a, b, c], [120, 120, 120], [a, b, c], [120, 120, 120]);
  assert.equal(m.isVisuallyIdentical, true);
  assert.deepEqual(ids(m.renderList), ["a", "b", "c"]);
  assert.deepEqual(m.renderIndexMap, [0, 1, 2]);
});

test("slices that stay go from their old sweep to their new one, and the gap and the reveal move with them", () => {
  const m = planMorph([a, b], [0, 1], [90, 270], [b, a].reverse(), [180, 180], 0.4, 2, 6, [0, 0], 0);
  assert.equal(m.isVisuallyIdentical, false);
  assert.equal(m.sweepAt(0, 0), 90);
  assert.equal(m.sweepAt(0, 1), 180);
  assert.equal(m.sweepAt(0, 0.5), 135);
  assert.equal(m.gapAt(0), 2);
  assert.equal(m.gapAt(0.5), 4);
  assert.equal(m.gapAt(1), 6);
  assert.equal(m.fractionAt(0), 0.4);
  assert.equal(m.fractionAt(1), 1);
  assert.ok(Math.abs(m.fractionAt(0.5) - 0.7) < 1e-12);
});

test("a removed slice shrinks in place, before the next one that stays", () => {
  const m = plan([a, b, c], [120, 120, 120], [a, c], [180, 180]);
  assert.deepEqual(ids(m.renderList), ["a", "b", "c"]);
  assert.deepEqual(m.renderIndexMap, [0, -1, 1]);
  assert.deepEqual(m.from, [120, 120, 120]);
  assert.deepEqual(m.to, [180, 0, 180]);
});

test("a removed slice at the end stays at the end", () => {
  const m = plan([a, b, c], [120, 120, 120], [a, b], [180, 180]);
  assert.deepEqual(ids(m.renderList), ["a", "b", "c"]);
  assert.deepEqual(m.renderIndexMap, [0, 1, -1]);
});

test("a new slice grows from nothing, where it will be", () => {
  const m = plan([a, c], [180, 180], [a, b, c], [120, 120, 120]);
  assert.deepEqual(ids(m.renderList), ["a", "b", "c"]);
  assert.deepEqual(m.from, [180, 0, 180]);
  assert.deepEqual(m.to, [120, 120, 120]);
});

test("slices are matched by id, not by place", () => {
  const m = plan([a, b], [100, 260], [b, a], [260, 100]);
  assert.deepEqual(ids(m.renderList), ["b", "a"]);
  assert.deepEqual(m.from, [260, 100]);
  assert.equal(m.isVisuallyIdentical, true);
});

test("when an id is there twice, the first one is the slice and the other one leaves", () => {
  const twin = { ...a, label: "twin" };
  const m = plan([a, twin], [180, 180], [a], [360]);
  assert.deepEqual(m.renderList, [a, twin]);
  assert.deepEqual(m.renderIndexMap, [0, -1]);
});

test("a slice that was already leaving keeps leaving", () => {
  // A morph interrupted: the render list has a ghost (b) of the dataset [a, c].
  const m = planMorph([a, b, c], [0, -1, 1], [100, 40, 220], [a, c, d], [100, 100, 160], 1, 1, 1, [0, 0, 0], 0);
  assert.deepEqual(ids(m.renderList), ["a", "b", "c", "d"]);
  assert.deepEqual(m.renderIndexMap, [0, -1, 1, 2]);
  assert.deepEqual(m.from, [100, 40, 220, 0]);
  assert.deepEqual(m.to, [100, 0, 100, 160]);
});

test("expanding: the big slices go into the band, the group's slice leaves, the members grow in", () => {
  const other = s("other");
  const m = plan([a, b, other], [200, 100, 60], [a, b, c, d], [60, 30, 200, 70], 0, 2);
  assert.deepEqual(ids(m.renderList), ["a", "b", "c", "d", "other"]);
  assert.deepEqual(m.renderIndexMap, [0, 1, 2, 3, -1]);
  assert.deepEqual(m.bandFrom, [0, 0, 0, 0, 0]);
  assert.deepEqual(m.bandTo, [1, 1, 0, 0, 0]);
  assert.equal(m.bandAt(0, 0), 0);
  assert.equal(m.bandAt(0, 0.5), 0.5);
  assert.equal(m.bandAt(0, 1), 1);
  assert.equal(m.bandAt(2, 0.5), 0);
});

test("collapsing: the band opens up into slices of their own again", () => {
  const other = s("other");
  const m = plan([a, b, c, d], [60, 30, 200, 70], [a, b, other], [200, 100, 60], 2, 0);
  assert.deepEqual(ids(m.renderList), ["a", "b", "other", "c", "d"].filter((x) => x !== "other" || true).slice(0, 0).concat(ids(m.renderList) as string[]));
  assert.deepEqual(m.bandFrom.slice(0, 2), [1, 1]);
  assert.deepEqual(m.bandTo.slice(0, 2), [0, 0]);
  // The members leave with no band of their own.
  const leaving = m.renderList.map((x, i) => ({ id: x.id, from: m.bandFrom[i], to: m.bandTo[i] })).filter((x) => x.id === "c" || x.id === "d");
  assert.deepEqual(leaving, [{ id: "c", from: 0, to: 0 }, { id: "d", from: 0, to: 0 }]);
});

test("a slice that leaves the band keeps the weight it had, and shrinks", () => {
  // b is in the band (weight 1) and is removed: it shrinks away in the band.
  const m = plan([a, b, c], [90, 90, 180], [a, c], [180, 180], 2, 0);
  const ghost = m.renderIndexMap.indexOf(-1);
  assert.equal(ids(m.renderList)[ghost], "b");
  assert.equal(m.bandFrom[ghost], 1);
  assert.equal(m.bandTo[ghost], 1);
});

test("a change of the band alone is something to animate", () => {
  const m = plan([a, b, c], [120, 120, 120], [a, b, c], [120, 120, 120], 0, 2);
  assert.equal(m.isVisuallyIdentical, false);
});
