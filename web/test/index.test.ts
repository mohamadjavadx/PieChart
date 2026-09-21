import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core/index.ts";

test("the core exports what a renderer needs", () => {
  for (const name of [
    "Decimal", "toSlices", "totalOf", "shareOf", "OtherSliceId", "groupSlices", "planMorph", "Morph", "computeSegments",
    "computeTargetSweeps", "computeCornerRadii", "sliceIndexAt", "roundedSlicePath", "sharpSlicePath", "fullRingPath",
    "ringOf", "shadowRingOf", "slicePath", "outlineOf", "MAX_DEG",
  ]) {
    assert.ok(name in core, `${name} is not exported`);
  }
});
