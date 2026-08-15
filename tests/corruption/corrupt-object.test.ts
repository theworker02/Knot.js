import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKnot } from "../../packages/core/src/api.ts";
import { writeKnotToml } from "../../packages/core/src/manifest/project.ts";
import { startMockRegistry } from "../helpers/mock-registry.ts";

test("deliberately corrupted cache objects are rejected", async () => {
  const registry = await startMockRegistry([
    { name: "tiny-dep", version: "1.0.0", files: { "index.js": "export const greeting = 'ok';\n" } },
  ]);
  const dir = await mkdtemp(path.join(tmpdir(), "knot-corrupt-"));
  const storeDir = await mkdtemp(path.join(tmpdir(), "knot-store-"));
  await writeKnotToml(path.join(dir, "knot.toml"), {
    name: "demo",
    version: "0.1.0",
    runtime: "node",
    dependencies: { "tiny-dep": "1.0.0" },
    mode: "lazy",
    integrity: "strict",
  });
  try {
    const knot = await createKnot({ cwd: dir, storeDir, registryUrl: registry.url });
    const resolved = await knot.add("tiny-dep@1.0.0");
    assert.ok(resolved.object);
    await writeFile(knot.store.objectPath(resolved.object), Buffer.from("truncated"));
    const result = await knot.verify();
    assert.equal(result.ok, false);
    await assert.rejects(() => knot.store.read(resolved.object));
  } finally {
    await registry.close();
  }
});
