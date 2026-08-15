import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolvePackageImports } from "../../packages/core/src/runtime/imports.ts";
import { isBareSpecifier, isPackageImportsSpecifier } from "../../packages/core/src/registry/specifier.ts";

test("# specifiers are imports, not bare packages", () => {
  assert.equal(isPackageImportsSpecifier("#util"), true);
  assert.equal(isBareSpecifier("#util"), false);
});

test("resolves package.json imports to a local file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "knot-imports-"));
  await writeFile(path.join(dir, "util.js"), "export const n = 1;\n");
  const resolved = resolvePackageImports(dir, { "#util": "./util.js" }, "#util", ["import", "default"]);
  assert.equal(resolved.kind, "file");
  assert.ok(resolved.kind === "file" && resolved.url.includes("util.js"));
});

test("maps an import to another package specifier", () => {
  const resolved = resolvePackageImports("/tmp/pkg", { "#lodash": "lodash" }, "#lodash", ["import", "default"]);
  assert.deepEqual(resolved, { kind: "package", specifier: "lodash" });
});
