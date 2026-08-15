import assert from "node:assert/strict";
import { test } from "node:test";
import { contentId, integrityOf, parseContentId, sha256, verifyIntegrity } from "../../packages/core/src/hash.ts";

test("sha256 is stable", () => {
  assert.equal(sha256("knot"), sha256(Buffer.from("knot")));
  assert.equal(sha256("knot").length, 64);
});

test("content ids parse and reject garbage", () => {
  const id = contentId("sha256", sha256("x"));
  assert.deepEqual(parseContentId(id), { algorithm: "sha256", digest: sha256("x") });
  assert.throws(() => parseContentId("md5:abc"));
});

test("integrity verification is timing-safe and exact", () => {
  const data = Buffer.from("artifact");
  const integrity = integrityOf("sha512", data);
  assert.equal(verifyIntegrity(data, integrity), true);
  assert.equal(verifyIntegrity(Buffer.from("other"), integrity), false);
});
