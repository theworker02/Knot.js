import { ContentStore } from "../store/index.js";
import { lockObjects, type KnotLockfile } from "../lockfile/index.js";
import { lockDigestStatus } from "../lockfile/digest.js";
import { lockSignatureStatus } from "../lockfile/sign.js";
import type { VerifyResult } from "../types.js";

export async function verifyLock(
  store: ContentStore,
  lock: KnotLockfile,
  options: { publicKey?: string } = {},
): Promise<VerifyResult> {
  const objects = await store.verifyMany(
    lockObjects(lock).filter((id) => id.startsWith("sha256:") || id.startsWith("sha512:")),
  );
  if (lock.packages.length === 0 && !lock.lockDigest) {
    return {
      ok: objects.ok,
      checked: objects.checked,
      failed: objects.failed,
      lockDigestOk: true,
      lockSignatureOk: options.publicKey ? false : undefined,
    };
  }
  const digest = lockDigestStatus(lock);
  const signature = lockSignatureStatus(lock, options.publicKey);
  const failed = [...objects.failed];
  if (!digest.ok) {
    failed.push({ object: "knot.lock", reason: digest.reason ?? "lockDigest mismatch" });
  }
  if (signature.required && !signature.ok) {
    failed.push({ object: "knot.lock", reason: signature.reason ?? "lockSignature mismatch" });
  }
  return {
    ok: failed.length === 0,
    checked: objects.checked + 1 + (signature.required ? 1 : 0),
    failed,
    lockDigestOk: digest.ok,
    lockSignatureOk: signature.required ? signature.ok : undefined,
  };
}
