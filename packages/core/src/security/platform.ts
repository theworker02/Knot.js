import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { KnotError, KnotErrorCode } from "../errors.js";
import type { NativeIdentity, ResolvedPackage } from "../types.js";

export function currentNativeIdentity(): NativeIdentity {
  return {
    os: process.platform,
    arch: process.arch,
    abi: process.versions.modules ?? "unknown",
    napi: process.versions.napi,
  };
}

export function platformMatches(pkg: ResolvedPackage, os: string, arch: string): boolean {
  if (pkg.os && pkg.os.length > 0 && !pkg.os.includes(os) && !pkg.os.includes(`!${os}` === pkg.os[0] ? "" : os)) {
    const negated = pkg.os.every((item) => item.startsWith("!"));
    if (negated) {
      return !pkg.os.includes(`!${os}`);
    }
    return pkg.os.includes(os);
  }
  if (pkg.cpu && pkg.cpu.length > 0) {
    const negated = pkg.cpu.every((item) => item.startsWith("!"));
    if (negated) {
      return !pkg.cpu.includes(`!${arch}`);
    }
    return pkg.cpu.includes(arch);
  }
  return true;
}

export function detectNativeAddon(unpackedRoot: string, pkgJson: Record<string, unknown>): boolean {
  if (pkgJson.gypfile === true || typeof pkgJson.binary === "object") {
    return true;
  }
  const scripts = (pkgJson.scripts ?? {}) as Record<string, string>;
  if (Object.values(scripts).some((cmd) => /node-gyp|prebuild|node-pre-gyp|cmake-js/.test(cmd))) {
    return true;
  }
  return hasNodeFile(unpackedRoot);
}

export function hasNodeFile(dir: string): boolean {
  if (!existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry);
      try {
        const info = statSync(full);
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

export function assertRuntimeSupported(runtime: string): void {
  if (runtime !== "node") {
    throw new KnotError({
      code: KnotErrorCode.UNSUPPORTED,
      message: `Runtime '${runtime}' is not implemented yet.`,
      hint: "Knot 0.x executes applications with Node.js only. Bun and Deno adapters are designed but unproven.",
    });
  }
}

export function nativeArtifactKey(name: string, version: string, native: NativeIdentity): string {
  return `${name}@${version}+${native.os}+${native.arch}+abi${native.abi}`;
}
