import { sha256 } from "../hash.js";
import { KnotError, KnotErrorCode } from "../errors.js";
import type { ContentId } from "../types.js";
import type { KnotLockfile, LockPackage } from "./index.js";

export function canonicalLockPackages(packages: LockPackage[]): LockPackage[] {
  return [...packages]
    .map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      source: pkg.source,
      integrity: pkg.integrity,
      object: pkg.object,
      unpacked: pkg.unpacked,
      requested: pkg.requested,
      dependencies: pkg.dependencies,
      optionalDependencies: pkg.optionalDependencies,
      license: pkg.license,
      hasInstallScript: pkg.hasInstallScript,
      hasNativeAddon: pkg.hasNativeAddon,
      os: pkg.os,
      cpu: pkg.cpu,
      workspacePath: pkg.workspacePath,
    }))
    .sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
}

export function computeLockDigest(lock: Pick<KnotLockfile, "lockVersion" | "packages">): ContentId {
  const payload = JSON.stringify({
    lockVersion: lock.lockVersion,
    packages: canonicalLockPackages(lock.packages),
  });
  return `sha256:${sha256(payload)}`;
}

export function assertLockDigest(lock: KnotLockfile): void {
  if (!lock.lockDigest) {
    throw new KnotError({
      code: KnotErrorCode.LOCK_TAMPERED,
      message: "knot.lock has no lockDigest. Frozen or CI execution requires a tamper-evident lock.",
      hint: "Run knot snapshot to rewrite knot.lock with a content digest.",
    });
  }
  const actual = computeLockDigest(lock);
  if (actual !== lock.lockDigest) {
    throw new KnotError({
      code: KnotErrorCode.LOCK_TAMPERED,
      message: "knot.lock does not match its recorded lockDigest. The lock graph may have been edited.",
      details: { expected: lock.lockDigest, actual },
      hint: "Restore knot.lock from version control, or regenerate it with knot snapshot if the edit was intentional.",
    });
  }
}

export function lockDigestStatus(lock: KnotLockfile): { ok: boolean; reason?: string } {
  if (!lock.lockDigest) {
    return { ok: false, reason: "lockDigest is missing" };
  }
  const actual = computeLockDigest(lock);
  if (actual !== lock.lockDigest) {
    return { ok: false, reason: `expected ${lock.lockDigest}, computed ${actual}` };
  }
  return { ok: true };
}
