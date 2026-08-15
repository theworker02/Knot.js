import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  emptyLockfile,
  upsertLockPackage,
  writeLockfile,
  readLockfile,
} from "../../packages/core/src/lockfile/index.ts";
import { assertLockDigest, computeLockDigest, lockDigestStatus } from "../../packages/core/src/lockfile/digest.ts";
import { KnotErrorCode } from "../../packages/core/src/errors.ts";

test("lock digest is stable and detects tampering", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "knot-digest-"));
  const file = path.join(dir, "knot.lock");
  let lock = emptyLockfile();
  lock = upsertLockPackage(lock, { name: "zod", version: "4.0.0", source: "npm", object: "sha256:aa" });
  await writeLockfile(file, lock);
  const written = await readLockfile(file);
  assert.equal(written.lockDigest, computeLockDigest(written));
  assert.equal(lockDigestStatus(written).ok, true);

  const raw = await readFile(file, "utf8");
  await writeFile(file, raw.replace("4.0.0", "4.0.1"));
  const tampered = await readLockfile(file);
  assert.equal(lockDigestStatus(tampered).ok, false);
  assert.throws(
    () => assertLockDigest(tampered),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, KnotErrorCode.LOCK_TAMPERED);
      return true;
    },
  );
});
