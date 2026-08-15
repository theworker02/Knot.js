import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { KnotError, KnotErrorCode } from "./errors.js";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export function ensureDirSync(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function tmpName(dir: string, prefix: string): string {
  return path.join(dir, `${prefix}-${process.pid}-${randomBytes(8).toString("hex")}.partial`);
}

export async function writeFileAtomic(filePath: string, data: Buffer | string, tmpDir: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await ensureDir(tmpDir);
  const tmp = tmpName(tmpDir, "write");
  try {
    await writeFile(tmp, data);
    await rename(tmp, filePath);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw new KnotError({
      code: KnotErrorCode.IO,
      message: `Failed to write ${filePath}`,
      cause: error,
    });
  }
}

export function writeFileAtomicSync(filePath: string, data: Buffer | string, tmpDir: string): void {
  ensureDirSync(path.dirname(filePath));
  ensureDirSync(tmpDir);
  const tmp = tmpName(tmpDir, "write");
  let fd = -1;
  try {
    fd = openSync(tmp, "wx");
    const buf = typeof data === "string" ? Buffer.from(data) : data;
    writeSync(fd, buf);
    fsyncSync(fd);
    closeSync(fd);
    fd = -1;
    renameSync(tmp, filePath);
  } catch (error) {
    if (fd >= 0) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      rmSync(tmp, { force: true });
    } catch {
      // ignore
    }
    throw new KnotError({
      code: KnotErrorCode.IO,
      message: `Failed to write ${filePath}`,
      cause: error,
    });
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function readJsonFileSync<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export async function writeJsonAtomic(filePath: string, value: unknown, tmpDir: string): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(value, null, 2) + "\n", tmpDir);
}

export function writeJsonAtomicSync(filePath: string, value: unknown, tmpDir: string): void {
  writeFileAtomicSync(filePath, JSON.stringify(value, null, 2) + "\n", tmpDir);
}

export async function moveToTrash(filePath: string, trashDir: string): Promise<void> {
  await ensureDir(trashDir);
  const dest = path.join(trashDir, `${path.basename(filePath)}-${Date.now()}-${randomBytes(4).toString("hex")}`);
  try {
    await rename(filePath, dest);
  } catch {
    await rm(filePath, { recursive: true, force: true });
    return;
  }
  await rm(dest, { recursive: true, force: true });
}
