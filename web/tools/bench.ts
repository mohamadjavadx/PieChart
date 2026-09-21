// How much work one animation frame costs, without a browser: the model's step, the scene, and the SVG tree.
// The DOM patch and the painting come on top of it and are the browser's; see the README for a measurement of them.
//
//   node tools/bench.ts

import { ChartModel } from "../src/chart/model.ts";
import { sceneToNodes } from "../src/svg/nodes.ts";
import { Decimal } from "../src/core/decimal.ts";
import type { SliceInput } from "../src/core/types.ts";

function rows(count: number, seed = 1): SliceInput[] {
  let x = seed;
  const random = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1, label: `Row ${i + 1}`, value: Decimal.from(1 + Math.floor(random() * 1000)), color: `hsl(${(i * 47) % 360} 70% 55%)`,
  }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

let clock = 0;
const report: string[] = [];
const header = ["slices".padStart(7), "setData".padStart(10), "frame: step".padStart(12), "scene".padStart(9), "nodes".padStart(9), "total".padStart(9), "shapes".padStart(8)];
report.push(header.join(" "), header.map((h) => "-".repeat(h.length)).join(" "));

for (const count of [5, 30, 100, 300, 1000]) {
  const model = new ChartModel({ clock: () => clock, density: 1, style: { groupSmallSlices: false } });
  model.setSize(420, 420, 16);

  // The entry animation, then a change of every value: the two animations that run
  let t = 0;
  clock = t;
  const setDataTimes: number[] = [];
  const started = performance.now();
  model.setData(rows(count));
  setDataTimes.push(performance.now() - started);
  model.setSelectedIndex(0);

  const step: number[] = [];
  const scene: number[] = [];
  const nodes: number[] = [];
  let shapes = 0;
  const frames = (from: number) => {
    for (let i = 0; i < 40; i++) {
      const now = from + i * 16.7;
      clock = now;
      let a = performance.now();
      model.advance(now);
      const b = performance.now();
      const sc = model.scene();
      const c = performance.now();
      const tree = sceneToNodes(sc, { idPrefix: "b" });
      const d = performance.now();
      step.push(b - a); scene.push(c - b); nodes.push(d - c);
      shapes = tree.children?.length ?? 0;
      a = d;
    }
  };
  frames(0);
  // A new set of values, morphing from the old ones
  t = 1000;
  clock = t;
  const s2 = performance.now();
  model.setData(rows(count, 7));
  setDataTimes.push(performance.now() - s2);
  frames(t);

  const total = median(step) + median(scene) + median(nodes);
  const ms = (v: number) => `${v.toFixed(3)}ms`.padStart(9);
  report.push([String(count).padStart(7), `${median(setDataTimes).toFixed(2)}ms`.padStart(10), ms(median(step)).padStart(12), ms(median(scene)), ms(median(nodes)), ms(total), String(shapes).padStart(8)].join(" "));
}
console.log(report.join("\n"));
console.log("\nA 60 fps frame is 16.7 ms. Times are medians over 80 frames, for a chart of 420 x 420 px.");
