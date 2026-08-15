import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import * as tar from "tar";
import { KnotError, KnotErrorCode } from "./errors.js";

const MAX_ENTRY_BYTES = 512 * 1024 * 1024;

export function assertSafeTarPath(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, "/");
  if (path.isAbsolute(normalized) || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new KnotError({
      code: KnotErrorCode.ARCHIVE,
      message: `Archive entry has an absolute path: ${entryPath}`,
    });
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    throw new KnotError({
      code: KnotErrorCode.ARCHIVE,
      message: `Archive entry escapes the destination: ${entryPath}`,
    });
  }
  return normalized;
}

export async function extractNpmTarball(bytes: Buffer, destDir: string, tmpDir: string): Promise<string> {
  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const tmpTar = path.join(tmpDir, `extract-${process.pid}-${randomBytes(6).toString("hex")}.tgz`);
  await writeFile(tmpTar, bytes);
  try {
    await tar.x({
      file: tmpTar,
      cwd: destDir,
      strict: true,
      preservePaths: false,
      filter(p, entry) {
        assertSafeTarPath(p);
        const record = entry as { size?: number; type?: string; linkpath?: string } | undefined;
        if (record && typeof record.size === "number" && record.size > MAX_ENTRY_BYTES) {
          throw new KnotError({
            code: KnotErrorCode.SIZE_LIMIT,
            message: `Archive entry exceeds size limit: ${p}`,
          });
        }
        if (record && (record.type === "SymbolicLink" || record.type === "Link")) {
          const target = String(record.linkpath ?? "");
          if (target.startsWith("/") || target.includes("..") || /^[a-zA-Z]:/.test(target)) {
            throw new KnotError({
              code: KnotErrorCode.ARCHIVE,
              message: `Archive link is not allowed: ${p} -> ${target}`,
            });
          }
        }
        return true;
      },
    });
  } catch (error) {
    await rm(destDir, { recursive: true, force: true }).catch(() => undefined);
    if (error instanceof KnotError) {
      throw error;
    }
    throw new KnotError({
      code: KnotErrorCode.ARCHIVE,
      message: "Failed to extract package archive.",
      cause: error,
    });
  } finally {
    await rm(tmpTar, { force: true }).catch(() => undefined);
  }
  return destDir;
}

export function packageRootFromExtract(destDir: string): string {
  const nested = path.join(destDir, "package");
  return nested;
}
