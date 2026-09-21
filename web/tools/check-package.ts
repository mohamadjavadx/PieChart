// Checks what `npm publish` would ship, after a build: every file that package.json points to exists and is in the
// tarball, nothing but dist/, the license and the readme is in it, and the entry points load and export what they should.
//
//   node tools/check-package.ts

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8")) as {
  name: string; version: string; exports: Record<string, string | Record<string, string>>; main: string; types: string;
};

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

// The files that package.json points to
const targets = new Set<string>([pkg.main, pkg.types]);
for (const entry of Object.values(pkg.exports)) {
  for (const target of typeof entry === "string" ? [entry] : Object.values(entry)) targets.add(target);
}
for (const target of targets) {
  if (!existsSync(`${root}${target.replace(/^\.\//, "")}`)) fail(`package.json points to ${target}, which does not exist (run a build)`);
}

// What would be shipped
const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8" })) as
  { files: { path: string }[]; size: number; unpackedSize: number }[];
const shipped = packed[0]!.files.map((file) => file.path);
for (const target of targets) {
  const path = target.replace(/^\.\//, "");
  if (!shipped.includes(path)) fail(`${path} is not in the tarball`);
}
for (const path of shipped) {
  if (!/^(dist\/|LICENSE$|README\.md$|package\.json$)/.test(path)) fail(`${path} is in the tarball, and should not be`);
  if (path.endsWith(".map") || /^dist\/.*\.test\./.test(path)) fail(`${path} is in the tarball, and should not be`);
}

// The entry points load, and are what they say
const expected: Record<string, string[]> = {
  ".": ["PieChart", "ChartModel", "createDefaultCenter", "Decimal", "normalizeData"],
  "./element": ["PieChartElement", "definePieChart"],
  "./react": ["PieChart"],
};
for (const [entry, names] of Object.entries(expected)) {
  const target = pkg.exports[entry];
  const file = typeof target === "string" ? target : target!.default!;
  try {
    const module = (await import(pathToFileURL(`${root}${file.replace(/^\.\//, "")}`).href)) as Record<string, unknown>;
    for (const name of names) if (!(name in module)) fail(`${entry} does not export ${name}`);
  } catch (error) {
    fail(`${entry} does not load in Node: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `  - ${problem}`).join("\n"));
  process.exit(1);
}
console.log(`${pkg.name}@${pkg.version}: ${shipped.length} files, ${(packed[0]!.unpackedSize / 1024).toFixed(0)} kB unpacked, entry points load.`);
