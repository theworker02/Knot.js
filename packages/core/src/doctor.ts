import { existsSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import { KnotErrorCode } from "./errors.js";
import type { DoctorFinding, DoctorResult, ProjectConfig } from "./types.js";
import { ContentStore } from "./store/index.js";
import { lockObjects, type KnotLockfile } from "./lockfile/index.js";
import { lockSignatureStatus } from "./lockfile/sign.js";
import { lockDigestStatus } from "./lockfile/digest.js";

export async function doctorProject(
  project: ProjectConfig,
  lock: KnotLockfile,
  store: ContentStore,
  options: { repair?: boolean; pingRegistry?: () => Promise<boolean> } = {},
): Promise<DoctorResult> {
  const findings: DoctorFinding[] = [];

  try {
    await access(store.layout.root, constants.R_OK | constants.W_OK);
  } catch {
    findings.push({
      severity: "error",
      code: "STORE_PERMISSIONS",
      message: `Store is not writable: ${store.layout.root}`,
      repairable: false,
    });
  }

  const orphans = await store.orphanTmp();
  if (orphans.length > 0) {
    let repaired = false;
    if (options.repair) {
      await store.clearOrphans();
      repaired = true;
    }
    findings.push({
      severity: "warn",
      code: "ORPHAN_TMP",
      message: `${orphans.length} temporary object(s) left in the store.`,
      repairable: true,
      repaired,
    });
  }

  for (const id of lockObjects(lock)) {
    if (!(await store.has(id))) {
      findings.push({
        severity: "error",
        code: KnotErrorCode.OFFLINE_MISSING,
        message: `Lock references missing object ${id}.`,
        repairable: false,
      });
      continue;
    }
    try {
      await store.verifyObject(id);
    } catch (error) {
      let repaired = false;
      if (options.repair) {
        await store.gc({ dryRun: false });
        repaired = false;
      }
      findings.push({
        severity: "error",
        code: KnotErrorCode.OBJECT_CORRUPT,
        message: error instanceof Error ? error.message : String(error),
        repairable: true,
        repaired,
      });
    }
  }

  if (project.knotTomlPath && !existsSync(project.knotTomlPath) && !project.packageJsonPath) {
    findings.push({
      severity: "error",
      code: KnotErrorCode.MANIFEST_INVALID,
      message: "Project manifest is missing.",
      repairable: false,
    });
  }

  if (lock.packages.length > 0) {
    const digest = lockDigestStatus(lock);
    if (!digest.ok) {
      findings.push({
        severity: "error",
        code: KnotErrorCode.LOCK_TAMPERED,
        message: digest.reason ?? "knot.lock digest mismatch.",
        repairable: false,
      });
    }
    if (project.lockPublicKey) {
      const signature = lockSignatureStatus(lock, project.lockPublicKey);
      if (!signature.ok) {
        findings.push({
          severity: "error",
          code: KnotErrorCode.LOCK_SIGNATURE,
          message: signature.reason ?? "knot.lock signature is missing or invalid.",
          repairable: false,
        });
      }
    }
  }

  if (options.pingRegistry) {
    try {
      const ok = await options.pingRegistry();
      if (!ok) {
        findings.push({
          severity: "warn",
          code: KnotErrorCode.REGISTRY_UNAVAILABLE,
          message: "Registry ping failed.",
          repairable: false,
        });
      }
    } catch {
      findings.push({
        severity: "warn",
        code: KnotErrorCode.REGISTRY_UNAVAILABLE,
        message: "Registry is unreachable.",
        repairable: false,
      });
    }
  }

  const ok = findings.every((finding) => finding.severity !== "error");
  return { ok, findings };
}
