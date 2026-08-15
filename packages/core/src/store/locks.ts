import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { KnotError, KnotErrorCode } from "../errors.js";
import { ensureDirSync } from "../fs-atomic.js";

export interface LockHandle {
  path: string;
  release(): void;
}

interface LockPayload {
  pid: number;
  createdAt: string;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(lockDir: string, name: string, options?: { staleMs?: number }): LockHandle {
  ensureDirSync(lockDir);
  const lockPath = path.join(lockDir, `${name}.lock`);
  const staleMs = options?.staleMs ?? 30 * 60 * 1000;
  const payload: LockPayload = { pid: process.pid, createdAt: new Date().toISOString() };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeSync(fd, JSON.stringify(payload));
      } finally {
        closeSync(fd);
      }
      return {
        path: lockPath,
        release() {
          try {
            unlinkSync(lockPath);
          } catch {
            // already released
          }
        },
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw new KnotError({
          code: KnotErrorCode.STORE_LOCKED,
          message: `Unable to acquire lock ${name}`,
          cause: error,
        });
      }
      if (existsSync(lockPath)) {
        try {
          const existing = JSON.parse(readFileSync(lockPath, "utf8")) as LockPayload;
          const age = Date.now() - Date.parse(existing.createdAt);
          if (!isPidAlive(existing.pid) || Number.isNaN(age) || age > staleMs) {
            unlinkSync(lockPath);
            continue;
          }
        } catch {
          try {
            unlinkSync(lockPath);
            continue;
          } catch {
            // retry
          }
        }
      }
    }
  }

  throw new KnotError({
    code: KnotErrorCode.STORE_LOCKED,
    message: `Timed out waiting for store lock ${name}`,
    hint: "Another Knot process may be using the store. Retry after it finishes, or run knot doctor --repair if the lock is stale.",
  });
}

export async function withLock<T>(lockDir: string, name: string, fn: () => Promise<T>): Promise<T> {
  const handle = acquireLock(lockDir, name);
  try {
    return await fn();
  } finally {
    handle.release();
  }
}
