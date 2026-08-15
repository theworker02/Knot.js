import { existsSync } from "node:fs";
import path from "node:path";
import { KnotError, KnotErrorCode } from "../errors.js";
import { isBareSpecifier } from "../registry/specifier.js";
import { resolveExports, type ExportCondition, toFileUrl } from "./exports.js";

export type ImportResolution = { kind: "file"; url: string } | { kind: "package"; specifier: string };

export function resolvePackageImports(
  packageRoot: string,
  importsField: unknown,
  specifier: string,
  conditions: ExportCondition[],
): ImportResolution {
  if (!specifier.startsWith("#")) {
    throw new KnotError({
      code: KnotErrorCode.IMPORTS_UNRESOLVED,
      message: `Internal import specifiers must start with '#': ${specifier}`,
    });
  }
  if (importsField === undefined) {
    throw new KnotError({
      code: KnotErrorCode.IMPORTS_UNRESOLVED,
      message: `Package has no package.json imports map for '${specifier}'.`,
      hint: "Add an imports entry, or import a public package export instead.",
    });
  }
  const target = resolveExports(importsField, specifier, conditions);
  if (!target) {
    throw new KnotError({
      code: KnotErrorCode.IMPORTS_UNRESOLVED,
      message: `package.json imports do not include '${specifier}'.`,
      details: { packageRoot, specifier },
    });
  }
  if (isBareSpecifier(target) || target.startsWith("npm:")) {
    return { kind: "package", specifier: target.startsWith("npm:") ? target.slice(4) : target };
  }
  const cleaned = target.startsWith("./") ? target.slice(2) : target;
  const full = path.resolve(packageRoot, cleaned);
  const relative = path.relative(packageRoot, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new KnotError({
      code: KnotErrorCode.IMPORTS_UNRESOLVED,
      message: `Import mapping for '${specifier}' escapes the package root.`,
    });
  }
  const candidates = [full, `${full}.js`, `${full}.cjs`, `${full}.mjs`, path.join(full, "index.js")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { kind: "file", url: toFileUrl(candidate) };
    }
  }
  throw new KnotError({
    code: KnotErrorCode.IMPORTS_UNRESOLVED,
    message: `Import mapping for '${specifier}' points at a missing file: ${target}`,
  });
}
