import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ContentStore } from "../../packages/core/src/store/index.ts";

test("concurrent puts of the same bytes share one object", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "knot-conc-"));
  const store = new ContentStore({ root });
  await store.init();
  const bytes = Buffer.from("same-bytes");
  const results = await Promise.all(Array.from({ length: 8 }, () => store.put(bytes)));
  assert.equal(new Set(results.map((item) => item.digest)).size, 1);
  assert.equal((await store.listObjectIds()).length, 1);
});
