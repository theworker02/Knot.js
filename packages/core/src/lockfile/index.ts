import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import semver from "semver";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { KnotError, KnotErrorCode } from "../errors.js";
import type { ContentId, Integrity, ResolvedPackage } from "../types.js";
import { computeLockDigest } from "./digest.js";
import { signLockDigest } from "./sign.js";

export interface LockPackage {
  name: string;
  version: string;
  source: string;
  integrity?: Integrity;
  object?: ContentId;
  unpacked?: ContentId;
  requested?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  license?: string;
  hasInstallScript?: boolean;
  hasNativeAddon?: boolean;
  os?: string[];
  cpu?: string[];
  workspacePath?: string;
}

export interface KnotLockfile {
  lockVersion: number;
  generatedAt?: string;
  lockDigest?: ContentId;
  lockSignature?: string;
  packages: LockPackage[];
}

export interface WriteLockfileOptions {
  privateKeyPem?: string;
}

const LOCK_VERSION = 1;

export function emptyLockfile(): KnotLockfile {
  return { lockVersion: LOCK_VERSION, packages: [] };
}

export async function readLockfile(filePath: string): Promise<KnotLockfile> {
  if (!existsSync(filePath)) {
    return emptyLockfile();
  }
  try {
    const parsed = parseToml(await readFile(filePath, "utf8")) as {
      lockVersion?: number;
      generatedAt?: string;
      lockDigest?: ContentId;
      lockSignature?: string;
      package?: LockPackage | LockPackage[];
    };
    const packages = Array.isArray(parsed.package) ? parsed.package : parsed.package ? [parsed.package] : [];
    if (parsed.lockVersion !== undefined && parsed.lockVersion !== LOCK_VERSION) {
      throw new KnotError({
        code: KnotErrorCode.LOCK_INVALID,
        message: `Unsupported knot.lock version ${parsed.lockVersion}.`,
        hint: "This Knot release reads lockVersion = 1.",
      });
    }
    return {
      lockVersion: LOCK_VERSION,
      generatedAt: parsed.generatedAt,
      lockDigest: parsed.lockDigest,
      lockSignature: parsed.lockSignature,
      packages: packages.map(normalizeLockPackage).sort(compareLockPackage),
    };
  } catch (error) {
    if (error instanceof KnotError) throw error;
    throw new KnotError({
      code: KnotErrorCode.LOCK_INVALID,
      message: "knot.lock could not be parsed.",
      cause: error,
    });
  }
}

export async function writeLockfile(
  filePath: string,
  lock: KnotLockfile,
  options: WriteLockfileOptions = {},
): Promise<KnotLockfile> {
  const packages = [...lock.packages].map(normalizeLockPackage).sort(compareLockPackage);
  const lockDigest = computeLockDigest({ lockVersion: LOCK_VERSION, packages });
  let lockSignature = lock.lockSignature;
  if (options.privateKeyPem) {
    lockSignature = signLockDigest(lockDigest, options.privateKeyPem);
  } else if (lockSignature && lock.lockDigest && lock.lockDigest !== lockDigest) {
    lockSignature = undefined;
  }
  const written: KnotLockfile = {
    lockVersion: LOCK_VERSION,
    generatedAt: lock.generatedAt ?? new Date().toISOString(),
    lockDigest,
    lockSignature,
    packages,
  };
  const doc = {
    lockVersion: written.lockVersion,
    generatedAt: written.generatedAt,
    lockDigest: written.lockDigest,
    ...(written.lockSignature ? { lockSignature: written.lockSignature } : {}),
    package: packages,
  };
  const text = stringifyToml(doc);
  await writeFile(filePath, text.endsWith("\n") ? text : text + "\n");
  return written;
}

export function lockPackageFromResolved(pkg: ResolvedPackage, requested?: string): LockPackage {
  return normalizeLockPackage({
    name: pkg.name,
    version: pkg.version,
    source: pkg.source,
    integrity: pkg.integrity,
    object: pkg.object,
    unpacked: pkg.unpacked,
    requested: requested ?? pkg.requestedRange,
    dependencies: pkg.dependencies,
    optionalDependencies: pkg.optionalDependencies,
    license: pkg.license,
    hasInstallScript: pkg.hasInstallScript,
    hasNativeAddon: pkg.hasNativeAddon,
    os: pkg.os,
    cpu: pkg.cpu,
    workspacePath: pkg.workspacePath,
  });
}

export function findLockPackages(lock: KnotLockfile, name: string): LockPackage[] {
  return lock.packages.filter((pkg) => pkg.name === name);
}

export function findLockPackage(lock: KnotLockfile, name: string, range?: string): LockPackage | undefined {
  const matches = findLockPackages(lock, name);
  if (matches.length === 0) {
    return undefined;
  }
  if (!range || range === "*" || range.startsWith("workspace:")) {
    return matches.sort((a, b) => semver.rcompare(a.version, b.version))[0];
  }
  const versions = matches.map((pkg) => pkg.version);
  const selected = semver.valid(range)
    ? matches.find((pkg) => pkg.version === range)
    : (() => {
        const version = semver.maxSatisfying(versions, range, { includePrerelease: false });
        return version ? matches.find((pkg) => pkg.version === version) : undefined;
      })();
  return selected ?? matches[0];
}

export function upsertLockPackage(lock: KnotLockfile, pkg: LockPackage): KnotLockfile {
  const packages = lock.packages.filter((item) => !(item.name === pkg.name && item.version === pkg.version));
  packages.push(normalizeLockPackage(pkg));
  packages.sort(compareLockPackage);
  return { ...lock, packages };
}

export function removeLockPackage(lock: KnotLockfile, name: string): KnotLockfile {
  return { ...lock, packages: lock.packages.filter((pkg) => pkg.name !== name) };
}

export function lockObjects(lock: KnotLockfile): ContentId[] {
  const ids: ContentId[] = [];
  for (const pkg of lock.packages) {
    if (pkg.object) ids.push(pkg.object);
    if (pkg.unpacked) ids.push(pkg.unpacked);
  }
  return ids;
}

function normalizeLockPackage(pkg: LockPackage): LockPackage {
  return {
    name: pkg.name,
    version: pkg.version,
    source: pkg.source,
    integrity: pkg.integrity,
    object: pkg.object,
    unpacked: pkg.unpacked,
    requested: pkg.requested,
    dependencies: sortRecord(pkg.dependencies),
    optionalDependencies: sortRecord(pkg.optionalDependencies),
    license: pkg.license,
    hasInstallScript: pkg.hasInstallScript,
    hasNativeAddon: pkg.hasNativeAddon,
    os: pkg.os ? [...pkg.os].sort() : undefined,
    cpu: pkg.cpu ? [...pkg.cpu].sort() : undefined,
    workspacePath: pkg.workspacePath,
  };
}

function sortRecord(record?: Record<string, string>): Record<string, string> | undefined {
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key]!;
  }
  return out;
}

function compareLockPackage(a: LockPackage, b: LockPackage): number {
  return a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name);
}
