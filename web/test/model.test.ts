import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/core/decimal.ts";
import { ChartModel, type SelectedSlice } from "../src/chart/model.ts";
import { OtherSliceId, type SliceInput } from "../src/core/types.ts";

const near = (actual: number, expected: number, tolerance = 1e-9): void =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected} (±${tolerance})`);

/** A chart of 200 by 200 px on a clock that only moves when the test says so. */
function chart(options: ConstructorParameters<typeof ChartModel>[0] = {}) {
  let now = 0;
  const model = new ChartModel({ clock: () => now, ...options });
  model.setSize(200, 200);
  const at = (t: number): boolean => {
    now = t;
    return model.advance(t);
  };
  return { model, at, set: (t: number) => { now = t; } };
}

const rows = (...values: string[]): SliceInput[] => values.map((v, i) => ({ id: i + 1, label: `Row ${i + 1}`, value: v, color: `#${i}${i}${i}` }));

/** The halving data of the demo: 50, 25, 12.5, ..., the last two equal. */
function halving(count: number): SliceInput[] {
  return Array.from({ length: count }, (_, i) => {
    const k = Math.min(i + 1, count - 1);
    return { id: i + 1, label: `Row ${i + 1}`, value: Decimal.parse(`${100n * 5n ** BigInt(k)}e-${k}`), color: `#${(i * 9973) % 4096}` };
  });
}

/** The point on the ring's middle, [degrees] clockwise from 12 o'clock, for a chart of 200 by 200 with the default hole. */
const onRing = (degrees: number): [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [100 + 92.5 * Math.sin(radians), 100 - 92.5 * Math.cos(radians)];
};

test("the first data grows into place, with the entry animation's easing", () => {
  const { model, at } = chart();
  model.setData(rows("1", "1", "2"));
  assert.equal(model.isAnimating, true);
  assert.equal(model.scene().slices.length, 0, "nothing is revealed yet");

  assert.equal(at(300), true);
  const half = model.scene();
  assert.equal(half.slices.length, 3);
  // Slices grow from their own start angle: each has some of its sweep. The first is a quarter of the ring.
  assert.ok(half.slices.every((s) => s.opacity === 1 && s.kind === "slice"));

  assert.equal(at(600), false);
  assert.equal(model.isAnimating, false);
  assert.equal(model.scene().slices.length, 3);
});

test("with no animation time the data is there at the first frame", () => {
  const { model, at } = chart({ animation: { revealDuration: 0, dataChangeDuration: 0 } });
  model.setData(rows("1", "1"));
  at(0);
  assert.equal(model.isAnimating, false);
  assert.equal(model.scene().slices.length, 2);
});

test("a tap selects a slice, dims the others and gives it a shadow", () => {
  const { model, at } = chart();
  const selections: Array<SelectedSlice | null> = [];
  const clicks: number[] = [];
  model.onSelectionChanged = (s) => selections.push(s);
  model.onSliceClick = (s) => clicks.push(s.id as number);
  model.setData(rows("1", "1", "2"));
  at(600);

  assert.equal(model.tap(...onRing(45)), true); // the first quarter, 12 to 3 o'clock
  assert.equal(model.selectedIndex, 0);
  assert.deepEqual(clicks, [1]);
  assert.equal(selections.length, 1);
  assert.equal(selections[0]!.data.id, 1);
  assert.equal(selections[0]!.total.toString(), "4");
  near(selections[0]!.fraction, 0.25);

  const scene = model.scene();
  // shadow and slice of the selected one, then the two others, dimmed by 0.6 (alpha 102 of 255)
  assert.deepEqual(scene.slices.map((s) => s.kind), ["shadow", "slice", "slice", "slice"]);
  assert.equal(scene.slices[0]!.opacity, 51 / 255);
  assert.equal(scene.slices[1]!.opacity, 1);
  assert.equal(scene.slices[2]!.opacity, 102 / 255);
  assert.equal(scene.slices[3]!.opacity, 102 / 255);
});

test("a tap that misses selects nothing, and a tap while the chart moves is not taken", () => {
  const { model, at } = chart();
  model.setData(rows("1", "1"));
  assert.equal(model.tap(...onRing(90)), false, "still revealing");
  at(600);
  assert.equal(model.tap(100, 100), false, "in the hole");
  assert.equal(model.tap(5, 5), false, "outside the ring");
  assert.equal(model.selectedIndex, -1);
});

test("a selection asked for during an animation is applied when it ends", () => {
  const { model, at } = chart();
  const seen: Array<number | null> = [];
  model.onSelectionChanged = (s) => seen.push(s ? s.index : null);
  model.setData(rows("1", "1", "1"));
  model.setSelectedIndex(2);
  assert.equal(model.selectedIndex, -1);
  at(300);
  assert.equal(model.selectedIndex, -1);
  at(600);
  assert.equal(model.selectedIndex, 2);
  assert.deepEqual(seen, [2]);
  model.setSelectedIndex(5); // no such slice
  assert.equal(model.selectedIndex, 2);
  model.setSelectedIndex(-1);
  assert.equal(model.selectedIndex, -1);
});

test("the selection follows its slice into new data, and is cleared when the slice is gone", () => {
  const { model, at } = chart({ animation: { revealDuration: 0, dataChangeDuration: 0 } });
  const seen: Array<number | null> = [];
  model.setData(rows("1", "1", "2"));
  at(0);
  model.setSelectedIndex(2);
  model.onSelectionChanged = (s) => seen.push(s ? (s.data.id as number) : null);

  // Reordered and resized: the same slice, at another place. Not a change of selection.
  model.setData([rows("3", "1", "1")[2]!, ...rows("3", "1", "1").slice(0, 2)].map((r, i) => ({ ...r, id: [3, 1, 2][i]! })));
  at(0);
  assert.equal(model.selectedIndex, 0);
  assert.deepEqual(seen, []);

  // The slice is gone: the selection ends, and the listener is told.
  model.setData(rows("1", "1"));
  at(0);
  assert.equal(model.selectedIndex, -1);
  assert.deepEqual(seen, [null]);
});

test("a change of data morphs from what is on screen, and an interrupted morph goes on from there", () => {
  const { model, at } = chart();
  model.setData(rows("1", "1"));
  at(600);
  model.setData(rows("1", "3"));
  assert.equal(model.isAnimating, true);
  const sweepOfFirst = (): number => {
    const [s] = model.scene().slices;
    return s ? Math.abs(s.path.d.length) : 0;
  };
  assert.ok(sweepOfFirst() > 0);
  at(300);
  const middle = model.scene();
  // Interrupt at the middle: new data, and the animation starts again from this picture.
  model.setData(rows("3", "1"));
  const restarted = model.scene();
  assert.deepEqual(restarted.slices.map((s) => s.path.d), middle.slices.map((s) => s.path.d), "no jump");
  at(1200);
  assert.equal(model.isAnimating, false);
  assert.equal(model.scene().slices.length, 2);
});

test("a slice that is removed shrinks away, and is gone at the end", () => {
  const { model, at } = chart();
  model.setData(rows("1", "1", "1"));
  at(600);
  model.setData(rows("1", "1"));
  assert.equal(model.scene().slices.length, 3, "the leaving slice is still drawn");
  at(900); // half way: it started at 600 and takes 600 ms
  assert.equal(model.scene().slices.length, 3);
  at(1200);
  assert.equal(model.scene().slices.length, 2);
});

test("clearing the data shows the empty ring, and ends the selection", () => {
  const { model, at } = chart();
  const seen: Array<number | null> = [];
  model.setData(rows("1", "1"));
  at(600);
  model.setSelectedIndex(1);
  model.onSelectionChanged = (s) => seen.push(s ? s.index : null);
  model.clearData();
  const scene = model.scene();
  assert.equal(scene.slices.length, 0);
  assert.equal(scene.placeholder!.color, "#CCCCCC");
  assert.equal(scene.placeholder!.path.evenOdd, true);
  assert.deepEqual(seen, [null]);
  assert.equal(model.tap(...onRing(45)), false);
});

test("values that are not above zero are left out, and the shares are exact", () => {
  const { model, at } = chart();
  model.setData([
    { id: "a", label: "A", value: "0.1", color: "#a" },
    { id: "b", label: "B", value: 0, color: "#b" },
    { id: "c", label: "C", value: "0.2", color: "#c" },
  ]);
  at(600);
  assert.deepEqual(model.slices.map((s) => s.id), ["a", "c"]);
  model.setSelectedIndex(0);
  assert.equal(model.selection!.total.toString(), "0.3");
});

test("there is no room for a chart when the padding takes it all", () => {
  const { model, at } = chart();
  model.setData(rows("1", "1"));
  at(600);
  model.setSize(200, 200, 100);
  assert.equal(model.scene().slices.length, 0);
  assert.equal(model.tap(100, 100), false);
  model.setSize(200, 200, 10);
  assert.equal(model.scene().slices.length, 2);
});

test("sizes in dp become ratios for the chart's size, and stay that size when it is resized", () => {
  const { model } = chart();
  model.setStyle({ cornerRadiusDp: 4, visualGapDp: 2, selectedShadowOffsetDp: 6 });
  // 200 px: radius 100, hole 85, ring 15 thick. The corner is 4 of half the thickness (7.5).
  near(model.style.cornerRadiusRatio, 4 / 7.5);
  near(model.style.visualGapDeg, (2 / 100) * (180 / Math.PI));
  near(model.style.selectedShadowOffsetRatio, 6 / 85);
  model.setSize(400, 400);
  near(model.style.cornerRadiusRatio, 4 / 15);
  near(model.style.visualGapDeg, (2 / 200) * (180 / Math.PI));
  assert.equal(model.style.cornerRadiusDp, 4);
  // A unit that is given replaces the one the setting had.
  model.setStyle({ cornerRadiusRatio: 0.25 });
  assert.equal(model.style.cornerRadiusDp, null);
  assert.equal(model.style.cornerRadiusRatio, 0.25);
  assert.throws(() => model.setStyle({ visualGapDeg: 1, visualGapDp: 1 }), TypeError);
});

test("a change of style ends the running animation and jumps to the final layout", () => {
  const { model } = chart();
  model.setData(rows("1", "1", "1"));
  assert.equal(model.isAnimating, true);
  model.setStyle({ holeRadiusRatio: 0.5 });
  assert.equal(model.isAnimating, false);
  assert.equal(model.scene().slices.length, 3);
});

test("numbers that are not finite are not given", () => {
  const { model } = chart();
  model.setStyle({ holeRadiusRatio: Number.NaN, unselectedDim: Number.POSITIVE_INFINITY, visualGapDeg: 999 });
  assert.equal(model.style.holeRadiusRatio, 0.85);
  assert.equal(model.style.unselectedDim, 0.6);
  assert.equal(model.style.visualGapDeg, 360, "and a gap is at most a full turn");
});

// ---------------------------------------------------------------- Small slices

test("small slices are grouped into one that a tap opens, next to the big slices in one dimmed arc", () => {
  const { model, at } = chart({ style: { groupSmallSlices: true } });
  const expanded: boolean[] = [];
  const clicked: unknown[] = [];
  const selected: Array<unknown> = [];
  model.onGroupExpandedChanged = (e) => expanded.push(e);
  model.onSliceClick = (s) => clicked.push(s.id);
  model.onSelectionChanged = (s) => selected.push(s ? s.data.id : null);

  model.setData(halving(30));
  at(600);
  // With a gap of 1° a slice under 3° is small: rows 1 to 6 are big, and the rest are the group.
  assert.equal(model.slices.length, 7);
  assert.equal(model.slices[6]!.id, OtherSliceId);
  assert.equal(model.isGroupExpanded, false);
  assert.equal(model.scene().band, null);

  // The group is 11° of the ring, at the end: 349° to 360°, just before 12 o'clock.
  assert.equal(model.tap(...onRing(354.5)), true);
  assert.equal(model.isGroupExpanded, true);
  assert.deepEqual(expanded, [true]);
  // The first of the small slices is selected, at once, and the listener is told what a tap would have told it.
  assert.equal(model.slices.length, 30);
  assert.equal(model.band, 6);
  assert.equal(model.selectedIndex, 6);
  assert.deepEqual(clicked, [7]);
  assert.deepEqual(selected, [7]);

  at(1200);
  assert.equal(model.isAnimating, false);
  const scene = model.scene();
  assert.ok(scene.band, "the big slices are one band");
  assert.equal(scene.band!.sectors.length, 6);
  // Dimmed by 0.6 (the library's default): a small slice is selected, so the others are dimmed by 0.6 too, and
  // 255 * 0.4 * 0.4 is 40.8.
  assert.equal(scene.band!.opacity, 41 / 255);
  model.setSelectedIndex(-1);
  assert.equal(model.scene().band!.opacity, 102 / 255, "with nothing selected: 40% of 255");
  model.setSelectedIndex(6);
  // Nothing in the band can be selected; a tap on it closes the group and selects the first slice.
  assert.equal(model.tap(...onRing(45)), true);
  assert.equal(model.isGroupExpanded, false);
  assert.deepEqual(expanded, [true, false]);
  assert.equal(model.selectedIndex, 0);
  assert.deepEqual(clicked, [7, 1]);
  at(2400);
  assert.equal(model.scene().band, null);
  assert.equal(model.slices.length, 7);
});

test("the group and the slices of the band can not be selected", () => {
  const { model, at } = chart({ style: { groupSmallSlices: true } });
  model.setData(halving(30));
  at(600);
  model.setSelectedIndex(6); // the group
  assert.equal(model.selectedIndex, -1);
  model.setSelectedIndex(0);
  assert.equal(model.selectedIndex, 0);
  model.expandGroup();
  // The selected big slice is now in the band: it is deselected, and the first small slice is selected.
  assert.equal(model.selectedIndex, 6);
  at(1200);
  model.setSelectedIndex(2); // in the band
  assert.equal(model.selectedIndex, 6);
  assert.ok(model.selectableSlices.every((s) => s.index >= 6));
  assert.equal(model.selectableSlices.length, 24);
});

test("expandGroup is nothing without a group, and collapseGroup is nothing when it is not open", () => {
  const { model, at } = chart({ style: { groupSmallSlices: true } });
  model.setData(rows("1", "1", "1"));
  at(600);
  model.expandGroup();
  assert.equal(model.isGroupExpanded, false);
  model.collapseGroup();
  assert.equal(model.isGroupExpanded, false);
});

test("the group collapses by itself when it goes away, and tells the listener", () => {
  const { model, at } = chart({ style: { groupSmallSlices: true } });
  const expanded: boolean[] = [];
  model.onGroupExpandedChanged = (e) => expanded.push(e);
  model.setData(halving(30));
  at(600);
  model.expandGroup();
  at(1200);
  assert.deepEqual(expanded, [true]);

  model.setStyle({ groupSmallSlices: false });
  assert.deepEqual(expanded, [true, false]);
  assert.equal(model.isGroupExpanded, false);
  assert.equal(model.slices.length, 30);
  assert.equal(model.scene().band, null);

  model.setStyle({ groupSmallSlices: true });
  model.expandGroup();
  at(2400);
  model.setData(rows("1", "1", "1")); // nothing is small now
  at(4000);
  assert.deepEqual(expanded, [true, false, true, false]);
});

test("the group's slice is worth what the small ones are, and its selection numbers stay true", () => {
  const { model, at } = chart({ style: { groupSmallSlices: true } });
  model.setData(halving(30));
  at(600);
  model.expandGroup();
  at(1200);
  const first = model.selection!;
  assert.equal(first.data.id, 7);
  assert.equal(first.total.toString(), "100", "the total of all the data, not of what is on the ring");
  near(first.fraction, 0.0078125); // 0.78125 of 100
});
