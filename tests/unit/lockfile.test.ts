import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  emptyLockfile,
  upsertLockPackage,
  writeLockfile,
  readLockfile,
} from "../../packages/core/src/lockfile/index.ts";

test("lockfiles are deterministic and sorted", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "knot-lock-"));
  const file = path.join(dir, "knot.lock");
  let lock = emptyLockfile();
  lock = upsertLockPackage(lock, { name: "zod", version: "4.0.0", source: "npm", object: "sha256:aa" });
  lock = upsertLockPackage(lock, { name: "hono", version: "4.0.0", source: "npm", object: "sha256:bb" });
  await writeLockfile(file, lock);
  const first = await readFile(file, "utf8");
  await writeLockfile(file, await readLockfile(file));
  const second = await readFile(file, "utf8");
  assert.equal(first, second);
  assert.ok(first.indexOf("hono") < first.indexOf("zod"));
});
