import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSpecifier } from "../../packages/core/src/registry/specifier.ts";
import { parseContentId } from "../../packages/core/src/hash.ts";
import { assertSafeTarPath } from "../../packages/core/src/archive.ts";
import { parse as parseToml } from "smol-toml";

function junk(seed: number, length: number): string {
  let n = seed;
  let out = "";
  for (let i = 0; i < length; i += 1) {
    n = (n * 1664525 + 1013904223) >>> 0;
    out += String.fromCharCode(n % 256);
  }
  return out;
}

test("malformed input does not crash parsers", () => {
  for (let i = 0; i < 64; i += 1) {
    const raw = junk(i + 1, 24);
    try {
      parseSpecifier(raw);
    } catch (error) {
      assert.ok(error instanceof Error);
    }
    try {
      parseContentId(raw);
    } catch (error) {
      assert.ok(error instanceof Error);
    }
    try {
      assertSafeTarPath(raw);
    } catch (error) {
      assert.ok(error instanceof Error);
    }
    try {
      parseToml(raw);
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  }
});
