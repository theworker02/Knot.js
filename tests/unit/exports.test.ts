import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveExports } from "../../packages/core/src/runtime/exports.ts";

test("resolves conditional and subpath exports", () => {
  const exportsField = {
    ".": { import: "./esm.js", require: "./cjs.js", default: "./esm.js" },
    "./node-server": "./node-server.js",
  };
  assert.equal(resolveExports(exportsField, ".", ["import", "node", "default"]), "./esm.js");
  assert.equal(resolveExports(exportsField, "./node-server", ["import", "node", "default"]), "./node-server.js");
  assert.equal(resolveExports(exportsField, "./missing", ["import", "node", "default"]), undefined);
});

test("resolves wildcard exports", () => {
  assert.equal(resolveExports({ "./*": "./dist/*.js" }, "./foo", ["import", "default"]), "./dist/foo.js");
});
