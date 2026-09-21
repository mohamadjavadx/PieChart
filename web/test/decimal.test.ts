import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/core/decimal.ts";

const d = (v: string | number): Decimal => Decimal.from(v);

test("parses decimal notations", () => {
  assert.equal(d("1200").toString(), "1200");
  assert.equal(d("0.5").toString(), "0.5");
  assert.equal(d("-3.25").toString(), "-3.25");
  assert.equal(d(".5").toString(), "0.5");
  assert.equal(d("1e3").toString(), "1000");
  assert.equal(d("1.5E-3").toString(), "0.0015");
  assert.equal(d("  42 ").toString(), "42");
  assert.equal(d("0.500").toString(), "0.5");
  assert.equal(d("0").toString(), "0");
});

test("a JavaScript number is taken by its shortest decimal form", () => {
  assert.equal(d(0.1).toString(), "0.1");
  assert.equal(d(1e-7).toString(), "0.0000001");
  assert.equal(d(-2.5).toString(), "-2.5");
  assert.equal(Decimal.from(12345678901234567890n).toString(), "12345678901234567890");
});

test("rejects what is not a number", () => {
  for (const bad of ["", "abc", "1..2", "--1", "1e", ".", "1,5"]) assert.throws(() => d(bad), SyntaxError, bad);
  assert.throws(() => d(Number.NaN), RangeError);
  assert.throws(() => d(Number.POSITIVE_INFINITY), RangeError);
});

test("adds and subtracts exactly, unlike floating point", () => {
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(d("0.1").add(d("0.2")).toString(), "0.3");
  assert.equal(d("1").subtract(d("0.9")).toString(), "0.1");
  assert.equal(d("100").subtract(d("99.21875")).toString(), "0.78125");
});

test("sums the halving series of the demo exactly", () => {
  // 50, 25, 12.5, ... down to 50 / 2^28, and the last one repeated: 100 in all, with no rounding at all.
  const values: Decimal[] = [];
  for (let i = 0; i < 29; i++) values.push(Decimal.parse(`${50n * 5n ** BigInt(i)}e-${i}`));
  values.push(values[28]!);
  assert.equal(Decimal.sum(values).toString(), "100");
  assert.equal(values[10]!.toString(), "0.048828125");
});

test("multiplies", () => {
  assert.equal(d("1.5").multiply(d("2")).toString(), "3");
  assert.equal(d("0.25").multiply(d("0.25")).toString(), "0.0625");
  assert.equal(d("-2").multiply(d("3")).toString(), "-6");
});

test("divides to sixteen significant digits, like Java's DECIMAL64", () => {
  assert.equal(d("1").divide(d("3")).toString(), "0.3333333333333333");
  assert.equal(d("2").divide(d("3")).toString(), "0.6666666666666667");
  assert.equal(d("1").divide(d("8")).toString(), "0.125");
  assert.equal(d("10").divide(d("4")).toString(), "2.5");
  assert.equal(d("-1").divide(d("3")).toString(), "-0.3333333333333333");
  assert.equal(d("1").divide(d("-4")).toString(), "-0.25");
  assert.equal(d("100").divide(d("3")).toString(), "33.33333333333333");
  assert.equal(d("0.5").divide(d("0.25")).toString(), "2");
  assert.equal(d("1200").divide(d("1800")).toString(), "0.6666666666666667");
  assert.equal(d("0").divide(d("7")).toString(), "0");
});

test("rounds half to even when the quotient has more than sixteen digits", () => {
  // 17 digits ending in 5: a tie. Java: 123456789012345.65 / 1 is 123456789012345.6, and .75 goes up to .8.
  assert.equal(d("123456789012345.65").divide(d("1")).toString(), "123456789012345.6");
  assert.equal(d("123456789012345.75").divide(d("1")).toString(), "123456789012345.8");
  // A tie that is not exact is not a tie: 0.5000000000000000000001 rounds up.
  assert.equal(d("12345678901234.5000000000000001").divide(d("1")).toString(), "12345678901234.5");
  assert.equal(d("1234567890123455.1").divide(d("1")).toString(), "1234567890123455");
  assert.equal(d("1234567890123455.5000000001").divide(d("1")).toString(), "1234567890123456");
});

test("does not divide by zero", () => {
  assert.throws(() => d("1").divide(d("0")), RangeError);
});

test("compares", () => {
  assert.equal(d("0.5").compareTo(d("0.50")), 0);
  assert.equal(d("0.5").compareTo(d("0.51")), -1);
  assert.equal(d("10").compareTo(d("9.999")), 1);
  assert.equal(d("-1").compareTo(d("1")), -1);
  assert.equal(d("1e3").compareTo(d("1000")), 0);
  assert.equal(d("0").signum(), 0);
  assert.equal(d("-0.001").signum(), -1);
  assert.equal(d("7").signum(), 1);
});

test("converts to the nearest number", () => {
  assert.equal(d("0.006103515625").toNumber(), 0.006103515625);
  assert.equal(d("1200").toNumber(), 1200);
  assert.equal(d("1").divide(d("3")).toNumber(), 0.3333333333333333);
  assert.equal(d("-1e-7").toNumber(), -1e-7);
});
