import { homedir } from "node:os";
import path from "node:path";
import { objectPathSegments, parseContentId } from "./hash.js";
import type { ContentId } from "./types.js";

export function defaultStoreDir(): string {
  if (process.env.KNOT_STORE) {
    return path.resolve(process.env.KNOT_STORE);
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, "knot");
  }
  return path.join(homedir(), ".knot");
}

export function defaultLockPrivateKeyPath(): string {
  if (process.env.KNOT_LOCK_KEY_PATH) {
    return path.resolve(process.env.KNOT_LOCK_KEY_PATH);
  }
  return path.join(defaultStoreDir(), "keys", "lock.ed25519");
}

export interface StoreLayout {
  root: string;
  objects: string;
  manifests: string;
  indexes: string;
  metadata: string;
  registry: string;
  compiled: string;
  unpacked: string;
  tmp: string;
  logs: string;
  locks: string;
  trash: string;
}

export function storeLayout(root: string): StoreLayout {
  return {
    root,
    objects: path.join(root, "objects"),
    manifests: path.join(root, "manifests"),
    indexes: path.join(root, "indexes"),
    metadata: path.join(root, "metadata"),
    registry: path.join(root, "registry"),
    compiled: path.join(root, "compiled"),
    unpacked: path.join(root, "unpacked"),
    tmp: path.join(root, "tmp"),
    logs: path.join(root, "logs"),
    locks: path.join(root, "locks"),
    trash: path.join(root, "trash"),
  };
}

export function objectFilePath(layout: StoreLayout, id: ContentId): string {
  const { algorithm, digest } = parseContentId(id);
  const { prefix, rest } = objectPathSegments(digest);
  return path.join(layout.objects, algorithm, prefix, rest);
}

export function objectMetaPath(layout: StoreLayout, id: ContentId): string {
  const { algorithm, digest } = parseContentId(id);
  const { prefix, rest } = objectPathSegments(digest);
  return path.join(layout.metadata, algorithm, prefix, `${rest}.json`);
}

export function unpackedDir(layout: StoreLayout, id: ContentId): string {
  const { algorithm, digest } = parseContentId(id);
  const { prefix, rest } = objectPathSegments(digest);
  return path.join(layout.unpacked, algorithm, prefix, rest);
}

export function packageManifestPath(layout: StoreLayout, name: string, version: string): string {
  const safe = name.replace(/^@/, "").replace(/\//g, "__");
  return path.join(layout.manifests, `${safe}@${version}.json`);
}

export function projectIndexPath(layout: StoreLayout, projectKey: string): string {
  return path.join(layout.indexes, "projects", `${projectKey}.json`);
}

export function registryCachePath(layout: StoreLayout, source: string, name: string): string {
  const safe = name.replace(/^@/, "").replace(/\//g, "__");
  return path.join(layout.registry, source, `${safe}.json`);
}

export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
