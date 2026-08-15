import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { KnotError, KnotErrorCode } from "../errors.js";
import type { ProjectConfig } from "../types.js";

export interface WorkspacePackage {
  name: string;
  version: string;
  rootDir: string;
  relativePath: string;
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  exports?: unknown;
  imports?: unknown;
  main?: string;
  module?: string;
  type?: "module" | "commonjs";
}

export function isWorkspaceRange(range: string | undefined): boolean {
  return Boolean(range?.startsWith("workspace:"));
}

export function parseWorkspaceRange(range: string): {
  kind: "any" | "caret" | "tilde" | "exact" | "path";
  value: string;
} {
  const body = range.slice("workspace:".length);
  if (body === "*" || body === "") {
    return { kind: "any", value: "*" };
  }
  if (body === "^") {
    return { kind: "caret", value: "^" };
  }
  if (body === "~") {
    return { kind: "tilde", value: "~" };
  }
  if (body.startsWith(".") || body.includes("/") || body.includes("\\")) {
    return { kind: "path", value: body };
  }
  return { kind: "exact", value: body };
}

export async function discoverWorkspacePackages(project: ProjectConfig): Promise<WorkspacePackage[]> {
  const found: WorkspacePackage[] = [];
  const seen = new Set<string>();
  for (const pattern of project.workspaceMembers) {
    for (const dir of await expandMemberPattern(project.rootDir, pattern)) {
      const pkg = await readWorkspacePackage(project.rootDir, dir);
      if (!pkg || seen.has(pkg.name)) continue;
      seen.add(pkg.name);
      found.push(pkg);
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveWorkspacePackage(packages: WorkspacePackage[], name: string, range: string): WorkspacePackage {
  const parsed = parseWorkspaceRange(range);
  if (parsed.kind === "path") {
    const match = packages.find((pkg) => pkg.relativePath.replace(/\\/g, "/") === parsed.value.replace(/\\/g, "/"));
    if (match) {
      return match;
    }
  }
  const named = packages.filter((pkg) => pkg.name === name);
  const selected = named[0];
  if (!selected) {
    throw new KnotError({
      code: KnotErrorCode.WORKSPACE_UNRESOLVED,
      message: `Workspace package '${name}' is not a member of this workspace.`,
      dependency: `${name}@${range}`,
      hint: "Add the package directory to [workspace].members or package.json workspaces.",
    });
  }
  return selected;
}

async function expandMemberPattern(rootDir: string, pattern: string): Promise<string[]> {
  const normalized = pattern.replace(/\\/g, "/");
  if (!normalized.includes("*")) {
    const full = path.resolve(rootDir, normalized);
    return existsSync(full) ? [full] : [];
  }
  const [prefix, suffix] = normalized.split("*");
  const base = path.resolve(rootDir, prefix ?? "");
  if (!existsSync(base)) {
    return [];
  }
  const recursive = normalized.includes("**");
  const out: string[] = [];
  await walk(base, recursive ? 4 : 1, 0, out);
  return out.filter((dir) => {
    if (!suffix || suffix === "" || suffix === "*") {
      return true;
    }
    return dir.replace(/\\/g, "/").endsWith(suffix.replace(/^\//, ""));
  });
}

async function walk(dir: string, maxDepth: number, depth: number, out: string[]): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    try {
      if (!(await stat(full)).isDirectory()) continue;
    } catch {
      continue;
    }
    if (existsSync(path.join(full, "package.json")) || existsSync(path.join(full, "knot.toml"))) {
      out.push(full);
    }
    if (depth + 1 < maxDepth) {
      await walk(full, maxDepth, depth + 1, out);
    }
  }
}

async function readWorkspacePackage(workspaceRoot: string, dir: string): Promise<WorkspacePackage | undefined> {
  const pkgPath = path.join(dir, "package.json");
  const knotPath = path.join(dir, "knot.toml");
  let name = path.basename(dir);
  let version = "0.0.0";
  let dependencies: Record<string, string> = {};
  let optionalDependencies: Record<string, string> = {};
  let peerDependencies: Record<string, string> = {};
  let exports: unknown;
  let imports: unknown;
  let main: string | undefined;
  let module: string | undefined;
  let type: "module" | "commonjs" | undefined;
  if (existsSync(pkgPath)) {
    try {
      const json = JSON.parse(await readFile(pkgPath, "utf8")) as {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        exports?: unknown;
        imports?: unknown;
        main?: string;
        module?: string;
        type?: "module" | "commonjs";
      };
      name = json.name ?? name;
      version = json.version ?? version;
      dependencies = json.dependencies ?? {};
      optionalDependencies = json.optionalDependencies ?? {};
      peerDependencies = json.peerDependencies ?? {};
      exports = json.exports;
      imports = json.imports;
      main = json.main;
      module = json.module;
      type = json.type;
    } catch {
      return undefined;
    }
  } else if (!existsSync(knotPath)) {
    return undefined;
  }
  return {
    name,
    version,
    rootDir: dir,
    relativePath: path.relative(workspaceRoot, dir).replace(/\\/g, "/"),
    dependencies,
    optionalDependencies,
    peerDependencies,
    exports,
    imports,
    main,
    module,
    type,
  };
}
