import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { ContentStore } from "../packages/core/src/store/index.ts";
import { writeKnotToml } from "../packages/core/src/manifest/project.ts";
import { createKnot } from "../packages/core/src/api.ts";

async function time(label: string, fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  const ms = performance.now() - start;
  console.log(`${label.padEnd(32)} ${ms.toFixed(1)} ms`);
  return ms;
}

const storeDir = await mkdtemp(path.join(tmpdir(), "knot-bench-store-"));
const store = new ContentStore({ root: storeDir });
await store.init();
const payload = Buffer.alloc(1024 * 1024, 7);

await time("cold object insert 1MiB", async () => {
  await store.put(payload, { mediaType: "application/octet-stream" });
});
await time("warm object insert 1MiB", async () => {
  await store.put(payload, { mediaType: "application/octet-stream" });
});

const app = await mkdtemp(path.join(tmpdir(), "knot-bench-app-"));
await writeKnotToml(path.join(app, "knot.toml"), {
  name: "bench",
  version: "0.1.0",
  runtime: "node",
  dependencies: {},
  mode: "lazy",
  integrity: "strict",
});
await writeFile(path.join(app, "index.mjs"), "console.log('ok');\n");
const knot = await createKnot({ cwd: app, storeDir });
await time("run no-dep app", async () => {
  const code = await knot.run("index.mjs");
  if (code !== 0) {
    throw new Error(`run failed: ${code}`);
  }
});

console.log("store", storeDir);
console.log("Record npm/pnpm comparisons separately. Do not paste unverified numbers into docs.");
