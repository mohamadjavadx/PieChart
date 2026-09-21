// A static file server for the demo page: `npm run demo`. It serves this folder, so that
// /demo/index.html can load the built modules from /dist. Nothing but Node is needed.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT ?? 8765);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".map": "application/json",
  ".json": "application/json", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
};

createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (path === "/") path = "/demo/index.html";
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error("outside the folder");
    const found = await stat(file);
    const target = found.isDirectory() ? join(file, "index.html") : file;
    response.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
  }
}).listen(port, () => console.log(`Demo on http://localhost:${port}/  (Ctrl+C to stop)`));
