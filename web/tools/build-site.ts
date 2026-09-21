// Puts the demo site together in _site/, ready to be served from any folder (all its links are relative):
// a landing page, the three demo pages, and the built library.
//
//   npm run site        # builds, then this; serve _site/ with any static server

import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "_site");

rmSync(site, { recursive: true, force: true });
mkdirSync(join(site, "demo"), { recursive: true });

cpSync(join(root, "tools/site/index.html"), join(site, "index.html"));
for (const file of readdirSync(join(root, "demo"))) {
  if (file.endsWith(".html")) cpSync(join(root, "demo", file), join(site, "demo", file));
}
// The library, without its type declarations, which a page has no use for
cpSync(join(root, "dist"), join(site, "dist"), { recursive: true, filter: (from) => statSync(from).isDirectory() || extname(from) === ".js" });
// GitHub Pages would otherwise run the folder through Jekyll
writeFileSync(join(site, ".nojekyll"), "");

console.log(`site: ${site}`);
