import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { packageRootFromExtract } from "./archive.js";
import { KnotError, KnotErrorCode } from "./errors.js";
import type { ProjectConfig } from "./types.js";
import type { KnotLockfile } from "./lockfile/index.js";
import { ContentStore } from "./store/index.js";

export async function ejectProject(project: ProjectConfig, lock: KnotLockfile, store: ContentStore): Promise<void> {
  const nodeModules = path.join(project.rootDir, "node_modules");
  await mkdir(nodeModules, { recursive: true });
  const dependencies: Record<string, string> = { ...project.dependencies };

  for (const pkg of lock.packages) {
    dependencies[pkg.name] = pkg.version;
    if (!pkg.object) {
      throw new KnotError({
        code: KnotErrorCode.EJECT_FAILED,
        message: `Cannot eject ${pkg.name}@${pkg.version} because it has no stored object.`,
        dependency: `${pkg.name}@${pkg.version}`,
        hint: "Run knot snapshot first so every locked package exists in the store.",
      });
    }
    if (!(await store.has(pkg.object))) {
      throw new KnotError({
        code: KnotErrorCode.EJECT_FAILED,
        message: `Object for ${pkg.name} is missing from the store.`,
        object: pkg.object,
      });
    }
    await store.verifyObject(pkg.object);
    const dest = scopedDest(nodeModules, pkg.name);
    await mkdir(path.dirname(dest), { recursive: true });
    const source = packageRootFromExtract(store.unpackedPath(pkg.object));
    await cp(source, dest, { recursive: true, force: true });
  }

  const pkgJsonPath = project.packageJsonPath ?? path.join(project.rootDir, "package.json");
  let existing: Record<string, unknown> = {};
  if (project.packageJsonPath) {
    try {
      existing = JSON.parse(
        await (await import("node:fs/promises")).readFile(project.packageJsonPath, "utf8"),
      ) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const next = {
    ...existing,
    name: existing.name ?? project.name,
    version: existing.version ?? project.version,
    dependencies,
  };
  await writeFile(pkgJsonPath, JSON.stringify(next, null, 2) + "\n");
}

function scopedDest(nodeModules: string, name: string): string {
  return path.join(nodeModules, ...name.split("/"));
}
