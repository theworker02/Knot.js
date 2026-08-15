import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKnot } from "../../packages/core/src/api.ts";
import { writeKnotToml } from "../../packages/core/src/manifest/project.ts";
import { startMockRegistry } from "../helpers/mock-registry.ts";

test("resolves, verifies, stores once, and executes without node_modules", async () => {
  const registry = await startMockRegistry([
    {
      name: "tiny-dep",
      version: "1.0.0",
      files: { "index.js": "export const greeting = 'hello from knot';\n" },
    },
  ]);
  const dir = await mkdtemp(path.join(tmpdir(), "knot-app-"));
  const storeDir = await mkdtemp(path.join(tmpdir(), "knot-store-"));
  await writeKnotToml(path.join(dir, "knot.toml"), {
    name: "demo",
    version: "0.1.0",
    runtime: "node",
    dependencies: { "tiny-dep": "^1.0.0" },
    mode: "lazy",
    integrity: "strict",
  });
  await writeFile(path.join(dir, "src-index.mjs"), `import { greeting } from "tiny-dep";\nconsole.log(greeting);\n`);

  try {
    const knot = await createKnot({ cwd: dir, storeDir, registryUrl: registry.url });
    const resolved = await knot.add("tiny-dep@1.0.0");
    assert.ok(resolved.object);
    const stats = await knot.cacheStats();
    assert.equal(stats.objects, 1);

    const otherDir = await mkdtemp(path.join(tmpdir(), "knot-app-2-"));
    await writeKnotToml(path.join(otherDir, "knot.toml"), {
      name: "demo-2",
      version: "0.1.0",
      runtime: "node",
      dependencies: { "tiny-dep": "^1.0.0" },
      mode: "lazy",
      integrity: "strict",
    });
    const knot2 = await createKnot({ cwd: otherDir, storeDir, registryUrl: registry.url });
    await knot2.add("tiny-dep@1.0.0");
    const stats2 = await knot2.cacheStats();
    assert.equal(stats2.objects, 1, "identical content must be stored once");

    const url = await knot.session.resolveFileUrl("tiny-dep");
    const mod = (await import(url)) as { greeting: string };
    assert.equal(mod.greeting, "hello from knot");
    const modules = path.join(dir, "node_modules");
    const { existsSync } = await import("node:fs");
    assert.equal(existsSync(modules), false);
  } finally {
    await registry.close();
  }
});
