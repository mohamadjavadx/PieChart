// The TypeScript core against the Android library: test/fixtures/core.json holds what the library's own
// Kotlin code answered for many inputs (see tools/kotlin-fixtures), and every answer is checked here.
// Kotlin computes in 32-bit floats and this port in 64-bit ones, so numbers match to a small tolerance;
// exact decimals must match to the last digit.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/core/decimal.ts";
import { groupSlices } from "../src/core/grouping.ts";
import { planMorph } from "../src/core/morph.ts";
import {
  computeCornerRadii, computeGapDeg, computeInnerGapDeg, computeTargetSweeps, degreesOfArc, enforceMinSweepAngle,
  ratioOfPx, sliceIndexAt,
} from "../src/core/sliceMath.ts";
import { totalOf } from "../src/core/slices.ts";
import { OtherSliceId, type Slice } from "../src/core/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixtures: any = JSON.parse(readFileSync(new URL("./fixtures/core.json", import.meta.url), "utf8"));

/** The number a 32-bit float in the fixtures stands for. */
const f32 = Math.fround;

function close(actual: number, expected: number, what: string, relative = 1e-5, absolute = 2e-4): void {
  const tolerance = absolute + relative * Math.abs(expected);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not ${expected} (±${tolerance})`);
}

function closeAll(actual: readonly number[], expected: readonly number[], what: string, relative?: number, absolute?: number): void {
  assert.equal(actual.length, expected.length, `${what}: length`);
  for (let i = 0; i < expected.length; i++) close(actual[i]!, expected[i]!, `${what}[${i}]`, relative, absolute);
}

const dataset = (name: string): Slice[] =>
  fixtures.datasets[name].map((row: any): Slice => ({ id: row.id, label: `Row ${row.id}`, value: Decimal.from(row.value), color: "" }));

const idName = (id: unknown): string => (id === OtherSliceId ? "OTHER" : String(id));

test("the fixtures are there, and are many", () => {
  assert.ok(fixtures.sweeps.length > 100);
  assert.ok(fixtures.cornerRadii.length > 500);
  assert.ok(fixtures.hitTest.length > 500);
  assert.ok(fixtures.morph.length > 10);
});

test("decimal: divisions match Java's BigDecimal with DECIMAL64, to the last digit", () => {
  for (const { a, b, quotient } of fixtures.decimal.quotients) {
    assert.equal(Decimal.from(a).divide(Decimal.from(b)).toString(), quotient, `${a} / ${b}`);
  }
});

test("decimal: sums are exact, and numbers are the nearest ones", () => {
  for (const { values, sum } of fixtures.decimal.sums) {
    assert.equal(Decimal.sum(values.map((v: string) => Decimal.from(v))).toString(), sum);
  }
  for (const { value, number } of fixtures.decimal.toNumber) {
    assert.equal(Decimal.from(value).toNumber(), number, value);
  }
});

test("gaps, ratios, arcs and the minimum sweep match", () => {
  for (const c of fixtures.math.gap) close(computeGapDeg(c.count, f32(c.gap), c.ensure), c.result, `gap ${JSON.stringify(c)}`);
  for (const c of fixtures.math.innerGap) {
    assert.equal(computeInnerGapDeg(f32(c.gap), f32(c.hole), c.innerRadius, c.hasSlices), c.result, JSON.stringify(c));
  }
  for (const c of fixtures.math.ratioOfPx) close(ratioOfPx(c.px, c.whole), c.result, `ratio ${JSON.stringify(c)}`);
  for (const c of fixtures.math.degreesOfArc) close(degreesOfArc(c.arcPx, c.radius), c.result, `arc ${JSON.stringify(c)}`, 1e-6, 1e-5);
  for (const c of fixtures.math.enforce) {
    const sweeps: number[] = [...c.input];
    enforceMinSweepAngle(sweeps, c.min);
    closeAll(sweeps, c.result, `enforce ${JSON.stringify(c.input)}`);
  }
});

test("target sweeps match, with and without a band, for every dataset", () => {
  for (const c of fixtures.sweeps) {
    const data = dataset(c.dataset);
    const sweeps = computeTargetSweeps(data, totalOf(data), f32(c.gap), c.ensure, c.bandCount, c.bandSweep);
    closeAll(sweeps, c.sweeps, `sweeps ${c.dataset} gap ${c.gap} ensure ${c.ensure} band ${c.bandCount}`, 1e-5, 1e-3);
  }
});

test("corner radii match over a grid of sweeps, radii, holes and ratios", () => {
  for (const c of fixtures.cornerRadii) {
    const r = computeCornerRadii(c.outerSweep, c.innerSweep, c.outerRadius, c.innerRadius, c.hole, c.ratio, c.roundInner, c.count);
    const what = JSON.stringify(c);
    close(r.outer, c.outer, `outer ${what}`, 1e-4, 1e-3);
    close(r.inner, c.inner, `inner ${what}`, 1e-4, 1e-3);
  }
});

test("grouping matches: which slices, in which order, how many in the band, and the group's exact value", () => {
  for (const c of fixtures.grouping) {
    const grouped = groupSlices(dataset(c.dataset), { gapDeg: f32(c.gap), expanded: c.expanded, otherColor: "" });
    const what = `${c.dataset} gap ${c.gap} ${c.expanded ? "expanded" : "collapsed"}`;
    assert.equal(grouped.hasGroup, c.hasGroup, what);
    assert.equal(grouped.bandCount, c.bandCount, what);
    assert.deepEqual(grouped.slices.map((s) => idName(s.id)), c.ids, what);
    grouped.slices.forEach((s, i) => {
      if (s.id === OtherSliceId) {
        // Kotlin adds the gap to 10 in 32-bit floats, and this in 64-bit ones: the value agrees to about 1e-7.
        close(s.value.toNumber(), Number(c.values[i]), `${what}: the group's value`, 1e-6, 1e-12);
      } else {
        assert.equal(s.value.toString(), c.values[i], `${what}: value of ${idName(s.id)}`);
      }
    });
  }
});

test("hit testing matches for random points, start angles, gaps, bands and exiting slices", () => {
  for (const c of fixtures.hitTest) {
    const starts: number[] = [];
    const ends: number[] = [];
    let cursor = 0;
    for (const sweep of c.sweeps as number[]) {
      starts.push(cursor);
      cursor += sweep;
      ends.push(cursor);
    }
    const result = sliceIndexAt({
      x: c.x, y: c.y, cx: c.cx, cy: c.cy, innerTouchBound: c.inner, outerTouchBound: c.outer, startAngleDeg: c.start,
      gapDeg: c.gap, fullSweeps: c.sweeps, segStarts: starts, segEnds: ends, renderIndexMap: c.map, bandCount: c.band,
    });
    assert.equal(result, c.result, JSON.stringify(c));
  }
});

test("morph plans match: the render list, what goes where, and the animation at some moments", () => {
  const sliceOf = (id: string): Slice => ({ id: id === "OTHER" ? OtherSliceId : id, label: id, value: Decimal.from("1"), color: "" });
  for (const c of fixtures.morph) {
    // Ids that are numbers in Kotlin are strings here; the plan only ever compares them.
    const old = (c.old as string[]).map(sliceOf);
    const next = (c.new as string[]).map(sliceOf);
    const m = planMorph(old, c.oldMap, c.oldSweeps, next, c.newSweeps, c.seed, c.fromGap, c.toGap, c.oldBand, c.newBand);
    assert.deepEqual(m.renderList.map((s) => idName(s.id)), c.render, c.name);
    assert.deepEqual([...m.renderIndexMap], c.renderMap, c.name);
    assert.equal(m.isVisuallyIdentical, c.identical, c.name);
    closeAll(m.from, c.from, `${c.name}: from`);
    closeAll(m.to, c.to, `${c.name}: to`);
    closeAll(m.bandFrom, c.bandFrom, `${c.name}: bandFrom`);
    closeAll(m.bandTo, c.bandTo, `${c.name}: bandTo`);
    (c.progress as number[]).forEach((p, k) => {
      closeAll(m.from.map((_, i) => m.sweepAt(i, p)), c.sweepAt[k], `${c.name}: sweep at ${p}`);
      closeAll(m.from.map((_, i) => m.bandAt(i, p)), c.bandAt[k], `${c.name}: band at ${p}`);
      close(m.gapAt(p), c.gapAt[k], `${c.name}: gap at ${p}`);
      close(m.fractionAt(p), c.fractionAt[k], `${c.name}: fraction at ${p}`);
    });
  }
});
