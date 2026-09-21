import { test } from "node:test";
import assert from "node:assert/strict";
import { ChartModel } from "../src/chart/model.ts";
import { nodeToString, sceneToNodes, sceneToSvg } from "../src/svg/nodes.ts";
import { Decimal } from "../src/core/decimal.ts";
import type { SliceInput } from "../src/core/types.ts";

const settled = (data: SliceInput[], style = {}) => {
  const model = new ChartModel({ style, animation: { revealDuration: 0, dataChangeDuration: 0 } });
  model.setSize(200, 200);
  model.setData(data);
  model.advance(0);
  return model;
};
const rows = (...values: string[]): SliceInput[] => values.map((v, i) => ({ id: i, label: "", value: v, color: `#${i}${i}${i}` }));
const halving = (n: number): SliceInput[] =>
  Array.from({ length: n }, (_, i) => {
    const k = Math.min(i + 1, n - 1);
    return { id: i + 1, label: "", value: Decimal.parse(`${100n * 5n ** BigInt(k)}e-${k}`), color: `#${(i * 37) % 999}` };
  });

test("a scene is an svg the size of the chart, with a path for each slice", () => {
  const model = settled(rows("1", "1", "2"));
  const svg = sceneToSvg(model.scene());
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'));
  assert.equal((svg.match(/<path /g) ?? []).length, 3);
  assert.ok(svg.endsWith("</svg>"));
  assert.ok(svg.includes('fill="#000"') && svg.includes('fill="#222"'));
  assert.ok(!svg.includes("opacity"), "nothing is dimmed, so nothing has an opacity");
});

test("dimmed slices and the shadow carry their opacities", () => {
  const model = settled(rows("1", "1"));
  model.setSelectedIndex(0);
  const svg = sceneToSvg(model.scene());
  assert.equal((svg.match(/<path /g) ?? []).length, 3); // the shadow, the slice, the other slice
  assert.ok(svg.includes('opacity="0.2"'), "the shadow, 51 of 255");
  assert.ok(svg.includes('opacity="0.4"'), "the other slice, 102 of 255");
});

test("the empty ring is an even-odd path", () => {
  const model = settled(rows("1"));
  model.clearData();
  const svg = sceneToSvg(model.scene());
  assert.ok(svg.includes('fill="#CCCCCC"'));
  assert.ok(svg.includes('fill-rule="evenodd"'));
});

test("an expanded group is a masked, dimmed group of sectors, with the mask in defs", () => {
  const model = settled(halving(30), { groupSmallSlices: true });
  model.expandGroup();
  model.advance(Number.MAX_SAFE_INTEGER);
  const root = sceneToNodes(model.scene(), { idPrefix: "chart7" });
  const svg = nodeToString(root);
  assert.ok(svg.includes('<defs><mask id="chart7-band" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">'));
  assert.ok(svg.includes('<g opacity="0.1608" mask="url(#chart7-band)">'), "a band dimmed by 0.6 and the others by 0.6: 41 of 255");
  const band = root.children!.find((c) => c.tag === "g")!;
  assert.equal(band.children!.length, 6);
  // The mask comes before the group that uses it, and both after the slices.
  const order = root.children!.map((c) => c.tag);
  assert.deepEqual(order.slice(-2), ["defs", "g"]);
});

test("attribute values are escaped", () => {
  assert.equal(nodeToString({ tag: "path", attrs: { d: "M0 0", fill: 'a"b<c&d' } }), '<path d="M0 0" fill="a&quot;b&lt;c&amp;d"/>');
});

test("a chart with no room is an empty svg", () => {
  const model = new ChartModel();
  model.setSize(0, 0);
  assert.equal(sceneToSvg(model.scene()), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0" width="0" height="0"/>');
});
