import { test } from "node:test";
import assert from "node:assert/strict";
import { ChartModel } from "../src/chart/model.ts";
import {
  accessibleItems, actionForKey, DEFAULT_ACCESSIBLE_TEXT, initialActive, percentText, spokenNumber, type AccessibleItem,
} from "../src/a11y/items.ts";
import { Decimal } from "../src/core/decimal.ts";
import type { SliceInput } from "../src/core/types.ts";

/** The demo's data: values halve, and the last two are equal, 100 in all. */
function halving(count: number): SliceInput[] {
  return Array.from({ length: count }, (_, i) => {
    const k = Math.min(i + 1, Math.max(count - 1, 1));
    return { id: i + 1, label: `Row ${i + 1}`, value: Decimal.parse(`${100n * 5n ** BigInt(k)}e-${k}`), color: "#123456" };
  });
}

function chart(count: number, group = false): ChartModel {
  const model = new ChartModel({
    density: 1, animation: { revealDuration: 0, dataChangeDuration: 0 },
    style: { groupSmallSlices: group, visualGapDeg: 2 },
  });
  model.setSize(400, 400, 20);
  model.setData(halving(count));
  model.advance(Number.MAX_SAFE_INTEGER);
  return model;
}

const items = (model: ChartModel): AccessibleItem[] => accessibleItems(model, DEFAULT_ACCESSIBLE_TEXT);

test("percentages have three significant digits at most", () => {
  assert.equal(percentText(0.5), "50%");
  assert.equal(percentText(0.0625), "6.25%");
  assert.equal(percentText(0.000976562), "0.0977%");
  assert.equal(percentText(1 / 3), "33.3%");
  assert.equal(percentText(1), "100%");
});

test("long numbers are read to eight significant digits, and short ones as they are", () => {
  assert.equal(spokenNumber(Decimal.parse("1200.50")), "1200.5");
  assert.equal(spokenNumber(Decimal.parse("0.09765625")), "0.09765625");
  assert.equal(spokenNumber(Decimal.parse("3.244853969082281")), "3.244854");
  assert.equal(spokenNumber(Decimal.parse("12345678901")), "12345679000");
});

test("every slice is an option, in the order of the ring, and the selected one says so", () => {
  const model = chart(4);
  model.setSelectedIndex(1);
  const all = items(model);
  assert.deepEqual(all.map((i) => i.kind), ["slice", "slice", "slice", "slice"]);
  assert.deepEqual(all.map((i) => i.selected), [false, true, false, false]);
  assert.equal(all[0]!.text, "Row 1, 50 of 100, 50%");
  assert.equal(all[1]!.text, "Row 2, 25 of 100, 25%");
  assert.equal(initialActive(all), 1);
});

test("with no selection, focus starts on the first option", () => {
  const model = chart(3);
  assert.equal(model.selectedIndex, -1);
  assert.equal(initialActive(items(model)), 0);
  assert.equal(initialActive([]), -1);
});

test("a closed group is an option after the big slices, and says how many it holds", () => {
  const model = chart(30, true);
  const all = items(model);
  const group = all[all.length - 1]!;
  assert.equal(group.kind, "group");
  assert.equal(model.groupSize, 30 - (all.length - 1), "the rest of the 30 rows");
  assert.match(group.text, /^Other, \d+ small slices, .* of 100, .*%\. Activate to show them$/);
  assert.ok(all.slice(0, -1).every((i) => i.kind === "slice"));
});

test("an open group is the way back, then the small slices, and the first of them is selected", () => {
  const model = chart(30, true);
  const bigCount = model.slices.length - 1;
  model.expandGroup();
  model.advance(Number.MAX_SAFE_INTEGER);
  const all = items(model);
  assert.equal(all[0]!.kind, "back");
  assert.equal(all[0]!.text, "Back to all slices");
  assert.ok(all.slice(1).every((i) => i.kind === "slice"));
  assert.equal(all.length - 1, 30 - bigCount, "the small slices");
  assert.equal(model.groupSize, 30 - bigCount);
  assert.equal(all.filter((i) => i.selected).length, 1);
  assert.equal(all[initialActive(all)]!.index, model.selectedIndex);
});

test("the group is worded in the singular for one slice, and the words can be changed", () => {
  assert.equal(DEFAULT_ACCESSIBLE_TEXT.groupOpened(1), "Showing 1 small slice");
  assert.equal(DEFAULT_ACCESSIBLE_TEXT.groupOpened(24), "Showing 24 small slices");
  const model = chart(3);
  const german = accessibleItems(model, { ...DEFAULT_ACCESSIBLE_TEXT, slice: (s) => `${s.data.label}: ${s.data.value.toString()}` });
  assert.equal(german[0]!.text, "Row 1: 50");
});

test("the label of the group's slice follows setOtherLabel", () => {
  const model = chart(30, true);
  assert.match(items(model).at(-1)!.text, /^Other,/);
  model.setOtherLabel("Übrige");
  assert.match(items(model).at(-1)!.text, /^Übrige,/);
});

// ------------------------------------------------------------------------------- Keys

const three = (): AccessibleItem[] => items(chart(3));

test("arrows move by one and stop at the ends; Home and End go to the ends", () => {
  const list = three();
  assert.deepEqual(actionForKey("ArrowDown", list, 0, false), { type: "move", to: 1 });
  assert.deepEqual(actionForKey("ArrowRight", list, 1, false), { type: "move", to: 2 });
  assert.deepEqual(actionForKey("ArrowDown", list, 2, false), { type: "move", to: 2 });
  assert.deepEqual(actionForKey("ArrowUp", list, 1, false), { type: "move", to: 0 });
  assert.deepEqual(actionForKey("ArrowLeft", list, 0, false), { type: "move", to: 0 });
  assert.deepEqual(actionForKey("Home", list, 2, false), { type: "move", to: 0 });
  assert.deepEqual(actionForKey("End", list, 0, false), { type: "move", to: 2 });
});

test("from nowhere, the first arrow goes to the first option going forward, and to the last going back", () => {
  const list = three();
  assert.deepEqual(actionForKey("ArrowDown", list, -1, false), { type: "move", to: 0 });
  assert.deepEqual(actionForKey("ArrowUp", list, -1, false), { type: "move", to: 2 });
});

test("Enter and Space act on the option with focus; Escape and Backspace only close an open group", () => {
  const list = three();
  assert.deepEqual(actionForKey("Enter", list, 1, false), { type: "activate", at: 1 });
  assert.deepEqual(actionForKey(" ", list, 2, false), { type: "activate", at: 2 });
  assert.equal(actionForKey("Enter", list, -1, false), null);
  assert.equal(actionForKey("Escape", list, 1, false), null);
  assert.deepEqual(actionForKey("Escape", list, 1, true), { type: "collapse" });
  assert.deepEqual(actionForKey("Backspace", list, 1, true), { type: "collapse" });
});

test("other keys, and any key with no options, are left to the browser", () => {
  assert.equal(actionForKey("Tab", three(), 0, false), null);
  assert.equal(actionForKey("a", three(), 0, false), null);
  assert.equal(actionForKey("ArrowDown", [], -1, false), null);
});

test("the keyboard reaches everything a tap does: selecting, opening the group and closing it", () => {
  const model = chart(30, true);
  model.setSelectedIndex(0);
  const list = items(model);
  const groupAt = list.length - 1;
  // Down to the group's option and Enter opens it
  const enter = actionForKey("Enter", list, groupAt, false);
  assert.deepEqual(enter, { type: "activate", at: groupAt });
  model.activate(list[groupAt]!.index);
  model.advance(Number.MAX_SAFE_INTEGER);
  assert.ok(model.isGroupExpanded);
  // In the open group, arrowing onto the second small slice selects it
  const open = items(model);
  const second = open.findIndex((i) => i.kind === "slice" && i.index === model.selectedIndex) + 1;
  model.activate(open[second]!.index);
  model.advance(Number.MAX_SAFE_INTEGER);
  assert.equal(model.selectedIndex, open[second]!.index);
  // And Escape closes it
  model.collapseGroup();
  model.advance(Number.MAX_SAFE_INTEGER);
  assert.ok(!model.isGroupExpanded);
});
