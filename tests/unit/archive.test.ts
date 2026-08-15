import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeTarPath } from "../../packages/core/src/archive.ts";

test("tar paths cannot escape the destination", () => {
  assert.equal(assertSafeTarPath("package/index.js"), "package/index.js");
  assert.throws(() => assertSafeTarPath("../etc/passwd"));
  assert.throws(() => assertSafeTarPath("/etc/passwd"));
  assert.throws(() => assertSafeTarPath("package/../../x"));
});
