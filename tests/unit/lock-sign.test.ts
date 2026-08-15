import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { KnotErrorCode } from "../../packages/core/src/errors.ts";
import {
  emptyLockfile,
  readLockfile,
  upsertLockPackage,
  writeLockfile,
} from "../../packages/core/src/lockfile/index.ts";
import { computeLockDigest } from "../../packages/core/src/lockfile/digest.ts";
import {
  assertLockSignature,
  generateLockKeyPair,
  lockSignatureStatus,
  signLockDigest,
  verifyLockSignature,
} from "../../packages/core/src/lockfile/sign.ts";
import { loadProject, writeKnotToml } from "../../packages/core/src/manifest/project.ts";
import { createKnot } from "../../packages/core/src/api.ts";

test("ed25519 lock signatures reject tampering and the wrong key", async () => {
  const pair = generateLockKeyPair();
  const other = generateLockKeyPair();
  const dir = await mkdtemp(path.join(tmpdir(), "knot-sign-"));
  const file = path.join(dir, "knot.lock");
  let lock = emptyLockfile();
  lock = upsertLockPackage(lock, { name: "zod", version: "4.0.0", source: "npm", object: "sha256:aa" });
  const written = await writeLockfile(file, lock, { privateKeyPem: pair.privateKeyPem });
  assert.ok(written.lockDigest);
  assert.ok(written.lockSignature?.startsWith("ed25519:"));
  assert.equal(verifyLockSignature(written.lockDigest, written.lockSignature, pair.publicKeyPem), true);
  assert.equal(verifyLockSignature(written.lockDigest, written.lockSignature, other.publicKeyPem), false);
  assert.equal(lockSignatureStatus(written, pair.publicKeyPem).ok, true);

  const raw = await (await import("node:fs/promises")).readFile(file, "utf8");
  await writeFile(file, raw.replace("4.0.0", "4.0.1"));
  const tampered = await readLockfile(file);
  assert.equal(lockSignatureStatus(tampered, pair.publicKeyPem).ok, false);
  assert.throws(
    () => assertLockSignature(tampered, pair.publicKeyPem),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, KnotErrorCode.LOCK_SIGNATURE);
      return true;
    },
  );

  const missing = { ...written, lockSignature: undefined };
  assert.equal(lockSignatureStatus(missing, pair.publicKeyPem).ok, false);
  assert.equal(lockSignatureStatus(written).ok, true);
  assert.equal(signLockDigest(computeLockDigest(written), pair.privateKeyPem).startsWith("ed25519:"), true);
});

test("verify and frozen paths refuse a configured public key without a valid signature", async () => {
  const pair = generateLockKeyPair();
  const dir = await mkdtemp(path.join(tmpdir(), "knot-sign-proj-"));
  const storeDir = await mkdtemp(path.join(tmpdir(), "knot-sign-store-"));
  await mkdir(path.join(dir, ".knot"), { recursive: true });
  await writeFile(path.join(dir, ".knot", "lock.pub"), pair.publicKeyPem);
  await writeKnotToml(path.join(dir, "knot.toml"), {
    name: "signed-app",
    version: "0.1.0",
    runtime: "node",
    dependencies: { demo: "1.0.0" },
    mode: "lazy",
    integrity: "strict",
    lockPublicKeyFile: ".knot/lock.pub",
  });
  const project = await loadProject(dir);
  assert.ok(project.lockPublicKey?.includes("BEGIN PUBLIC KEY"));

  let lock = emptyLockfile();
  lock = upsertLockPackage(lock, { name: "demo", version: "1.0.0", source: "npm", object: "sha256:aa" });
  await writeLockfile(path.join(dir, "knot.lock"), lock);

  const knot = await createKnot({ cwd: dir, storeDir });
  const unsigned = await knot.verify();
  assert.equal(unsigned.ok, false);
  assert.equal(unsigned.lockSignatureOk, false);

  process.env.KNOT_LOCK_KEY = pair.privateKeyPem;
  try {
    await knot.signLock();
    const signed = await knot.verify();
    assert.equal(signed.lockSignatureOk, true);
    assert.equal(signed.lockDigestOk, true);
  } finally {
    delete process.env.KNOT_LOCK_KEY;
  }
});
