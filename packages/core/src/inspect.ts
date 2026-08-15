import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { packageRootFromExtract } from "./archive.js";
import type { InspectResult, ProjectConfig } from "./types.js";
import type { KnotLockfile } from "./lockfile/index.js";
import { ContentStore } from "./store/index.js";
import { readPackageJson } from "./resolver/index.js";

export async function inspectPackage(
  project: ProjectConfig,
  lock: KnotLockfile,
  store: ContentStore,
  name: string,
): Promise<InspectResult> {
  const pkg = lock.packages.find((item) => item.name === name);
  const requested = project.dependencies[name];
  let disk = 0;
  let unpacked: string | undefined;
  let exports: unknown;
  let license = pkg?.license;
  if (pkg?.object && (await store.has(pkg.object))) {
    try {
      disk = (await stat(store.objectPath(pkg.object))).size;
    } catch {
      disk = 0;
    }
    unpacked = store.unpackedPath(pkg.object);
    const root = packageRootFromExtract(unpacked);
    if (existsSync(path.join(root, "package.json"))) {
      const json = await readPackageJson(root);
      exports = json.exports;
      license = typeof json.license === "string" ? json.license : license;
    }
  }
  let verified = false;
  if (pkg?.object && (await store.has(pkg.object))) {
    try {
      await store.verifyObject(pkg.object);
      verified = true;
    } catch {
      verified = false;
    }
  }
  return {
    name,
    version: pkg?.version,
    requestedRange: requested ?? pkg?.requested,
    source: pkg?.source,
    integrity: pkg?.integrity,
    object: pkg?.object,
    unpacked,
    dependencies: pkg?.dependencies ?? {},
    exports,
    cached: Boolean(pkg?.object && (await store.has(pkg.object))),
    verified,
    diskUsageBytes: disk,
    license,
    resolutionPath: [project.name, name],
    hasInstallScript: Boolean(pkg?.hasInstallScript),
    hasNativeAddon: Boolean(pkg?.hasNativeAddon),
  };
}
