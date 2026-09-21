import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { patchChildren, patchElement } from "../src/svg/dom.ts";
import type { SvgNode } from "../src/svg/nodes.ts";

// A DOM with only what the patcher touches, so that its choices can be seen: which elements are kept.

class FakeElement {
  readonly localName: string;
  readonly childNodes: FakeElement[] = [];
  private readonly values = new Map<string, string>();
  operations: string[] = [];
  constructor(tag: string) {
    this.localName = tag;
  }
  get lastChild(): FakeElement | null { return this.childNodes.at(-1) ?? null; }
  get attributes(): Array<{ name: string }> { return [...this.values.keys()].map((name) => ({ name })); }
  getAttribute(name: string): string | null { return this.values.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.values.set(name, value); this.operations.push(`set ${name}`); }
  removeAttribute(name: string): void { this.values.delete(name); this.operations.push(`remove ${name}`); }
  appendChild(child: FakeElement): FakeElement { this.childNodes.push(child); this.operations.push(`append ${child.localName}`); return child; }
  removeChild(child: FakeElement): FakeElement { this.childNodes.splice(this.childNodes.indexOf(child), 1); this.operations.push(`removeChild ${child.localName}`); return child; }
  replaceChild(next: FakeElement, old: FakeElement): FakeElement { this.childNodes[this.childNodes.indexOf(old)] = next; this.operations.push(`replace ${old.localName} with ${next.localName}`); return old; }
}

beforeEach(() => {
  (globalThis as unknown as { document: unknown }).document = { createElementNS: (_ns: string, tag: string) => new FakeElement(tag) };
});

const path = (d: string, extra: Record<string, string | number> = {}): SvgNode => ({ tag: "path", attrs: { d, fill: "#f00", ...extra } });
const root = () => new FakeElement("svg");
const asElement = (e: FakeElement): Element => e as unknown as Element;

test("children that are not there are made, with their attributes and their own children", () => {
  const svg = root();
  patchChildren(asElement(svg), [path("M0"), { tag: "g", attrs: { opacity: 0.5 }, children: [path("M1")] }]);
  assert.equal(svg.childNodes.length, 2);
  assert.equal(svg.childNodes[0]!.getAttribute("d"), "M0");
  assert.equal(svg.childNodes[1]!.childNodes[0]!.getAttribute("d"), "M1");
  assert.equal(svg.childNodes[1]!.getAttribute("opacity"), "0.5");
});

test("an element of the same kind at the same place is kept, and only what differs is set", () => {
  const svg = root();
  patchChildren(asElement(svg), [path("M0"), path("M1")]);
  const [first, second] = svg.childNodes as [FakeElement, FakeElement];
  first.operations = [];
  second.operations = [];
  svg.operations = [];
  patchChildren(asElement(svg), [path("M0"), path("M9")]);
  assert.equal(svg.childNodes[0], first);
  assert.equal(svg.childNodes[1], second);
  assert.deepEqual(first.operations, [], "nothing changed there");
  assert.deepEqual(second.operations, ["set d"]);
  assert.deepEqual(svg.operations, []);
});

test("an attribute that is no longer given is removed, except xmlns", () => {
  const svg = root();
  patchChildren(asElement(svg), [path("M0", { opacity: 0.5 })]);
  patchChildren(asElement(svg), [path("M0")]);
  assert.equal(svg.childNodes[0]!.getAttribute("opacity"), null);
  patchElement(asElement(svg), { tag: "svg", attrs: { xmlns: "ns", viewBox: "0 0 1 1" } });
  svg.setAttribute("xmlns", "ns");
  patchElement(asElement(svg), { tag: "svg", attrs: { viewBox: "0 0 1 1" } });
  assert.equal(svg.getAttribute("xmlns"), "ns");
});

test("an element of another kind is replaced, and extra children are removed", () => {
  const svg = root();
  patchChildren(asElement(svg), [path("M0"), path("M1"), path("M2")]);
  svg.operations = [];
  patchChildren(asElement(svg), [{ tag: "g", attrs: {} }]);
  assert.deepEqual(svg.operations, ["replace path with g", "removeChild path", "removeChild path"]);
  assert.equal(svg.childNodes.length, 1);
  patchChildren(asElement(svg), []);
  assert.equal(svg.childNodes.length, 0);
});

test("numbers become text, and an equal number is not set again", () => {
  const svg = root();
  patchChildren(asElement(svg), [path("M0", { opacity: 0.5 })]);
  const child = svg.childNodes[0]!;
  child.operations = [];
  patchChildren(asElement(svg), [path("M0", { opacity: 0.5 })]);
  assert.deepEqual(child.operations, []);
  patchChildren(asElement(svg), [path("M0", { opacity: 0.25 })]);
  assert.deepEqual(child.operations, ["set opacity"]);
});
