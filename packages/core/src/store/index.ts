import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readdir, readFile, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { KnotError, KnotErrorCode } from "../errors.js";
import { writeFileAtomic, writeJsonAtomic, ensureDir, moveToTrash, readJsonFile } from "../fs-atomic.js";
import { contentId, hashFile, parseContentId, sha256, verifyHexDigest, verifyIntegrity } from "../hash.js";
import type { KnotLogger } from "../types.js";
import { createLogger } from "../log.js";
import {
  defaultStoreDir,
  objectFilePath,
  objectMetaPath,
  projectIndexPath,
  storeLayout,
  unpackedDir,
  type StoreLayout,
} from "../paths.js";
import type {
  CacheStats,
  ContentId,
  GcOptions,
  GcResult,
  HashAlgorithm,
  Integrity,
  KnotObject,
  VerifyResult,
} from "../types.js";
import { acquireLock } from "./locks.js";

export interface StoreOptions {
  root?: string;
  logger?: KnotLogger;
}

export interface ProjectIndex {
  projectKey: string;
  rootDir: string;
  updatedAt: string;
  objects: ContentId[];
}

export class ContentStore {
  readonly layout: StoreLayout;
  private readonly logger: KnotLogger;
  private readonly inflight = new Map<string, Promise<KnotObject>>();

  constructor(options: StoreOptions = {}) {
    this.layout = storeLayout(options.root ?? defaultStoreDir());
    this.logger = options.logger ?? createLogger();
  }

  async init(): Promise<void> {
    for (const dir of Object.values(this.layout)) {
      await ensureDir(dir);
    }
    await ensureDir(path.join(this.layout.indexes, "projects"));
    await ensureDir(path.join(this.layout.objects, "sha256"));
    await ensureDir(path.join(this.layout.metadata, "sha256"));
  }

  objectPath(id: ContentId): string {
    return objectFilePath(this.layout, id);
  }

  metaPath(id: ContentId): string {
    return objectMetaPath(this.layout, id);
  }

  unpackedPath(id: ContentId): string {
    return unpackedDir(this.layout, id);
  }

  async has(id: ContentId): Promise<boolean> {
    return existsSync(this.objectPath(id)) && existsSync(this.metaPath(id));
  }

  async getMetadata(id: ContentId): Promise<KnotObject | undefined> {
    const meta = this.metaPath(id);
    if (!existsSync(meta)) {
      return undefined;
    }
    return readJsonFile<KnotObject>(meta);
  }

  async read(id: ContentId): Promise<Buffer> {
    const file = this.objectPath(id);
    if (!existsSync(file)) {
      throw new KnotError({
        code: KnotErrorCode.OFFLINE_MISSING,
        message: "Required object is not present in the local Knot store.",
        object: id,
      });
    }
    const bytes = await readFile(file);
    await this.assertObjectValid(id, bytes);
    await this.touch(id);
    return bytes;
  }

  async put(
    bytes: Buffer,
    options: {
      mediaType?: string;
      source?: string;
      integrity?: Integrity;
      algorithm?: HashAlgorithm;
    } = {},
  ): Promise<KnotObject> {
    const algorithm = options.algorithm ?? "sha256";
    const digestHex = createHash(algorithm).update(bytes).digest("hex");
    const id = contentId(algorithm, digestHex);
    return this.dedupe(id, async () => {
      if (options.integrity && !verifyIntegrity(bytes, options.integrity)) {
        throw new KnotError({
          code: KnotErrorCode.INTEGRITY_MISMATCH,
          message: "Downloaded artifact failed integrity verification.",
          object: id,
          details: { expected: options.integrity },
          hint: "The artifact bytes do not match the registry integrity. Retry, or inspect the source.",
        });
      }
      if (options.algorithm && !verifyHexDigest(bytes, algorithm, digestHex)) {
        throw new KnotError({
          code: KnotErrorCode.INTEGRITY_MISMATCH,
          message: "Content digest did not match computed bytes.",
          object: id,
        });
      }
      return this.insert(id, bytes, options);
    });
  }

  async putFile(
    filePath: string,
    options: {
      mediaType?: string;
      source?: string;
      integrity?: Integrity;
    } = {},
  ): Promise<KnotObject> {
    const bytes = await readFile(filePath);
    return this.put(bytes, options);
  }

  async verifyObject(id: ContentId): Promise<void> {
    const file = this.objectPath(id);
    if (!existsSync(file)) {
      throw new KnotError({
        code: KnotErrorCode.OBJECT_CORRUPT,
        message: "Object metadata exists without bytes, or object is missing.",
        object: id,
      });
    }
    const bytes = await readFile(file);
    await this.assertObjectValid(id, bytes);
  }

  async verifyMany(ids: Iterable<ContentId>): Promise<VerifyResult> {
    const failed: VerifyResult["failed"] = [];
    let checked = 0;
    for (const id of ids) {
      checked += 1;
      try {
        await this.verifyObject(id);
      } catch (error) {
        failed.push({
          object: id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { ok: failed.length === 0, checked, failed };
  }

  async registerProject(index: ProjectIndex): Promise<void> {
    const file = projectIndexPath(this.layout, index.projectKey);
    await writeJsonAtomic(file, index, this.layout.tmp);
  }

  async listProjectIndexes(): Promise<ProjectIndex[]> {
    const dir = path.join(this.layout.indexes, "projects");
    if (!existsSync(dir)) {
      return [];
    }
    const files = await readdir(dir);
    const out: ProjectIndex[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        out.push(await readJsonFile<ProjectIndex>(path.join(dir, file)));
      } catch {
        // skip unreadable indexes; doctor reports these
      }
    }
    return out;
  }

  async gc(options: GcOptions = {}): Promise<GcResult> {
    const lock = acquireLock(this.layout.locks, "gc");
    try {
      const reachable = new Set<ContentId>();
      for (const project of await this.listProjectIndexes()) {
        for (const id of project.objects) {
          reachable.add(id);
        }
      }
      const all = await this.listObjectIds();
      const olderThan = options.olderThanMs;
      const doomed: ContentId[] = [];
      let bytes = 0;
      for (const id of all) {
        if (reachable.has(id)) continue;
        const meta = await this.getMetadata(id);
        if (olderThan && meta?.lastAccessAt) {
          const age = Date.now() - Date.parse(meta.lastAccessAt);
          if (!Number.isNaN(age) && age < olderThan) {
            continue;
          }
        }
        doomed.push(id);
        try {
          bytes += (await stat(this.objectPath(id))).size;
        } catch {
          // missing object still eligible
        }
      }
      if (!options.dryRun) {
        for (const id of doomed) {
          await this.deleteObject(id);
        }
      }
      return {
        dryRun: Boolean(options.dryRun),
        examined: all.length,
        reachable: reachable.size,
        deleted: doomed.length,
        bytesReclaimed: bytes,
        objects: doomed,
      };
    } finally {
      lock.release();
    }
  }

  async stats(): Promise<CacheStats> {
    const ids = await this.listObjectIds();
    let physical = 0;
    for (const id of ids) {
      try {
        physical += (await stat(this.objectPath(id))).size;
      } catch {
        // ignore
      }
    }
    const projects = await this.listProjectIndexes();
    let logical = 0;
    const seen = new Set<string>();
    for (const project of projects) {
      for (const id of project.objects) {
        logical += await this.sizeOf(id);
        seen.add(id);
      }
    }
    if (logical === 0) {
      logical = physical;
    }
    let unpacked = 0;
    if (existsSync(this.layout.unpacked)) {
      unpacked = countLeafDirs(this.layout.unpacked);
    }
    return {
      objects: ids.length,
      physicalBytes: physical,
      logicalBytes: Math.max(logical, physical),
      deduplicatedBytes: Math.max(0, Math.max(logical, physical) - physical),
      projectsObserved: projects.length,
      unpackedPackages: unpacked,
    };
  }

  async listObjectIds(): Promise<ContentId[]> {
    const root = path.join(this.layout.objects, "sha256");
    if (!existsSync(root)) {
      return [];
    }
    const ids: ContentId[] = [];
    const prefixes = await readdir(root);
    for (const prefix of prefixes) {
      const dir = path.join(root, prefix);
      let entries: string[] = [];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (name.endsWith(".partial")) continue;
        ids.push(`sha256:${name}`);
      }
    }
    return ids;
  }

  async orphanTmp(): Promise<string[]> {
    if (!existsSync(this.layout.tmp)) {
      return [];
    }
    const names = await readdir(this.layout.tmp);
    return names.map((name) => path.join(this.layout.tmp, name));
  }

  async clearOrphans(): Promise<number> {
    const orphans = await this.orphanTmp();
    for (const file of orphans) {
      await rm(file, { recursive: true, force: true });
    }
    return orphans.length;
  }

  private async insert(
    id: ContentId,
    bytes: Buffer,
    options: { mediaType?: string; source?: string; integrity?: Integrity },
  ): Promise<KnotObject> {
    const dest = this.objectPath(id);
    const metaDest = this.metaPath(id);
    if (existsSync(dest) && existsSync(metaDest)) {
      await this.assertObjectValid(id, await readFile(dest));
      await this.touch(id);
      const existing = await readJsonFile<KnotObject>(metaDest);
      this.logger.event("CACHE", "hit", { object: id });
      return existing;
    }
    const lock = acquireLock(this.layout.locks, `object-${id.replace(":", "-")}`);
    try {
      if (existsSync(dest) && existsSync(metaDest)) {
        await this.assertObjectValid(id, await readFile(dest));
        return readJsonFile<KnotObject>(metaDest);
      }
      await writeFileAtomic(dest, bytes, this.layout.tmp);
      const now = new Date().toISOString();
      const object: KnotObject = {
        algorithm: parseContentId(id).algorithm,
        digest: parseContentId(id).digest,
        size: bytes.length,
        mediaType: options.mediaType ?? "application/octet-stream",
        source: options.source,
        integrity: options.integrity,
        createdAt: now,
        lastAccessAt: now,
      };
      await writeJsonAtomic(metaDest, object, this.layout.tmp);
      this.logger.event("OBJECT", id, { size: bytes.length, source: options.source });
      this.logger.event("CACHE", "stored", { object: id });
      return object;
    } finally {
      lock.release();
    }
  }

  private async assertObjectValid(id: ContentId, bytes: Buffer): Promise<void> {
    const { algorithm, digest } = parseContentId(id);
    const actual = createHash(algorithm).update(bytes).digest("hex");
    if (actual !== digest) {
      throw new KnotError({
        code: KnotErrorCode.OBJECT_CORRUPT,
        message: "Cached object bytes do not match the content address. The object will not be executed.",
        object: id,
        hint: "Run knot verify, then knot doctor --repair to quarantine the corrupt object.",
      });
    }
    const meta = await this.getMetadata(id);
    if (meta && meta.size !== bytes.length) {
      throw new KnotError({
        code: KnotErrorCode.OBJECT_CORRUPT,
        message: "Object metadata size does not match stored bytes.",
        object: id,
      });
    }
    if (meta?.integrity && !verifyIntegrity(bytes, meta.integrity)) {
      throw new KnotError({
        code: KnotErrorCode.INTEGRITY_MISMATCH,
        message: "Cached object failed its recorded registry integrity.",
        object: id,
      });
    }
  }

  private async touch(id: ContentId): Promise<void> {
    const meta = await this.getMetadata(id);
    if (!meta) return;
    meta.lastAccessAt = new Date().toISOString();
    await writeJsonAtomic(this.metaPath(id), meta, this.layout.tmp);
    try {
      const now = new Date();
      await utimes(this.objectPath(id), now, now);
    } catch {
      // best-effort
    }
  }

  private async deleteObject(id: ContentId): Promise<void> {
    const file = this.objectPath(id);
    const meta = this.metaPath(id);
    const unpacked = this.unpackedPath(id);
    if (existsSync(file)) {
      await moveToTrash(file, this.layout.trash);
    }
    if (existsSync(meta)) {
      await moveToTrash(meta, this.layout.trash);
    }
    if (existsSync(unpacked)) {
      await moveToTrash(unpacked, this.layout.trash);
    }
  }

  private async sizeOf(id: ContentId): Promise<number> {
    try {
      return (await stat(this.objectPath(id))).size;
    } catch {
      return 0;
    }
  }

  private async dedupe(key: string, fn: () => Promise<KnotObject>): Promise<KnotObject> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const promise = fn().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }
}

export function projectKeyFor(rootDir: string): string {
  return sha256(path.resolve(rootDir)).slice(0, 16);
}

function countLeafDirs(root: string): number {
  let count = 0;
  const walk = (dir: string, depth: number): void => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (depth >= 3) {
      count += 1;
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          walk(full, depth + 1);
        }
      } catch {
        // ignore
      }
    }
  };
  walk(root, 0);
  return count;
}

export async function hashExisting(filePath: string): Promise<string> {
  return hashFile(filePath, "sha256");
}

export { acquireLock } from "./locks.js";
