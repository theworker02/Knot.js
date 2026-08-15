import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKnot } from "../../packages/core/src/api.ts";
import { writeKnotToml } from "../../packages/core/src/manifest/project.ts";
import { startMockRegistry } from "../helpers/mock-registry.ts";

test("resolves package.json imports and workspace: packages", async () => {
  const registry = await startMockRegistry([
    {
      name: "imports-pkg",
      version: "1.0.0",
      imports: { "#util": "./util.js" },
      files: {
        "util.js": "export const label = 'via-imports';\n",
        "index.js": "export { label } from '#util';\n",
      },
    },
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "knot-ws-app-"));
  const storeDir = await mkdtemp(path.join(tmpdir(), "knot-store-"));
  await mkdir(path.join(root, "packages", "shared"), { recursive: true });
  await writeFile(
    path.join(root, "packages", "shared", "package.json"),
    JSON.stringify({ name: "shared", version: "0.1.0", type: "module", exports: { ".": "./index.js" } }),
  );
  await writeFile(path.join(root, "packages", "shared", "index.js"), "export const shared = 'workspace-ok';\n");
  await writeKnotToml(path.join(root, "knot.toml"), {
    name: "ws-app",
    version: "0.1.0",
    runtime: "node",
    dependencies: { "imports-pkg": "1.0.0", shared: "workspace:*" },
    mode: "lazy",
    integrity: "strict",
  });
  const toml = await (await import("node:fs/promises")).readFile(path.join(root, "knot.toml"), "utf8");
  await writeFile(path.join(root, "knot.toml"), toml + `\n[workspace]\nmembers = ["packages/*"]\n`);
  try {
    const knot = await createKnot({ cwd: root, storeDir, registryUrl: registry.url });
    await knot.add("imports-pkg@1.0.0");
    const importsUrl = await knot.session.resolveFileUrl("imports-pkg");
    const imported = (await import(importsUrl)) as { label: string };
    assert.equal(imported.label, "via-imports");
    const sharedUrl = await knot.session.resolveFileUrl("shared");
    const shared = (await import(sharedUrl)) as { shared: string };
    assert.equal(shared.shared, "workspace-ok");
  } finally {
    await registry.close();
  }
});
