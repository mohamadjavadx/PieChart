import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PieChart } from "../src/react/index.ts";
import { definePieChart, PieChartElement } from "../src/element/index.ts";
import { normalizeData, sameData } from "../src/chart/input.ts";

// There is no DOM here, which is the point: a page that is rendered on a server must not touch one.

test("the React component renders on a server as its empty box, and takes props without a DOM", () => {
  const html = renderToString(createElement(PieChart, {
    data: [{ label: "Rent", value: 1200 }, { label: "Food", value: "450.50" }],
    center: true, className: "spending", style: { maxWidth: 320 },
  }));
  assert.match(html, /^<div class="spending" style="/);
  assert.match(html, /max-width:320px/);
  assert.match(html, /aspect-ratio:1 \/ 1/);
  assert.ok(html.endsWith("</div>"));
});

test("the web component can be imported and 'defined' where there are no custom elements", () => {
  assert.equal(typeof PieChartElement, "function");
  assert.doesNotThrow(() => definePieChart());
});

test("slices without ids and colors get them: the label as the id, made unique, and colors from the palette", () => {
  const data = normalizeData([{ label: "A", value: 1 }, { label: "A", value: 2 }, { label: "B", value: 3, color: "#000" }, { id: "b", label: "C", value: 4 }]);
  assert.deepEqual(data.map((s) => s.id), ["A", "A #2", "B", "b"]);
  assert.equal(data[2]!.color, "#000");
  assert.ok(data[0]!.color.startsWith("#") && data[0]!.color !== data[1]!.color);
});

test("an id that is given is never taken by another slice's made-up one", () => {
  const data = normalizeData([{ label: "A", value: 1 }, { id: "A", label: "Z", value: 2 }]);
  assert.equal(new Set(data.map((s) => s.id)).size, 2);
});

test("equal data is recognized, so that a rebuilt array does not restart the animation", () => {
  const a = [{ label: "A", value: 1 }, { label: "B", value: "2.5", color: "#fff" }];
  assert.ok(sameData(a, [{ label: "A", value: 1 }, { label: "B", value: "2.5", color: "#fff" }]));
  assert.ok(!sameData(a, [{ label: "A", value: 1 }, { label: "B", value: "2.6", color: "#fff" }]));
  assert.ok(!sameData(a, a.slice(0, 1)));
  assert.ok(!sameData(a, [{ label: "A", value: 1 }, { label: "B", value: "2.5", color: "#000" }]));
});
