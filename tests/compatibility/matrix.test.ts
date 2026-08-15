import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveExports } from "../../packages/core/src/runtime/exports.ts";

test("documented compatibility matrix stays honest", async () => {
  const docs = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/compatibility.md"),
    "utf8",
  );
  assert.match(docs, /`package\.json` `imports`\s+\|\s+Supported/);
  assert.match(docs, /Developer lock signatures\s+\|\s+Supported/);
  assert.match(docs, /Attestation DSSE \+ subject binding\s+\|\s+Supported/);
  assert.match(docs, /Real npm corpus\s+\|\s+Supported/);
  assert.match(docs, /tests\/unit\/lock-sign\.test\.ts/);
  assert.match(docs, /tests\/corpus\/npm-corpus\.test\.ts/);
  assert.equal(resolveExports({ ".": { import: "./x.js" } }, ".", ["import"]), "./x.js");
});
