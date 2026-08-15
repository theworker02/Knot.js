import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { packageRootFromExtract } from "../archive.js";
import { KnotError, KnotErrorCode } from "../errors.js";
import { createLogger } from "../log.js";
import { loadProject } from "../manifest/project.js";
import { findLockPackage, readLockfile } from "../lockfile/index.js";
import { defaultStoreDir } from "../paths.js";
import { NpmPackageSource } from "../registry/npm.js";
import { isBareSpecifier, isPackageImportsSpecifier, splitPackageSubpath } from "../registry/specifier.js";
import { Resolver } from "../resolver/index.js";
import { ContentStore, projectKeyFor } from "../store/index.js";
import { resolvePackageEntry, toFileUrl, type ExportCondition } from "./exports.js";
import { resolvePackageImports } from "./imports.js";
import { identifyImporter } from "./parent.js";
import type { CreateKnotOptions, ProjectConfig, ResolvedPackage } from "../types.js";
import {
  discoverWorkspacePackages,
  isWorkspaceRange,
  resolveWorkspacePackage,
  type WorkspacePackage,
} from "../workspace/index.js";

export interface RuntimeSessionData {
  cwd: string;
  storeDir: string;
  registryUrl?: string;
  offline: boolean;
  frozen: boolean;
  logLevel?: string;
}

export interface ResolveFileOptions {
  parentURL?: string;
  conditions?: string[];
}

export class RuntimeSession {
  readonly project: ProjectConfig;
  readonly store: ContentStore;
  readonly resolver: Resolver;
  readonly source: NpmPackageSource;
  workspaces: WorkspacePackage[] = [];

  constructor(project: ProjectConfig, store: ContentStore, source: NpmPackageSource, resolver: Resolver) {
    this.project = project;
    this.store = store;
    this.source = source;
    this.resolver = resolver;
  }

  static async open(options: CreateKnotOptions = {}): Promise<RuntimeSession> {
    const cwd = path.resolve(options.cwd ?? process.cwd());
    const logger = options.logger ?? createLogger();
    const store = new ContentStore({ root: options.storeDir ?? defaultStoreDir(), logger });
    await store.init();
    const project = await loadProject(cwd);
    const lock = await readLockfile(project.lockPath);
    const source = new NpmPackageSource({
      registryUrl: options.registryUrl,
      layout: store.layout,
      logger,
      offline: options.offline ?? project.offline,
    });
    const resolver = new Resolver({
      store,
      source,
      project,
      lock,
      logger,
      offline: options.offline ?? project.offline,
      frozen: options.frozen,
    });
    const session = new RuntimeSession(project, store, source, resolver);
    session.workspaces = await discoverWorkspacePackages(project);
    resolver.setWorkspaces(session.workspaces);
    return session;
  }

  async resolveFileUrl(specifier: string, options: ResolveFileOptions = {}): Promise<string> {
    const conditions = normalizeConditions(options.conditions);
    const importer = identifyImporter({
      parentURL: options.parentURL,
      project: this.project,
      lock: this.resolver.getLock(),
      store: this.store,
      workspaces: this.workspaces,
    });

    if (isPackageImportsSpecifier(specifier)) {
      const mapped = resolvePackageImports(importer.packageRoot, importer.imports, specifier, conditions);
      if (mapped.kind === "file") {
        return mapped.url;
      }
      return this.resolveFileUrl(mapped.specifier, { parentURL: options.parentURL, conditions });
    }

    if (!isBareSpecifier(specifier)) {
      throw new KnotError({
        code: KnotErrorCode.RESOLUTION_FAILED,
        message: `Not a package specifier: ${specifier}`,
      });
    }

    const { name, subpath } = splitPackageSubpath(specifier);
    const range = rangeForImporter(importer, name, this.project);
    if (isWorkspaceRange(range) || this.workspaces.some((pkg) => pkg.name === name)) {
      const workspace = resolveWorkspacePackage(this.workspaces, name, range ?? "workspace:*");
      this.resolver.rememberWorkspace(workspace, range ?? "workspace:*");
      return fileUrlForLocalPackage(workspace.rootDir, subpath, conditions);
    }
    const resolved = await this.resolver.resolveSpecifier({
      name,
      range: range ?? "*",
      raw: specifier,
    });
    const stored = await this.resolver.ensurePackage(resolved);
    return fileUrlForPackage(this.store, stored, subpath, conditions);
  }
}

export function rangeForImporter(
  importer: {
    kind: string;
    name: string;
    dependencies: Record<string, string>;
    optionalDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  },
  name: string,
  project: ProjectConfig,
): string | undefined {
  if (importer.dependencies[name]) {
    return importer.dependencies[name];
  }
  if (importer.optionalDependencies[name]) {
    return importer.optionalDependencies[name];
  }
  if (importer.peerDependencies[name]) {
    return project.dependencies[name] ?? project.optionalDependencies[name] ?? importer.peerDependencies[name];
  }
  throw new KnotError({
    code: KnotErrorCode.UNDECLARED_DEPENDENCY,
    message: `Package '${importer.name}' imported '${name}' but does not declare it.`,
    dependency: name,
    hint: `Add ${name} to ${importer.name}'s dependencies, optionalDependencies, or peerDependencies.`,
  });
}

export async function fileUrlForPackage(
  store: ContentStore,
  pkg: ResolvedPackage,
  subpath?: string,
  conditions: ExportCondition[] = ["import", "node", "default"],
): Promise<string> {
  if (pkg.source === "workspace" && pkg.workspacePath) {
    return fileUrlForLocalPackage(pkg.workspacePath, subpath, conditions);
  }
  if (!pkg.object) {
    throw new KnotError({
      code: KnotErrorCode.OFFLINE_MISSING,
      message: `Package ${pkg.name}@${pkg.version} has no content object.`,
      dependency: `${pkg.name}@${pkg.version}`,
    });
  }
  const dest = store.unpackedPath(pkg.object);
  const root = packageRootFromExtract(dest);
  return fileUrlForLocalPackage(root, subpath, conditions, `${pkg.name}@${pkg.version}`);
}

export async function fileUrlForLocalPackage(
  root: string,
  subpath: string | undefined,
  conditions: ExportCondition[],
  label?: string,
): Promise<string> {
  const pkgJsonPath = path.join(root, "package.json");
  if (!existsSync(pkgJsonPath)) {
    throw new KnotError({
      code: KnotErrorCode.OBJECT_CORRUPT,
      message: `Package is missing package.json${label ? `: ${label}` : ""}.`,
      dependency: label,
    });
  }
  const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf8")) as Record<string, unknown>;
  const file = resolvePackageEntry(root, pkgJson, subpath, conditions);
  return toFileUrl(file);
}

function normalizeConditions(conditions?: string[]): ExportCondition[] {
  const requested = (conditions ?? []).filter(
    (item): item is ExportCondition =>
      item === "import" || item === "require" || item === "node" || item === "default" || item === "module-sync",
  );
  if (requested.includes("require") && !requested.includes("import")) {
    return unique(["require", "node", "default", ...requested]);
  }
  return unique(["import", "node", "default", ...requested]);
}

function unique(items: ExportCondition[]): ExportCondition[] {
  return [...new Set(items)];
}

export function sessionFromEnv(): RuntimeSessionData {
  return {
    cwd: process.env.KNOT_PROJECT ?? process.cwd(),
    storeDir: process.env.KNOT_STORE ?? defaultStoreDir(),
    registryUrl: process.env.KNOT_REGISTRY,
    offline: process.env.KNOT_OFFLINE === "1",
    frozen: process.env.KNOT_FROZEN === "1",
    logLevel: process.env.KNOT_LOG,
  };
}

export { projectKeyFor, findLockPackage };
