import { test } from "node:test";
import assert from "node:assert/strict";
import { CenterArea } from "../src/center/area.ts";
import { DefaultCenterRenderer, defaultInfo, ellipsize, type CenterInfo } from "../src/center/defaultRenderer.ts";
import { approximateTextMeasurer } from "../src/center/measure.ts";
import { CenterPresenter } from "../src/center/presenter.ts";
import type { SelectedSlice } from "../src/chart/model.ts";
import { Decimal } from "../src/core/decimal.ts";
import type { SvgNode } from "../src/svg/node.ts";

const near = (actual: number, expected: number, tolerance = 1e-6): void =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected} (±${tolerance})`);

/** Every character is exactly half the font size wide, so that widths can be worked out by hand. */
const half = (text: string, size: number): number => text.length * size * 0.5;

const sliceOf = (id: number, label: string, value: string, total = "100"): SelectedSlice => ({
  index: id, data: { id, label, value: Decimal.from(value), color: "#000" }, total: Decimal.from(total), fraction: 0.5,
});
const attrsOf = (node: SvgNode): Record<string, string | number> => node.attrs as Record<string, string | number>;
const renderer = (info?: (s: SelectedSlice) => CenterInfo | null) => new DefaultCenterRenderer(half, {}, info);
const roomy = new CenterArea(100, 100, 100);

// ------------------------------------------------------------------------------- The hole

test("the hole knows its size, its safe square, and how wide a line of a given height can be", () => {
  const area = new CenterArea(50, 60, 40);
  assert.equal(area.isEmpty, false);
  assert.equal(new CenterArea(0, 0, 0).isEmpty, true);
  near(area.safeRect.left, 50 - 40 / Math.SQRT2);
  near(area.safeRect.bottom, 60 + 40 / Math.SQRT2);
  near(area.widthFor(0), 80);
  near(area.widthFor(40), 2 * Math.sqrt(1600 - 400));
  assert.equal(area.widthFor(80), 0);
  assert.equal(area.widthFor(200), 0);
});

// ------------------------------------------------------------------------------- Layout of one slice

test("in a roomy hole the label sits over the value and its suffix, at full size, centered as a block", () => {
  const nodes = renderer().render(roomy, sliceOf(1, "Engineering", "50"), []) as SvgNode[];
  assert.equal(nodes.length, 3);
  const [label, value, suffix] = nodes as [SvgNode, SvgNode, SvgNode];
  assert.deepEqual([label.text, value.text, suffix.text], ["Engineering", "50", "/100"]);

  // Sizes 14, 32 and 16. The block is the value (32 * 0.72) and the label (14 * 0.72) and a gap of 6.
  const height = 32 * 0.72 + 14 * 0.72 + 6;
  const top = 100 - height / 2;
  assert.equal(attrsOf(label)["font-size"], 14);
  assert.equal(attrsOf(value)["font-size"], 32);
  assert.equal(attrsOf(suffix)["font-size"], 16);
  assert.equal(attrsOf(label)["text-anchor"], "middle");
  assert.equal(attrsOf(label).x, 100);
  near(Number(attrsOf(label).y), top + 14 * 0.72, 1e-3);
  near(Number(attrsOf(value).y), top + 14 * 0.72 + 6 + 32 * 0.72, 1e-3);
  assert.equal(attrsOf(suffix).y, attrsOf(value).y, "the suffix is on the value's line");
  // "50" is 32 wide and "/100" 32: together 64, centered on x = 100, value first.
  near(Number(attrsOf(value).x), 68);
  near(Number(attrsOf(suffix).x), 100);
  assert.equal(attrsOf(value)["font-weight"], 700);
  assert.equal(attrsOf(label)["font-weight"], 400);
  assert.equal(attrsOf(value).fill, "#1F2633");
  assert.equal(attrsOf(label).fill, "#8A93A6");
});

test("a slice without a label has only the value and the suffix, centered", () => {
  const nodes = renderer((s) => ({ label: null, value: s.data.value.toString(), suffix: "/100" })).render(roomy, sliceOf(1, "", "50"), []);
  assert.deepEqual(nodes.map((n) => n.text), ["50", "/100"]);
  near(Number(attrsOf(nodes[0]!).y), 100 + (32 * 0.72) / 2, 1e-3); // the value's line is the whole block
});

test("a value without a suffix is centered on its own", () => {
  const nodes = renderer(() => ({ label: "Total", value: "1200" })).render(roomy, sliceOf(1, "x", "1"), []);
  assert.deepEqual(nodes.map((n) => n.text), ["Total", "1200"]);
  near(Number(attrsOf(nodes[1]!).x), 100 - 64 / 2); // "1200" is 4 * 16 = 64 wide
});

test("in a smaller hole the value and the suffix shrink together, to the largest size that fits", () => {
  const area = new CenterArea(30, 30, 30);
  const slice = sliceOf(1, "Engineering", "50");
  const nodes = renderer().render(area, slice, []);
  const value = nodes[1]!;
  const scale = Number(attrsOf(value)["font-size"]) / 32;
  assert.ok(scale < 1 && scale >= 11 / 32, `scale ${scale}`);
  near(Number(attrsOf(nodes[2]!)["font-size"]), 16 * scale, 2e-3);
  // It fits: the value and the suffix on one line are narrower than 90% of the chord at the block's height.
  const label = Number(attrsOf(nodes[0]!)["font-size"]);
  const height = 32 * scale * 0.72 + label * 0.72 + 6 * scale;
  assert.ok(64 * scale <= area.widthFor(height) * 0.9 + 1e-6);
  // ... and at a slightly larger scale it would not (the search is exact to a twelve-step bisection).
  const bigger = scale + 0.001;
  const biggerHeight = 32 * bigger * 0.72 + Math.min(14, Math.max(11, 14 * bigger)) * 0.72 + 6 * bigger;
  assert.ok(64 * bigger > area.widthFor(biggerHeight) * 0.9);
});

test("when the suffix would get too small on the value's line, it moves to a line of its own", () => {
  const nodes = renderer().render(new CenterArea(20, 20, 20), sliceOf(1, "Engineering", "50"), []);
  const [label, value, suffix] = nodes as [SvgNode, SvgNode, SvgNode];
  assert.ok(Number(attrsOf(suffix).y) > Number(attrsOf(value).y), "under the value");
  const valueSize = Number(attrsOf(value)["font-size"]);
  const suffixSize = Number(attrsOf(suffix)["font-size"]);
  assert.ok(suffixSize >= 8 - 1e-9 && suffixSize <= 16, "the suffix keeps at least 8");
  assert.ok(valueSize >= 11 - 1e-9);
  // Each is centered on the hole.
  near(Number(attrsOf(value).x) + half("50", valueSize) / 2, 20, 1e-2);
  near(Number(attrsOf(suffix).x) + half("/100", suffixSize) / 2, 20, 1e-2);
  assert.ok(Number(attrsOf(label).y) < Number(attrsOf(value).y));
});

test("the label follows the scale, but keeps at least the minimum size, and is shortened with an ellipsis", () => {
  const long = sliceOf(1, "An extraordinarily long department name", "50");
  const nodes = renderer().render(new CenterArea(40, 40, 40), long, []);
  const label = nodes[0]!;
  assert.ok(label.text!.endsWith("…"), label.text);
  assert.ok(label.text!.length < long.data.label.length);
  const size = Number(attrsOf(label)["font-size"]);
  assert.ok(size >= 11 && size <= 14);
  const value = nodes[1]!;
  const suffix = nodes[2]!;
  const onOwnLine = Number(attrsOf(suffix).y) > Number(attrsOf(value).y);
  const scale = Number(attrsOf(value)["font-size"]) / 32;
  const height = onOwnLine
    ? 32 * scale * 0.72 + size * 0.72 + 6 * scale + 6 * scale + Math.min(16, Math.max(8, 16 * scale)) * 0.72
    : 32 * scale * 0.72 + size * 0.72 + 6 * scale;
  assert.ok(half(label.text!, size) <= new CenterArea(40, 40, 40).widthFor(height) * 0.9 + 1e-6, "it fits the chord");
});

test("the label is ellipsized to the width, and empty if not even the ellipsis fits", () => {
  const measure = (t: string): number => t.length * 10;
  assert.equal(ellipsize("Engineering", 200, measure), "Engineering");
  assert.equal(ellipsize("Engineering", 60, measure), "Engin…");
  assert.equal(ellipsize("Engineering", 25, measure), "E…".length * 10 <= 25 ? "E…" : "…");
  assert.equal(ellipsize("Engineering", 10, measure), "…");
  assert.equal(ellipsize("Engineering", 5, measure), "");
  assert.equal(ellipsize("a b c d e f", 60, measure), "a b c…", "no space before the ellipsis");
});

// ------------------------------------------------------------------------------- Whether it fits

test("the center fits when every slice fits at its smallest size, and not when one does not", () => {
  const r = renderer();
  const short = sliceOf(1, "A", "5");
  const long = sliceOf(2, "B", "123456789.123456789");
  const area = new CenterArea(25, 25, 25);
  const slices = [short, long];
  assert.equal(r.fits(area, [short]), true);
  assert.equal(r.fits(area, slices), false, "one slice that does not fit decides for all");
  assert.equal(r.fits(roomy, slices), true);
  assert.equal(r.fits(new CenterArea(0, 0, 0), slices), false, "no hole");
  assert.equal(r.fits(roomy, []), false, "no slices");
});

test("a slice that has nothing to show is skipped, and if none has anything it does not fit", () => {
  const r = renderer((s) => (s.index === 1 ? null : { label: null, value: "5" }));
  assert.equal(r.fits(roomy, [sliceOf(1, "", "1")]), false);
  assert.equal(r.fits(roomy, [sliceOf(1, "", "1"), sliceOf(2, "", "2")]), true);
  assert.deepEqual(r.render(roomy, sliceOf(1, "", "1"), []), []);
});

test("with the smallest allowed sizes the text is shown anyway when the center is forced", () => {
  const nodes = renderer().render(new CenterArea(6, 6, 6), sliceOf(1, "Engineering", "50"), []);
  const value = nodes.find((n) => n.text === "50")!;
  assert.equal(Number(attrsOf(value)["font-size"]), Number((32 * (11 / 32)).toFixed(3)));
});

test("the layout is worked out once for a slice and a hole, then reused", () => {
  const r = renderer();
  const slice = sliceOf(1, "Engineering", "50");
  const slices = [slice]; // the chart passes the same array until its data changes
  const first = r.render(roomy, slice, slices);
  assert.equal(r.render(roomy, slice, slices), first);
  assert.notEqual(r.render(roomy, sliceOf(2, "Product", "25"), slices), first);
  assert.notEqual(r.render(new CenterArea(100, 100, 100), slice, slices), first, "another hole");
  assert.notEqual(r.render(roomy, slice, [slice]), first, "other data");
});

test("the default info is the label, the value without trailing zeros, and the total", () => {
  assert.deepEqual(defaultInfo(sliceOf(1, "Rent", "1200.50", "3000")), { label: "Rent", value: "1200.5", suffix: "/3000" });
  assert.equal(defaultInfo(sliceOf(1, "", "1"))?.label, null);
  assert.equal(defaultInfo(sliceOf(1, "x", "0.000"))?.value, "0");
});

test("a bigger measurer changes what fits, and the approximate one is proportional to the size", () => {
  const wide = new DefaultCenterRenderer((t, size) => t.length * size * 0.9);
  const narrow = new DefaultCenterRenderer((t, size) => t.length * size * 0.3);
  const area = new CenterArea(30, 30, 30);
  const slice = sliceOf(1, "Engineering", "50");
  assert.ok(Number(attrsOf(narrow.render(area, slice, [])[1]!)["font-size"]) > Number(attrsOf(wide.render(area, slice, [])[1]!)["font-size"]));
  const measure = approximateTextMeasurer(0.5);
  near(measure("abcd", 10, 400), 20);
  assert.ok(measure("abcd", 10, 700) > measure("abcd", 10, 400));
});

// ------------------------------------------------------------------------------- The fade

function presenter() {
  let now = 0;
  const changes: number[] = [];
  const p = new CenterPresenter(() => now, () => changes.push(now));
  return { p, changes, at: (t: number): boolean => { now = t; return p.advance(t); }, set: (t: number) => { now = t; } };
}
const A = sliceOf(1, "A", "1");
const B = sliceOf(2, "B", "2");

test("a slice fades in linearly over 160 ms", () => {
  const { p, at } = presenter();
  p.update(A, true);
  assert.equal(p.displayed, A);
  assert.equal(p.alpha, 0);
  assert.equal(at(80), true);
  near(p.alpha, 0.5);
  assert.equal(at(160), false);
  assert.equal(p.alpha, 1);
  assert.equal(p.isFading, false);
});

test("another slice fades the old one out in 100 ms, then the new one in in 160", () => {
  const { p, at, set } = presenter();
  p.update(A, true);
  at(160);
  set(1000);
  p.update(B, true);
  assert.equal(p.displayed, A, "the old one stays while it fades out");
  at(1050);
  near(p.alpha, 0.5);
  assert.equal(p.displayed, A);
  at(1100);
  assert.equal(p.displayed, B, "swapped when it is gone");
  assert.equal(p.alpha, 0);
  at(1180);
  near(p.alpha, 0.5);
  at(1260);
  assert.equal(p.alpha, 1);
});

test("new content for the same slice replaces the old at once, without a fade", () => {
  const { p, at, set } = presenter();
  p.update(A, true);
  at(160);
  set(500);
  const changed = sliceOf(1, "A", "99");
  p.update(changed, true);
  assert.equal(p.displayed, changed);
  assert.equal(p.alpha, 1);
  assert.equal(p.isFading, false);
});

test("the center fades out when it stops fitting, and in when it starts again", () => {
  const { p, at, set } = presenter();
  p.update(A, true);
  at(160);
  set(300);
  p.update(A, false);
  at(400);
  assert.equal(p.alpha, 0);
  set(500);
  p.update(A, true);
  at(660);
  assert.equal(p.alpha, 1);
});

test("nothing selected fades out, and cancel jumps to where the fade was heading", () => {
  const { p, at, set } = presenter();
  p.update(A, true);
  at(160);
  set(200);
  p.update(null, true);
  at(250);
  assert.ok(p.alpha > 0 && p.alpha < 1);
  p.cancel();
  assert.equal(p.alpha, 0);
  assert.equal(p.displayed, null);
  assert.equal(p.isFading, false);
  p.update(A, true);
  p.cancel();
  assert.equal(p.alpha, 1);
  assert.equal(p.displayed, A);
});
