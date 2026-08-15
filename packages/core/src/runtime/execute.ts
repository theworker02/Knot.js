import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic } from "../fs-atomic.js";
import { writeLockfile } from "../lockfile/index.js";
import { assertLockDigest } from "../lockfile/digest.js";
import { assertLockSignature, loadLockPrivateKey } from "../lockfile/sign.js";
import { createLogger } from "../log.js";
import { projectKeyFor } from "../store/index.js";
import { lockObjects } from "../lockfile/index.js";
import { isWorkspaceRange } from "../workspace/index.js";
import type { RunOptions } from "../types.js";
import { scanEntry } from "./prefetch.js";
import { fileUrlForPackage, RuntimeSession } from "./session.js";
import { assertCanRunTypeScript, spawnNode, typeStripFlags } from "./typescript.js";
import { assertRuntimeSupported } from "../security/platform.js";

export async function runProject(session: RuntimeSession, entry: string, options: RunOptions = {}): Promise<number> {
  assertRuntimeSupported(session.project.runtime);
  const entryPath = path.resolve(session.project.rootDir, entry);
  assertCanRunTypeScript(entryPath);

  if (options.frozen && session.resolver.getLock().packages.length > 0) {
    assertLockDigest(session.resolver.getLock());
    if (session.project.lockPublicKey) {
      assertLockSignature(session.resolver.getLock(), session.project.lockPublicKey);
    }
  }

  const prefetch = options.prefetch ?? session.project.mode === "prefetch";
  const logger = createLogger();
  if (prefetch) {
    const scanned = await scanEntry(entryPath);
    logger.event("PREFETCH", scanned.packages.join(", ") || "(none)");
    await Promise.all(
      scanned.packages.map(async (name) => {
        const range = session.project.dependencies[name] ?? "*";
        if (isWorkspaceRange(range)) {
          const workspace = session.workspaces.find((pkg) => pkg.name === name);
          if (workspace) {
            session.resolver.rememberWorkspace(workspace, range);
            return;
          }
        }
        const resolved = await session.resolver.resolveSpecifier({ name, range, raw: name });
        await session.resolver.ensurePackage(resolved);
      }),
    );
    await persistSession(session);
  }

  const sessionFile = path.join(session.store.layout.tmp, `session-${process.pid}-${Date.now()}.json`);
  await writeJsonAtomic(sessionFile, { modules: await buildRequireMap(session) }, session.store.layout.tmp);

  const registerUrl = resolveRuntimeFile("register");
  const args = [
    "--require",
    resolveCjsPreload(),
    "--import",
    registerUrl,
    ...typeStripFlags(),
    entryPath,
    ...(options.argv ?? []),
  ];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    KNOT_PROJECT: session.project.rootDir,
    KNOT_STORE: session.store.layout.root,
    KNOT_SESSION: sessionFile,
    KNOT_OFFLINE: options.offline || session.project.offline ? "1" : "",
    KNOT_FROZEN: options.frozen ? "1" : "",
  };
  if (options.offline) {
    env.KNOT_OFFLINE = "1";
  }
  logger.event("RUN", entryPath, {
    lazy: options.lazy ?? !prefetch,
    offline: Boolean(options.offline),
    frozen: Boolean(options.frozen),
  });
  const code = await spawnNode(args, { cwd: session.project.rootDir, env });
  await persistSession(session);
  return code;
}

export async function persistSession(session: RuntimeSession): Promise<void> {
  const lock = session.resolver.getLock();
  const privateKeyPem = session.project.lockPublicKey
    ? await loadLockPrivateKey({ projectRoot: session.project.rootDir })
    : undefined;
  const written = await writeLockfile(session.project.lockPath, lock, { privateKeyPem });
  session.resolver.setLock(written);
  await session.store.registerProject({
    projectKey: projectKeyFor(session.project.rootDir),
    rootDir: session.project.rootDir,
    updatedAt: new Date().toISOString(),
    objects: lockObjects(lock),
  });
}

export function loaderPath(): string {
  return fileURLToPath(new URL(resolveRuntimeFile("loader")));
}

async function buildRequireMap(session: RuntimeSession): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const pkg of session.resolver.getLock().packages) {
    try {
      const url = await fileUrlForPackage(
        session.store,
        {
          name: pkg.name,
          version: pkg.version,
          source: pkg.source,
          object: pkg.object,
          workspacePath: pkg.workspacePath,
          requestedRange: pkg.requested ?? pkg.version,
          dependencies: pkg.dependencies ?? {},
          optionalDependencies: pkg.optionalDependencies ?? {},
          peerDependencies: {},
          hasInstallScript: Boolean(pkg.hasInstallScript),
          hasNativeAddon: Boolean(pkg.hasNativeAddon),
        },
        undefined,
        ["require", "node", "default"],
      );
      map[pkg.name] = fileURLToPath(url);
    } catch {
      // package has no require entry; ESM loader still handles import
    }
  }
  return map;
}

function resolveCjsPreload(): string {
  const adjacent = path.join(path.dirname(fileURLToPath(import.meta.url)), "cjs-preload.cjs");
  if (existsSync(adjacent)) {
    return adjacent;
  }
  const compiled = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "dist",
    "runtime",
    "cjs-preload.cjs",
  );
  if (existsSync(compiled)) {
    return compiled;
  }
  return adjacent;
}

function resolveRuntimeFile(basename: string): string {
  const adjacent = new URL(`./${basename}.js`, import.meta.url);
  if (existsSync(fileURLToPath(adjacent))) {
    return adjacent.href;
  }
  const compiled = new URL(`../../dist/runtime/${basename}.js`, import.meta.url);
  if (existsSync(fileURLToPath(compiled))) {
    return compiled.href;
  }
  return adjacent.href;
}
