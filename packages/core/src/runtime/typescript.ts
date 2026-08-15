import { spawn } from "node:child_process";
import { KnotError, KnotErrorCode } from "../errors.js";

export function nodeSupportsTypeStripping(): boolean {
  const [major, minor] = process.versions.node.split(".").map((part) => Number(part));
  if ((major ?? 0) > 22) return true;
  if (major === 22 && (minor ?? 0) >= 6) return true;
  if (major === 20 && (minor ?? 0) >= 10) return false;
  return false;
}

export function typeStripFlags(): string[] {
  if (nodeSupportsTypeStripping()) {
    const [major] = process.versions.node.split(".").map((part) => Number(part));
    if ((major ?? 0) >= 23) {
      return [];
    }
    return ["--experimental-strip-types"];
  }
  return [];
}

export function assertCanRunTypeScript(entry: string): void {
  if (!/\.[cm]?tsx?$/.test(entry)) {
    return;
  }
  if (nodeSupportsTypeStripping() || typeStripFlags().length > 0) {
    return;
  }
  throw new KnotError({
    code: KnotErrorCode.TYPESCRIPT,
    message: `This Node.js ${process.versions.node} build cannot strip TypeScript types.`,
    hint: "Use Node.js 22.6+ (or 23+) so knot run can execute .ts files without a separate compiler.",
  });
}

export function spawnNode(args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}
