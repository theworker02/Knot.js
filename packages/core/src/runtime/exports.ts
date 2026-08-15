import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KnotError, KnotErrorCode } from "../errors.js";

export type ExportCondition = "import" | "require" | "node" | "default" | "module-sync";

export function resolvePackageEntry(
  packageRoot: string,
  pkgJson: Record<string, unknown>,
  subpath: string | undefined,
  conditions: ExportCondition[] = ["import", "node", "default"],
): string {
  const requested = subpath ?? ".";
  if (pkgJson.exports !== undefined) {
    const resolved = resolveExports(pkgJson.exports, requested, conditions);
    if (!resolved) {
      throw new KnotError({
        code: KnotErrorCode.RESOLUTION_FAILED,
        message: `Package exports do not include '${requested}'.`,
        details: { packageRoot, subpath: requested },
        hint: "This package uses package.json exports. Request a published subpath, or inspect the package with knot inspect.",
      });
    }
    return assertFile(packageRoot, resolved);
  }

  if (requested !== ".") {
    return assertFile(packageRoot, requested);
  }

  const type = pkgJson.type === "module" ? "module" : "commonjs";
  if (conditions.includes("import") && typeof pkgJson.module === "string") {
    return assertFile(packageRoot, pkgJson.module);
  }
  if (typeof pkgJson.main === "string") {
    return assertFile(packageRoot, pkgJson.main);
  }
  const fallbacks = type === "module" ? ["index.js", "index.mjs"] : ["index.js", "index.cjs", "index.mjs"];
  for (const file of fallbacks) {
    const full = path.join(packageRoot, file);
    if (existsSync(full)) {
      return full;
    }
  }
  throw new KnotError({
    code: KnotErrorCode.RESOLUTION_FAILED,
    message: `Unable to determine an entry file in ${packageRoot}.`,
  });
}

export function resolveExports(
  exportsField: unknown,
  subpath: string,
  conditions: ExportCondition[],
): string | undefined {
  if (typeof exportsField === "string") {
    return subpath === "." ? exportsField : undefined;
  }
  if (Array.isArray(exportsField)) {
    for (const item of exportsField) {
      const resolved = resolveExports(item, subpath, conditions);
      if (resolved) return resolved;
    }
    return undefined;
  }
  if (!exportsField || typeof exportsField !== "object") {
    return undefined;
  }
  const record = exportsField as Record<string, unknown>;
  const keys = Object.keys(record);
  const hasSubpaths = keys.some((key) => key.startsWith(".") || key === "." || key.startsWith("#"));
  if (hasSubpaths) {
    if (Object.prototype.hasOwnProperty.call(record, subpath)) {
      return resolveTarget(record[subpath], conditions);
    }
    const wildcard = matchWildcard(record, subpath);
    if (wildcard) {
      return wildcard;
    }
    return undefined;
  }
  return subpath === "." ? resolveTarget(record, conditions) : undefined;
}

function resolveTarget(target: unknown, conditions: ExportCondition[]): string | undefined {
  if (typeof target === "string") {
    return target;
  }
  if (Array.isArray(target)) {
    for (const item of target) {
      const resolved = resolveTarget(item, conditions);
      if (resolved) return resolved;
    }
    return undefined;
  }
  if (!target || typeof target !== "object") {
    return undefined;
  }
  const record = target as Record<string, unknown>;
  for (const condition of conditions) {
    if (Object.prototype.hasOwnProperty.call(record, condition)) {
      const resolved = resolveTarget(record[condition], conditions);
      if (resolved) return resolved;
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, "default")) {
    return resolveTarget(record.default, conditions);
  }
  return undefined;
}

function matchWildcard(record: Record<string, unknown>, subpath: string): string | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (!key.includes("*")) continue;
    const [prefix, suffix] = key.split("*");
    if (prefix !== undefined && suffix !== undefined && subpath.startsWith(prefix) && subpath.endsWith(suffix)) {
      const star = subpath.slice(prefix.length, subpath.length - suffix.length);
      const target = resolveTarget(value, ["import", "node", "default"]);
      if (target) {
        return target.replace("*", star);
      }
    }
  }
  return undefined;
}

function assertFile(packageRoot: string, rel: string): string {
  const cleaned = rel.startsWith("./") ? rel.slice(2) : rel.replace(/^\//, "");
  const full = path.resolve(packageRoot, cleaned);
  const relative = path.relative(packageRoot, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new KnotError({
      code: KnotErrorCode.RESOLUTION_FAILED,
      message: `Package export escapes package root: ${rel}`,
    });
  }
  if (existsSync(full) && !full.endsWith(path.sep)) {
    return full;
  }
  const candidates = [full, `${full}.js`, `${full}.mjs`, `${full}.cjs`, path.join(full, "index.js")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new KnotError({
    code: KnotErrorCode.RESOLUTION_FAILED,
    message: `Resolved export '${rel}' does not exist in ${packageRoot}.`,
  });
}

export function toFileUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}
