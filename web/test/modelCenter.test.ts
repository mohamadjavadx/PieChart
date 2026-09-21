import { test } from "node:test";
import assert from "node:assert/strict";
import { DefaultCenterRenderer } from "../src/center/defaultRenderer.ts";
import type { CenterRenderer } from "../src/center/renderer.ts";
import { ChartModel } from "../src/chart/model.ts";
import { Decimal } from "../src/core/decimal.ts";
import type { SliceInput } from "../src/core/types.ts";
import { sceneToSvg } from "../src/svg/nodes.ts";

const half = (text: string, size: number): number => text.length * size * 0.5;

function chart(size = 200, style = {}) {
  let now = 0;
  const model = new ChartModel({ clock: () => now, style, animation: { revealDuration: 0, dataChangeDuration: 0 } });
  model.setSize(size, size);
  model.setCenterRenderer(new DefaultCenterRenderer(half));
  const at = (t: number): boolean => { now = t; return model.advance(t); };
  return { model, at, set: (t: number) => { now = t; } };
}
const rows = (...values: string[]): SliceInput[] => values.map((v, i) => ({ id: i + 1, label: ["Engineering", "Product", "Design"][i] ?? `Row ${i}`, value: v, color: "#f00" }));
const texts = (model: ChartModel): string[] => (model.scene().center?.nodes ?? []).map((n) => n.text ?? "");
const halving = (n: number): SliceInput[] => Array.from({ length: n }, (_, i) => {
  const k = Math.min(i + 1, n - 1);
  return { id: i + 1, label: `Row ${i + 1}`, value: Decimal.parse(`${100n * 5n ** BigInt(k)}e-${k}`), color: `#${(i * 37) % 999}` };
});

test("nothing is drawn in the hole until a slice is selected, and it fades in over 160 ms", () => {
  const { model, at, set } = chart();
  model.setData(rows("50", "25", "25"));
  at(0);
  assert.equal(model.scene().center, null);

  set(1000);
  model.setSelectedIndex(0);
  assert.equal(model.scene().center, null, "it starts invisible");
  assert.equal(at(1080), true, "the fade needs frames");
  assert.equal(model.scene().center!.opacity, 0.5);
  assert.deepEqual(texts(model), ["Engineering", "50", "/100"]);
  assert.equal(at(1160), false);
  assert.equal(model.scene().center!.opacity, 1);
});

test("selecting another slice fades the old details out, then the new ones in", () => {
  const { model, at, set } = chart();
  model.setData(rows("50", "25", "25"));
  at(0);
  model.setSelectedIndex(0);
  at(160);
  set(1000);
  model.setSelectedIndex(1);
  assert.deepEqual(texts(model), ["Engineering", "50", "/100"], "the old ones stay while they fade");
  at(1050);
  assert.equal(model.scene().center!.opacity, 0.5);
  at(1100);
  assert.equal(model.scene().center, null);
  at(1260);
  assert.deepEqual(texts(model), ["Product", "25", "/100"]);
  assert.equal(model.scene().center!.opacity, 1);
});

test("a slice that gets a new value shows it at once", () => {
  const { model, at } = chart();
  model.setData(rows("50", "25", "25"));
  at(0);
  model.setSelectedIndex(0);
  at(160);
  model.setData(rows("40", "30", "30"));
  at(160);
  assert.deepEqual(texts(model), ["Engineering", "40", "/100"]);
  assert.equal(model.scene().center!.opacity, 1);
});

test("clearing the data, or selecting nothing, fades the details out", () => {
  const { model, at, set } = chart();
  model.setData(rows("50", "50"));
  at(0);
  model.setSelectedIndex(0);
  at(160);
  set(500);
  model.setSelectedIndex(-1);
  at(600);
  assert.equal(model.scene().center, null);
  model.setSelectedIndex(0);
  at(760);
  model.clearData();
  assert.equal(model.scene().center, null, "nothing is drawn with the empty ring");
});

test("the center is shown according to its visibility", () => {
  const { model, at, set } = chart(200);
  model.setData(rows("50", "25", "25"));
  at(0);
  model.setSelectedIndex(0);
  let t = 0;
  const settle = (): void => { t += 500; set(t); model.advance(t); model.advance(t + 200); t += 200; };

  settle();
  assert.equal(model.scene().center?.opacity, 1, "whenFits, in a roomy hole");

  model.setCenterVisibility("never");
  settle();
  assert.equal(model.scene().center, null);
  model.setCenterVisibility("always");
  settle();
  assert.equal(model.scene().center?.opacity, 1);
  model.setCenterVisibility({ minHoleRatio: 0.9 });
  settle();
  assert.equal(model.scene().center, null, "the hole is 0.85");
  model.setCenterVisibility({ minHoleRatio: 0.8 });
  settle();
  assert.equal(model.scene().center?.opacity, 1);

  // Too small for the text: it is hidden, unless it is forced.
  model.setCenterVisibility("whenFits");
  model.setSize(24, 24); // a hole of radius 10: no line of text of even the smallest size is that wide
  settle();
  assert.equal(model.scene().center, null);
  model.setCenterVisibility("always");
  settle();
  assert.notEqual(model.scene().center, null);
});

test("the hole is a new instance only when it changes", () => {
  const { model } = chart(200);
  const area = model.centerArea;
  assert.equal(area.radius, 85);
  assert.equal(area.cx, 100);
  model.setStyle({ cornerRadiusRatio: 0.2, unselectedDim: 0.3, visualGapDeg: 3 });
  assert.equal(model.centerArea, area, "the same one: a renderer that caches by it keeps its work");
  model.setStyle({ holeRadiusRatio: 0.5 });
  assert.notEqual(model.centerArea, area);
  assert.equal(model.centerArea.radius, 50);
  const second = model.centerArea;
  model.setSize(300, 300);
  assert.notEqual(model.centerArea, second);
  model.setSize(300, 0);
  assert.equal(model.centerArea.isEmpty, true);
});

test("while the group is open, the center is for the selected small slice, with the total of all the data", () => {
  const { model, at, set } = chart(800, { groupSmallSlices: true }); // the small values are long: they need a big hole
  model.setData(halving(30));
  at(0);
  model.setSelectedIndex(0);
  at(160);
  set(1000);
  model.expandGroup();
  at(1100);
  at(1400);
  assert.deepEqual(texts(model), ["Row 7", "0.78125", "/100"]);
  assert.equal(model.selectableSlices.length, 24);
});

test("any renderer can be plugged in, and draws what it likes", () => {
  const { model, at } = chart();
  const dot: CenterRenderer = {
    render: (area, slice) => [{ tag: "path", attrs: { d: `M${area.cx} ${area.cy}`, fill: slice.data.color } }],
  };
  model.setCenterRenderer(dot);
  model.setData(rows("50", "50"));
  at(0);
  model.setSelectedIndex(1);
  at(200);
  assert.ok(sceneToSvg(model.scene()).includes('<path d="M100 100" fill="#f00"/>'), "there is no fits(): it is shown");
  model.setCenterRenderer(null);
  at(400);
  assert.equal(model.scene().center, null);
});

test("the details are the last thing in the svg, in a group with their opacity", () => {
  const { model, at, set } = chart();
  model.setData(rows("50", "25", "25"));
  at(0);
  set(0);
  model.setSelectedIndex(0);
  at(80);
  const svg = sceneToSvg(model.scene());
  const center = svg.slice(svg.indexOf('<g opacity="0.5"><text'));
  assert.ok(center.endsWith("</text></g></svg>"), center);
  assert.equal((center.match(/<text /g) ?? []).length, 3);
  // The label is centered on x = 100, and sits 90.52 down: the block (39.12 tall) is centered on the hole at y = 100.
  assert.ok(center.includes('<text x="100" y="90.52" font-size="14" font-weight="400"'));
  assert.ok(center.includes('text-anchor="middle">Engineering</text>'));
  assert.ok(center.includes('<text x="68" y="119.56" font-size="32" font-weight="700"'));
  assert.ok(center.includes('text-anchor="start">/100</text>'));
});
