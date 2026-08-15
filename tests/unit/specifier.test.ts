import assert from "node:assert/strict";
import { test } from "node:test";
import { isBareSpecifier, parseSpecifier, splitPackageSubpath } from "../../packages/core/src/registry/specifier.ts";

test("parses scoped and ranged specifiers", () => {
  assert.deepEqual(parseSpecifier("zod@^4"), { name: "zod", range: "^4", raw: "zod@^4" });
  assert.deepEqual(parseSpecifier("@scope/pkg@1.2.3"), { name: "@scope/pkg", range: "1.2.3", raw: "@scope/pkg@1.2.3" });
});

test("classifies bare specifiers", () => {
  assert.equal(isBareSpecifier("zod"), true);
  assert.equal(isBareSpecifier("./x"), false);
  assert.equal(isBareSpecifier("node:fs"), false);
  assert.equal(isBareSpecifier("https://example.com"), false);
  assert.equal(isBareSpecifier("#util"), false);
});

test("splits package subpaths", () => {
  assert.deepEqual(splitPackageSubpath("hono/node-server"), { name: "hono", subpath: "./node-server" });
  assert.deepEqual(splitPackageSubpath("@scope/pkg/sub"), { name: "@scope/pkg", subpath: "./sub" });
});
