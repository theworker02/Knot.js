import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { KnotError, KnotErrorCode } from "../errors.js";
import type { IntegrityMode, ProjectConfig, ResolutionMode, RuntimeName, ScriptPolicyDefault } from "../types.js";

export interface PackageJsonShape {
  name?: string;
  version?: string;
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

interface KnotTomlShape {
  project?: {
    name?: string;
    version?: string;
    runtime?: string;
  };
  dependencies?: Record<string, string>;
  "dev-dependencies"?: Record<string, string>;
  knot?: {
    mode?: string;
    integrity?: string;
    offline?: boolean;
  };
  workspace?: {
    members?: string[];
  };
  security?: {
    scripts?: {
      default?: string;
      allow?: string[];
    };
    lock?: {
      publicKey?: string;
      publicKeyFile?: string;
    };
  };
}

export async function loadProject(cwd: string): Promise<ProjectConfig> {
  const rootDir = path.resolve(cwd);
  const knotTomlPath = path.join(rootDir, "knot.toml");
  const packageJsonPath = path.join(rootDir, "package.json");
  const lockPath = path.join(rootDir, "knot.lock");

  if (!existsSync(knotTomlPath) && !existsSync(packageJsonPath)) {
    throw new KnotError({
      code: KnotErrorCode.PROJECT_NOT_FOUND,
      message: `No knot.toml or package.json found in ${rootDir}.`,
      hint: "Run knot init to create a Knot project.",
    });
  }

  let pkg: PackageJsonShape = {};
  if (existsSync(packageJsonPath)) {
    try {
      pkg = JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJsonShape;
    } catch (error) {
      throw new KnotError({
        code: KnotErrorCode.MANIFEST_INVALID,
        message: "package.json is not valid JSON.",
        cause: error,
      });
    }
  }

  let knot: KnotTomlShape = {};
  if (existsSync(knotTomlPath)) {
    try {
      knot = parseToml(await readFile(knotTomlPath, "utf8")) as KnotTomlShape;
    } catch (error) {
      throw new KnotError({
        code: KnotErrorCode.MANIFEST_INVALID,
        message: "knot.toml could not be parsed.",
        cause: error,
      });
    }
  }

  const dependencies = {
    ...(pkg.dependencies ?? {}),
    ...(knot.dependencies ?? {}),
  };
  const workspaceMembers =
    knot.workspace?.members ?? (Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages) ?? [];

  return {
    name: knot.project?.name ?? pkg.name ?? path.basename(rootDir),
    version: knot.project?.version ?? pkg.version ?? "0.0.0",
    runtime: asRuntime(knot.project?.runtime),
    dependencies,
    devDependencies: { ...(pkg.devDependencies ?? {}), ...(knot["dev-dependencies"] ?? {}) },
    optionalDependencies: pkg.optionalDependencies ?? {},
    peerDependencies: pkg.peerDependencies ?? {},
    mode: asMode(knot.knot?.mode),
    integrity: asIntegrity(knot.knot?.integrity),
    offline: Boolean(knot.knot?.offline),
    scripts: {
      default: asScriptDefault(knot.security?.scripts?.default),
      allow: knot.security?.scripts?.allow ?? [],
    },
    workspaceMembers,
    ...(await lockPublicKeyFields(rootDir, knot)),
    knotTomlPath: existsSync(knotTomlPath) ? knotTomlPath : undefined,
    packageJsonPath: existsSync(packageJsonPath) ? packageJsonPath : undefined,
    lockPath,
    rootDir,
  };
}

export async function writeKnotToml(filePath: string, config: Partial<ProjectConfig>): Promise<void> {
  const doc = {
    project: {
      name: config.name ?? "app",
      version: config.version ?? "0.1.0",
      runtime: config.runtime ?? "node",
    },
    dependencies: config.dependencies ?? {},
    knot: {
      mode: config.mode ?? "lazy",
      integrity: config.integrity ?? "strict",
      offline: config.offline ?? false,
    },
    security: {
      scripts: {
        default: config.scripts?.default ?? "deny",
        allow: config.scripts?.allow ?? [],
      },
      ...lockSecurityToml(config),
    },
    ...(config.workspaceMembers && config.workspaceMembers.length > 0
      ? { workspace: { members: config.workspaceMembers } }
      : {}),
  };
  await writeFile(filePath, stringifyToml(doc) + "\n");
}

export async function writePackageJsonMinimal(filePath: string, config: ProjectConfig): Promise<void> {
  const doc = {
    name: config.name,
    version: config.version,
    private: true,
    type: "module",
    dependencies: config.dependencies,
  };
  await writeFile(filePath, JSON.stringify(doc, null, 2) + "\n");
}

function asRuntime(value?: string): RuntimeName {
  if (value === "bun" || value === "deno" || value === "node") {
    return value;
  }
  return "node";
}

function asMode(value?: string): ResolutionMode {
  return value === "prefetch" ? "prefetch" : "lazy";
}

function asIntegrity(value?: string): IntegrityMode {
  return value === "warn" ? "warn" : "strict";
}

function asScriptDefault(value?: string): ScriptPolicyDefault {
  return value === "allow" ? "allow" : "deny";
}

async function lockPublicKeyFields(
  rootDir: string,
  knot: KnotTomlShape,
): Promise<Pick<ProjectConfig, "lockPublicKey" | "lockPublicKeyFile">> {
  const configuredFile = knot.security?.lock?.publicKeyFile;
  const defaultFile = path.join(rootDir, ".knot", "lock.pub");
  const publicKeyFile = configuredFile
    ? path.isAbsolute(configuredFile)
      ? configuredFile
      : path.join(rootDir, configuredFile)
    : existsSync(defaultFile)
      ? defaultFile
      : undefined;
  let lockPublicKey = knot.security?.lock?.publicKey?.trim();
  if (!lockPublicKey && publicKeyFile && existsSync(publicKeyFile)) {
    try {
      lockPublicKey = (await readFile(publicKeyFile, "utf8")).trim();
    } catch {
      lockPublicKey = undefined;
    }
  }
  return {
    lockPublicKey: lockPublicKey || undefined,
    lockPublicKeyFile: publicKeyFile
      ? path.relative(rootDir, publicKeyFile).replaceAll("\\", "/") || ".knot/lock.pub"
      : configuredFile,
  };
}

function lockSecurityToml(config: Partial<ProjectConfig>): Record<string, unknown> {
  if (!config.lockPublicKey && !config.lockPublicKeyFile) {
    return {};
  }
  return {
    lock: {
      ...(config.lockPublicKeyFile ? { publicKeyFile: config.lockPublicKeyFile } : {}),
      ...(config.lockPublicKey && !config.lockPublicKeyFile ? { publicKey: config.lockPublicKey } : {}),
    },
  };
}

export function parseOlderThan(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new KnotError({
      code: KnotErrorCode.USAGE,
      message: `Invalid duration '${value}'. Use forms like 30d, 12h, 15m.`,
    });
  }
  const n = Number(match[1]);
  const unit = match[2];
  const ms = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * ms;
}
