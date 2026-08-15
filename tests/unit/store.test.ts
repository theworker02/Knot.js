import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { contentId, sha256 } from "../../packages/core/src/hash.ts";
import { ContentStore } from "../../packages/core/src/store/index.ts";

test("store is content-addressed and shared", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "knot-store-"));
  const store = new ContentStore({ root });
  await store.init();
  const bytes = Buffer.from("shared-artifact");
  const a = await store.put(bytes, { mediaType: "text/plain", source: "test" });
  const b = await store.put(bytes, { mediaType: "text/plain", source: "other" });
  assert.equal(a.digest, sha256(bytes));
  assert.equal(a.digest, b.digest);
  const id = contentId("sha256", a.digest);
  assert.equal(await store.has(id), true);
  assert.deepEqual(await store.read(id), bytes);
});

test("store rejects corrupt bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "knot-store-"));
  const store = new ContentStore({ root });
  await store.init();
  const object = await store.put(Buffer.from("good"));
  const id = contentId("sha256", object.digest);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(store.objectPath(id), Buffer.from("evil"));
  await assert.rejects(() => store.read(id), /OBJECT_CORRUPT|do not match/);
});
