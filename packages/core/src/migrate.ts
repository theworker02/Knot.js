import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { KnotError, KnotErrorCode } from "./errors.js";
import type { MigrateResult, ProjectConfig } from "./types.js";
import { emptyLockfile, lockPackageFromResolved, writeLockfile, type KnotLockfile } from "./lockfile/index.js";
import { writeKnotToml } from "./manifest/project.js";

interface NpmLockV2 {
  lockfileVersion?: number;
  packages?: Record<
    string,
    { version?: string; resolved?: string; integrity?: string; dependencies?: Record<string, string> }
  >;
  dependencies?: Record<
    string,
    { version?: string; resolved?: string; integrity?: string; requires?: Record<string, string> }
  >;
}

export async function migrateProject(
  project: ProjectConfig,
  options: { dryRun?: boolean } = {},
): Promise<{ result: MigrateResult; lock: KnotLockfile }> {
  const root = project.rootDir;
  const npmLock = path.join(root, "package-lock.json");
  const yarnLock = path.join(root, "yarn.lock");
  const pnpmLock = path.join(root, "pnpm-lock.yaml");

  let source = "package.json";
  let lock = emptyLockfile();
  const warnings: string[] = [];

  if (existsSync(npmLock)) {
    source = "package-lock.json";
    lock = await fromNpmLock(npmLock);
  } else if (existsSync(yarnLock)) {
    source = "yarn.lock";
    lock = await fromYarnLock(yarnLock);
  } else if (existsSync(pnpmLock)) {
    source = "pnpm-lock.yaml";
    lock = await fromPnpmLock(pnpmLock);
  } else if (Object.keys(project.dependencies).length === 0) {
    throw new KnotError({
      code: KnotErrorCode.MIGRATE_FAILED,
      message: "No package.json dependencies or supported lockfile were found to migrate.",
    });
  } else {
    warnings.push("No existing lockfile found. knot.lock will be created empty until packages are resolved.");
  }

  if (!options.dryRun) {
    if (!project.knotTomlPath) {
      await writeKnotToml(path.join(root, "knot.toml"), project);
    }
    await writeLockfile(project.lockPath, lock);
  }

  return {
    result: {
      dryRun: Boolean(options.dryRun),
      source,
      packages: lock.packages.length,
      warnings,
    },
    lock,
  };
}

async function fromNpmLock(filePath: string): Promise<KnotLockfile> {
  const data = JSON.parse(await readFile(filePath, "utf8")) as NpmLockV2;
  const lock = emptyLockfile();
  if (data.packages) {
    for (const [key, value] of Object.entries(data.packages)) {
      if (!key.startsWith("node_modules/") || !value.version) continue;
      const name = key.slice("node_modules/".length);
      if (name.includes("/node_modules/")) continue;
      lock.packages.push(
        lockPackageFromResolved({
          name,
          version: value.version,
          source: "npm",
          integrity: value.integrity as never,
          requestedRange: value.version,
          dependencies: value.dependencies ?? {},
          optionalDependencies: {},
          peerDependencies: {},
          hasInstallScript: false,
          hasNativeAddon: false,
        }),
      );
    }
  } else if (data.dependencies) {
    for (const [name, value] of Object.entries(data.dependencies)) {
      if (!value.version) continue;
      lock.packages.push(
        lockPackageFromResolved({
          name,
          version: value.version.replace(/^.*@/, ""),
          source: "npm",
          integrity: value.integrity as never,
          requestedRange: value.version,
          dependencies: value.requires ?? {},
          optionalDependencies: {},
          peerDependencies: {},
          hasInstallScript: false,
          hasNativeAddon: false,
        }),
      );
    }
  }
  lock.packages.sort((a, b) => a.name.localeCompare(b.name));
  return lock;
}

async function fromYarnLock(filePath: string): Promise<KnotLockfile> {
  const text = await readFile(filePath, "utf8");
  const lock = emptyLockfile();
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    const header = /^"?((?:@[^@\s]+\/)?[^@\s]+)@/.exec(block);
    const version = /version ["']([^"']+)["']/.exec(block);
    const integrity = /integrity ["']?([^"'\s]+)["']?/.exec(block);
    if (!header?.[1] || !version?.[1]) continue;
    if (header[1] === "__metadata") continue;
    lock.packages.push(
      lockPackageFromResolved({
        name: header[1],
        version: version[1],
        source: "npm",
        integrity: integrity?.[1] as never,
        requestedRange: version[1],
        dependencies: {},
        optionalDependencies: {},
        peerDependencies: {},
        hasInstallScript: false,
        hasNativeAddon: false,
      }),
    );
  }
  lock.packages.sort((a, b) => a.name.localeCompare(b.name));
  return lock;
}

async function fromPnpmLock(filePath: string): Promise<KnotLockfile> {
  const data = parseYaml(await readFile(filePath, "utf8")) as {
    packages?: Record<string, { resolution?: { integrity?: string }; dependencies?: Record<string, string> }>;
  };
  const lock = emptyLockfile();
  for (const [key, value] of Object.entries(data.packages ?? {})) {
    const match = /^\/?((?:@[^@/]+\/)?[^@/]+)@([^(@]+)/.exec(key);
    if (!match?.[1] || !match[2]) continue;
    lock.packages.push(
      lockPackageFromResolved({
        name: match[1],
        version: match[2],
        source: "npm",
        integrity: value.resolution?.integrity as never,
        requestedRange: match[2],
        dependencies: value.dependencies ?? {},
        optionalDependencies: {},
        peerDependencies: {},
        hasInstallScript: false,
        hasNativeAddon: false,
      }),
    );
  }
  lock.packages.sort((a, b) => a.name.localeCompare(b.name));
  return lock;
}
