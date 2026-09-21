// Draws the pictures of the README (docs/images/*.png) with the built library, in a real browser (Chrome, headless):
//
//   npm run build && node tools/readme-images.ts
//
// The charts are drawn by tools/readme-images.html, so they are exactly what the library draws, with the text measured
// in the browser's own font. Set CHROME to the browser's path when it is not where a Mac has it.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 8791;

/** The pictures, which tools/readme-images.html knows how to draw; each is taken at twice its size in CSS px. */
const images = ["hero", "selection", "grouping", "styling"];

mkdirSync(`${root}docs/images`, { recursive: true });
const server = spawn(process.execPath, [`${root}tools/serve.ts`], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
try {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://localhost:${port}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  for (const name of images) {
    const url = `http://localhost:${port}/tools/readme-images.html#${name}`;
    const flags = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=4000"];
    // The page says how big the picture is
    const dom = execFileSync(chrome, [...flags, "--dump-dom", url], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const size = /data-size="(\d+)x(\d+)"/.exec(dom);
    if (!size) throw new Error(`${name}: the page did not draw`);
    const out = `${root}docs/images/web-${name}.png`;
    execFileSync(chrome, [...flags, "--force-device-scale-factor=2", `--window-size=${size[1]},${size[2]}`, `--screenshot=${out}`, url], { stdio: "ignore" });
    console.log(`${name}: ${size[1]} x ${size[2]} px (twice that in the file)`);
  }
} finally {
  server.kill();
}
