import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/core/decimal.ts";
import { shareOf, toSlices, totalOf } from "../src/core/slices.ts";

test("toSlices keeps the slices with a value above zero, and makes their values exact", () => {
  const slices = toSlices([
    { id: 1, label: "Rent", value: "1200", color: "#f00" },
    { id: 2, label: "Nothing", value: 0, color: "#0f0" },
    { id: 3, label: "Negative", value: -5, color: "#00f" },
    { id: 4, label: "Food", value: 450.5, color: "#ff0" },
    { id: 5, label: "Big", value: 10n, color: "#0ff" },
    { id: 6, label: "Exact", value: Decimal.from("0.1"), color: "#f0f" },
  ]);
  assert.deepEqual(slices.map((s) => s.id), [1, 4, 5, 6]);
  assert.equal(slices[1]!.value.toString(), "450.5");
  assert.equal(totalOf(slices).toString(), "1660.6");
});

test("shares are exact, and only the last step is a number", () => {
  const total = totalOf(toSlices([
    { id: 1, label: "", value: "0.1", color: "" },
    { id: 2, label: "", value: "0.2", color: "" },
  ]));
  assert.equal(total.toString(), "0.3"); // not 0.30000000000000004
  assert.equal(shareOf(Decimal.from("0.1"), total), 1 / 3);
  assert.equal(shareOf(Decimal.from("1"), Decimal.ZERO), 0);
});

test("a value that is not a number is an error, not a slice", () => {
  assert.throws(() => toSlices([{ id: 1, label: "", value: "twelve", color: "" }]), SyntaxError);
  assert.throws(() => toSlices([{ id: 1, label: "", value: Number.NaN, color: "" }]), RangeError);
});
