import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageRootFromExtract } from "../archive.js";
import type { KnotLockfile } from "../lockfile/index.js";
import type { ContentStore } from "../store/index.js";
import type { ProjectConfig } from "../types.js";
import type { WorkspacePackage } from "../workspace/index.js";

export interface Importer {
  kind: "project" | "package" | "workspace";
  name: string;
  version: string;
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  packageRoot: string;
  imports?: unknown;
}

export function identifyImporter(options: {
  parentURL?: string;
  project: ProjectConfig;
  lock: KnotLockfile;
  store: ContentStore;
  workspaces: WorkspacePackage[];
}): Importer {
  const projectImporter: Importer = {
    kind: "project",
    name: options.project.name,
    version: options.project.version,
    dependencies: {
      ...options.project.devDependencies,
      ...options.project.dependencies,
    },
    optionalDependencies: options.project.optionalDependencies,
    peerDependencies: options.project.peerDependencies,
    packageRoot: options.project.rootDir,
  };
  if (!options.parentURL || options.parentURL.startsWith("node:")) {
    return withLocalImports(projectImporter);
  }
  let parentPath: string;
  try {
    parentPath = fileURLToPath(options.parentURL);
  } catch {
    return withLocalImports(projectImporter);
  }

  const workspace = options.workspaces.find((pkg) => isInside(parentPath, pkg.rootDir));
  if (workspace) {
    return {
      kind: "workspace",
      name: workspace.name,
      version: workspace.version,
      dependencies: workspace.dependencies,
      optionalDependencies: workspace.optionalDependencies,
      peerDependencies: workspace.peerDependencies,
      packageRoot: workspace.rootDir,
      imports: workspace.imports,
    };
  }

  if (isInside(parentPath, options.project.rootDir)) {
    return withLocalImports(projectImporter);
  }

  const stored = matchUnpackedPackage(parentPath, options.store, options.lock);
  if (stored) {
    return stored;
  }

  return withLocalImports(projectImporter);
}

function withLocalImports(importer: Importer): Importer {
  if (importer.imports !== undefined) {
    return importer;
  }
  const pkgJson = path.join(importer.packageRoot, "package.json");
  if (!existsSync(pkgJson)) {
    return importer;
  }
  try {
    const json = JSON.parse(readFileSync(pkgJson, "utf8")) as { imports?: unknown };
    return { ...importer, imports: json.imports };
  } catch {
    return importer;
  }
}

function matchUnpackedPackage(filePath: string, store: ContentStore, lock: KnotLockfile): Importer | undefined {
  if (!isInside(filePath, store.layout.unpacked)) {
    return undefined;
  }
  for (const pkg of lock.packages) {
    if (!pkg.object) continue;
    const root = packageRootFromExtract(store.unpackedPath(pkg.object));
    if (!isInside(filePath, root)) continue;
    return {
      kind: "package",
      name: pkg.name,
      version: pkg.version,
      dependencies: pkg.dependencies ?? {},
      optionalDependencies: pkg.optionalDependencies ?? {},
      peerDependencies: {},
      packageRoot: root,
      imports: readImports(root),
    };
  }
  return undefined;
}

function readImports(root: string): unknown {
  try {
    return (JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { imports?: unknown }).imports;
  } catch {
    return undefined;
  }
}

function isInside(filePath: string, dir: string): boolean {
  const relative = path.relative(path.resolve(dir), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
