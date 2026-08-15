import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import { extractNpmTarball, packageRootFromExtract } from "../archive.js";
import { KnotError, KnotErrorCode } from "../errors.js";
import { contentId, sha256 } from "../hash.js";
import type { KnotLogger } from "../types.js";
import { createLogger } from "../log.js";
import { writeJsonAtomic } from "../fs-atomic.js";
import { packageManifestPath } from "../paths.js";
import { parseSpecifier } from "../registry/specifier.js";
import type { NpmPackageSource } from "../registry/npm.js";
import { ContentStore } from "../store/index.js";
import type { Artifact, ContentId, PackageSpecifier, ProjectConfig, Resolution, ResolvedPackage } from "../types.js";
import { findLockPackage, type KnotLockfile, type LockPackage, lockPackageFromResolved } from "../lockfile/index.js";
import { detectNativeAddon, platformMatches } from "../security/platform.js";
import { enforceScriptPolicy } from "../security/scripts.js";
import { isWorkspaceRange, type WorkspacePackage } from "../workspace/index.js";

export interface ResolverOptions {
  store: ContentStore;
  source: NpmPackageSource;
  project: ProjectConfig;
  lock: KnotLockfile;
  logger?: KnotLogger;
  offline?: boolean;
  frozen?: boolean;
}

export class Resolver {
  private readonly store: ContentStore;
  private readonly source: NpmPackageSource;
  private readonly project: ProjectConfig;
  private lock: KnotLockfile;
  private readonly logger: KnotLogger;
  private readonly offline: boolean;
  private readonly frozen: boolean;
  private readonly inflight = new Map<string, Promise<ResolvedPackage>>();
  private workspaces: WorkspacePackage[] = [];

  constructor(options: ResolverOptions) {
    this.store = options.store;
    this.source = options.source;
    this.project = options.project;
    this.lock = options.lock;
    this.logger = options.logger ?? createLogger();
    this.offline = Boolean(options.offline ?? options.project.offline);
    this.frozen = Boolean(options.frozen);
  }

  getLock(): KnotLockfile {
    return this.lock;
  }

  setLock(lock: KnotLockfile): void {
    this.lock = lock;
  }

  setWorkspaces(workspaces: WorkspacePackage[]): void {
    this.workspaces = workspaces;
  }

  rememberWorkspace(workspace: WorkspacePackage, requested: string): ResolvedPackage {
    const pkg: ResolvedPackage = {
      name: workspace.name,
      version: workspace.version,
      source: "workspace",
      requestedRange: requested,
      workspacePath: workspace.rootDir,
      dependencies: workspace.dependencies,
      optionalDependencies: workspace.optionalDependencies,
      peerDependencies: workspace.peerDependencies,
      exports: workspace.exports,
      imports: workspace.imports,
      main: workspace.main,
      module: workspace.module,
      type: workspace.type,
      hasInstallScript: false,
      hasNativeAddon: false,
    };
    this.lock = {
      ...this.lock,
      packages: upsertByNameVersion(this.lock.packages, lockPackageFromResolved(pkg, requested)),
    };
    return pkg;
  }

  async resolveName(raw: string): Promise<ResolvedPackage> {
    const specifier = parseSpecifier(raw);
    const requested = this.project.dependencies[specifier.name] ?? specifier.range ?? "*";
    return this.resolveSpecifier({ ...specifier, range: specifier.range ?? requested });
  }

  async resolveSpecifier(specifier: PackageSpecifier): Promise<ResolvedPackage> {
    if (isWorkspaceRange(specifier.range) || this.workspaces.some((pkg) => pkg.name === specifier.name)) {
      const workspace = this.workspaces.find((pkg) => pkg.name === specifier.name);
      if (
        workspace &&
        (isWorkspaceRange(specifier.range) || isWorkspaceRange(this.project.dependencies[specifier.name]))
      ) {
        return this.rememberWorkspace(
          workspace,
          specifier.range ?? this.project.dependencies[specifier.name] ?? "workspace:*",
        );
      }
    }
    const key = `${specifier.name}@${specifier.range ?? "*"}`;
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const promise = this.resolveOnce(specifier).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  async ensurePackage(pkg: ResolvedPackage): Promise<ResolvedPackage> {
    if (pkg.source === "workspace") {
      return pkg;
    }
    if (pkg.object && (await this.store.has(pkg.object))) {
      this.logger.event("CACHE", "hit", { package: `${pkg.name}@${pkg.version}`, object: pkg.object });
      const unpacked = await this.ensureUnpacked(pkg);
      return { ...pkg, unpacked };
    }
    if (this.offline) {
      throw new KnotError({
        code: KnotErrorCode.OFFLINE_MISSING,
        message: [
          "KNOT_OFFLINE_MISSING_OBJECT",
          `Required: ${pkg.name}@${pkg.version}`,
          `Expected object: ${pkg.object ?? "(unknown)"}`,
          "The object does not exist in the local Knot store.",
        ].join("\n"),
        dependency: `${pkg.name}@${pkg.version}`,
        object: pkg.object,
        hint: "Run knot snapshot while online, then retry with --offline.",
      });
    }
    if (this.frozen && !pkg.object) {
      throw new KnotError({
        code: KnotErrorCode.FROZEN,
        message: `Frozen execution refuses to fetch an unlocked package: ${pkg.name}.`,
        dependency: `${pkg.name}@${pkg.version}`,
        hint: "Update knot.lock with knot add / knot snapshot, or drop --frozen.",
      });
    }
    const resolution: Resolution = {
      specifier: { name: pkg.name, range: pkg.version, raw: `${pkg.name}@${pkg.version}` },
      package: pkg,
    };
    const artifact = await this.source.fetch(resolution);
    return this.ingest(pkg, artifact);
  }

  async snapshotReachable(entryDeps: Record<string, string>): Promise<ResolvedPackage[]> {
    const seen = new Set<string>();
    const out: ResolvedPackage[] = [];
    const queue = Object.entries(entryDeps).map(([name, range]) => ({ name, range, raw: `${name}@${range}` }));
    while (queue.length > 0) {
      const spec = queue.shift()!;
      const key = `${spec.name}@${spec.range}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (
        isWorkspaceRange(spec.range) ||
        this.workspaces.some((pkg) => pkg.name === spec.name && isWorkspaceRange(spec.range))
      ) {
        const workspace = this.workspaces.find((pkg) => pkg.name === spec.name);
        if (workspace) {
          out.push(this.rememberWorkspace(workspace, spec.range));
          for (const [name, range] of Object.entries(workspace.dependencies)) {
            queue.push({ name, range, raw: `${name}@${range}` });
          }
          continue;
        }
      }
      const resolved = await this.resolveSpecifier(spec);
      const stored = await this.ensurePackage(resolved);
      out.push(stored);
      for (const [name, range] of Object.entries(stored.dependencies)) {
        queue.push({ name, range, raw: `${name}@${range}` });
      }
    }
    return out;
  }

  private async resolveOnce(specifier: PackageSpecifier): Promise<ResolvedPackage> {
    const locked = findLockPackage(this.lock, specifier.name, specifier.range);
    if (locked) {
      if (
        specifier.range &&
        specifier.range !== "*" &&
        !semver.satisfies(locked.version, specifier.range, { includePrerelease: false })
      ) {
        if (this.frozen) {
          throw new KnotError({
            code: KnotErrorCode.LOCK_DRIFT,
            message: `Lockfile version ${locked.name}@${locked.version} does not satisfy requested range '${specifier.range}'.`,
            dependency: `${specifier.name}@${specifier.range}`,
          });
        }
      } else {
        const fromLock = lockToResolved(locked);
        if (fromLock.object && (await this.store.has(fromLock.object))) {
          this.logger.event("RESOLVE", `${fromLock.name}@${fromLock.version}`, { source: "lock" });
          return fromLock;
        }
        if (this.offline) {
          return fromLock;
        }
        if (this.frozen) {
          return fromLock;
        }
      }
    } else if (this.frozen) {
      throw new KnotError({
        code: KnotErrorCode.LOCK_DRIFT,
        message: `Frozen execution has no lock entry for ${specifier.name}.`,
        dependency: specifier.name,
        hint: "Run knot snapshot or knot add before using --frozen / knot ci.",
      });
    }

    if (this.offline && !locked) {
      throw new KnotError({
        code: KnotErrorCode.OFFLINE_MISSING,
        message: `Offline resolution has no lock entry for ${specifier.name}.`,
        dependency: specifier.name,
      });
    }

    const resolution = await this.source.resolve(specifier);
    return resolution.package;
  }

  private async ingest(pkg: ResolvedPackage, artifact: Artifact): Promise<ResolvedPackage> {
    if (pkg.integrity) {
      this.logger.event("VERIFY", pkg.integrity, { package: `${pkg.name}@${pkg.version}` });
    }
    const object = await this.store.put(artifact.bytes, {
      mediaType: "application/gzip",
      source: pkg.tarballUrl ?? pkg.source,
      integrity: pkg.integrity,
    });
    const id = contentId(object.algorithm, object.digest);
    const next: ResolvedPackage = {
      ...pkg,
      object: id,
      provenance: pkg.provenance ? { ...pkg.provenance, contentDigest: id, contentVerified: true } : undefined,
    };
    const unpacked = await this.ensureUnpacked(next);
    next.unpacked = unpacked;
    const root = packageRootFromExtract(this.store.unpackedPath(id));
    const pkgJson = await readPackageJson(root);
    next.hasNativeAddon = detectNativeAddon(root, pkgJson);
    if (next.hasNativeAddon && !platformMatches(next, process.platform, process.arch)) {
      throw new KnotError({
        code: KnotErrorCode.NATIVE_INCOMPATIBLE,
        message: `Native package ${next.name}@${next.version} is not compatible with ${process.platform}/${process.arch}.`,
        dependency: `${next.name}@${next.version}`,
      });
    }
    enforceScriptPolicy(next, this.project);
    await writeJsonAtomic(packageManifestPath(this.store.layout, next.name, next.version), next, this.store.layout.tmp);
    this.lock = {
      ...this.lock,
      packages: upsertByNameVersion(this.lock.packages, lockPackageFromResolved(next, pkg.requestedRange)),
    };
    return next;
  }

  private async ensureUnpacked(pkg: ResolvedPackage): Promise<ContentId | undefined> {
    if (!pkg.object) return undefined;
    const dest = this.store.unpackedPath(pkg.object);
    const root = packageRootFromExtract(dest);
    if (existsSync(path.join(root, "package.json"))) {
      return pkg.object;
    }
    const bytes = await this.store.read(pkg.object);
    await extractNpmTarball(bytes, dest, this.store.layout.tmp);
    return pkg.object;
  }
}

function upsertByNameVersion(packages: LockPackage[], pkg: LockPackage): LockPackage[] {
  const next = packages.filter((item) => !(item.name === pkg.name && item.version === pkg.version));
  next.push(pkg);
  next.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
  return next;
}

export function lockToResolved(pkg: LockPackage): ResolvedPackage {
  return {
    name: pkg.name,
    version: pkg.version,
    source: pkg.source,
    integrity: pkg.integrity,
    object: pkg.object,
    unpacked: pkg.unpacked,
    requestedRange: pkg.requested ?? pkg.version,
    dependencies: pkg.dependencies ?? {},
    optionalDependencies: pkg.optionalDependencies ?? {},
    peerDependencies: {},
    license: pkg.license,
    os: pkg.os,
    cpu: pkg.cpu,
    hasInstallScript: Boolean(pkg.hasInstallScript),
    hasNativeAddon: Boolean(pkg.hasNativeAddon),
    workspacePath: pkg.workspacePath,
  };
}

export async function readPackageJson(dir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function directoryHasNative(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = await readdir(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry);
      try {
        const info = await stat(full);
        if (info.isDirectory()) {
          if (entry === "node_modules") continue;
          stack.push(full);
        } else if (entry.endsWith(".node")) {
          return true;
        }
      } catch {
        // ignore
      }
    }
  }
  return false;
}

export function contentKey(name: string, version: string): string {
  return sha256(`${name}@${version}`).slice(0, 12);
}
