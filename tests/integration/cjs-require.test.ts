import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKnot } from "../../packages/core/src/api.ts";
import { writeKnotToml } from "../../packages/core/src/manifest/project.ts";
import { startMockRegistry } from "../helpers/mock-registry.ts";

test("executes CommonJS require() without node_modules", async () => {
  const registry = await startMockRegistry([
    {
      name: "cjs-dep",
      version: "1.0.0",
      type: "commonjs",
      omitExports: true,
      main: "index.js",
      files: { "index.js": "module.exports = { greeting: 'hello cjs' };\n" },
    },
  ]);
  const dir = await mkdtemp(path.join(tmpdir(), "knot-cjs-"));
  const storeDir = await mkdtemp(path.join(tmpdir(), "knot-store-"));
  await writeKnotToml(path.join(dir, "knot.toml"), {
    name: "cjs-app",
    version: "0.1.0",
    runtime: "node",
    dependencies: { "cjs-dep": "1.0.0" },
    mode: "prefetch",
    integrity: "strict",
  });
  await writeFile(path.join(dir, "app.cjs"), `const { greeting } = require("cjs-dep");\nconsole.log(greeting);\n`);
  try {
    const knot = await createKnot({ cwd: dir, storeDir, registryUrl: registry.url });
    await knot.add("cjs-dep@1.0.0");
    const url = await knot.session.resolveFileUrl("cjs-dep", { conditions: ["require", "node", "default"] });
    const mod = (await import(url)) as { greeting?: string; default?: { greeting: string } };
    assert.equal(mod.greeting ?? mod.default?.greeting, "hello cjs");
    const code = await knot.run("app.cjs", { prefetch: true });
    assert.equal(code, 0);
  } finally {
    await registry.close();
  }
});
