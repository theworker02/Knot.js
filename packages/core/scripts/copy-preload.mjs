import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist/runtime", { recursive: true });
copyFileSync("src/runtime/cjs-preload.cjs", "dist/runtime/cjs-preload.cjs");
