import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKnot } from "../../packages/core/src/api.ts";
import { writeKnotToml } from "../../packages/core/src/manifest/project.ts";
import { KnotErrorCode } from "../../packages/core/src/errors.ts";
import { startMockRegistry } from "../helpers/mock-registry.ts";

test("resolves a nested dependency from the parent package, not the app", async () => {
  const registry = await startMockRegistry([
    {
      name: "child-pkg",
      version: "1.0.0",
      files: { "index.js": "export const greeting = 'from-child';\n" },
    },
    {
      name: "parent-pkg",
      version: "1.0.0",
      dependencies: { "child-pkg": "^1.0.0" },
      files: { "index.js": "export { greeting } from 'child-pkg';\n" },
    },
  ]);
  const dir = await mkdtemp(path.join(tmpdir(), "knot-nested-"));
  const storeDir = await mkdtemp(path.join(tmpdir(), "knot-store-"));
  await writeKnotToml(path.join(dir, "knot.toml"), {
    name: "app",
    version: "0.1.0",
    runtime: "node",
    dependencies: { "parent-pkg": "^1.0.0" },
    mode: "lazy",
    integrity: "strict",
  });
  try {
    const knot = await createKnot({ cwd: dir, storeDir, registryUrl: registry.url });
    await knot.add("parent-pkg@1.0.0");
    const parentUrl = await knot.session.resolveFileUrl("parent-pkg");
    const childUrl = await knot.session.resolveFileUrl("child-pkg", { parentURL: parentUrl });
    const child = (await import(childUrl)) as { greeting: string };
    assert.equal(child.greeting, "from-child");
    await assert.rejects(
      () => knot.session.resolveFileUrl("child-pkg"),
      (error: unknown) => {
        assert.equal((error as { code: string }).code, KnotErrorCode.UNDECLARED_DEPENDENCY);
        return true;
      },
    );
  } finally {
    await registry.close();
  }
});
