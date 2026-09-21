// Empties dist/ so that a build never ships a file that no longer has a source.
import { rmSync } from "node:fs";

rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
