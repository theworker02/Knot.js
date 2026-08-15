import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { KnotError, KnotErrorCode } from "../errors.js";
import { defaultLockPrivateKeyPath } from "../paths.js";
import type { ContentId } from "../types.js";
import type { KnotLockfile } from "./index.js";
import { computeLockDigest } from "./digest.js";

export const LOCK_SIGNATURE_PREFIX = "ed25519:";

export interface LockKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateLockKeyPair(): LockKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function encodeLockPublicKey(pemOrBase64: string): string {
  const key = parsePublicKey(pemOrBase64);
  return key.export({ type: "spki", format: "der" }).toString("base64");
}

export function parsePublicKey(pemOrBase64: string): KeyObject {
  const trimmed = pemOrBase64.trim();
  if (!trimmed) {
    throw new KnotError({
      code: KnotErrorCode.LOCK_SIGNATURE,
      message: "Lock public key is empty.",
    });
  }
  try {
    if (trimmed.includes("BEGIN PUBLIC KEY")) {
      return createPublicKey(trimmed);
    }
    return createPublicKey({ key: Buffer.from(trimmed, "base64"), format: "der", type: "spki" });
  } catch (error) {
    throw new KnotError({
      code: KnotErrorCode.LOCK_SIGNATURE,
      message: "Lock public key could not be parsed.",
      cause: error,
    });
  }
}

export function parsePrivateKey(pem: string): KeyObject {
  try {
    return createPrivateKey(pem);
  } catch (error) {
    throw new KnotError({
      code: KnotErrorCode.LOCK_SIGNATURE,
      message: "Lock private key could not be parsed.",
      cause: error,
    });
  }
}

export function signLockDigest(digest: ContentId, privateKeyPem: string): string {
  const signature = sign(null, Buffer.from(digest, "utf8"), parsePrivateKey(privateKeyPem));
  return `${LOCK_SIGNATURE_PREFIX}${signature.toString("base64")}`;
}

export function verifyLockSignature(digest: ContentId, signature: string, publicKeyPem: string): boolean {
  if (!signature.startsWith(LOCK_SIGNATURE_PREFIX)) {
    return false;
  }
  const bytes = Buffer.from(signature.slice(LOCK_SIGNATURE_PREFIX.length), "base64");
  if (bytes.length === 0) {
    return false;
  }
  try {
    return verify(null, Buffer.from(digest, "utf8"), parsePublicKey(publicKeyPem), bytes);
  } catch {
    return false;
  }
}

export function lockSignatureStatus(
  lock: KnotLockfile,
  publicKey?: string,
): { ok: boolean; required: boolean; reason?: string } {
  if (!publicKey) {
    return { ok: true, required: false };
  }
  const actual = computeLockDigest(lock);
  if (lock.lockDigest && lock.lockDigest !== actual) {
    return {
      ok: false,
      required: true,
      reason: "lockSignature is bound to a lockDigest that no longer matches the package list",
    };
  }
  if (!lock.lockSignature) {
    return { ok: false, required: true, reason: "lockSignature is missing" };
  }
  if (!verifyLockSignature(actual, lock.lockSignature, publicKey)) {
    return {
      ok: false,
      required: true,
      reason: "lockSignature does not match lockDigest and the configured public key",
    };
  }
  return { ok: true, required: true };
}

export function assertLockSignature(lock: KnotLockfile, publicKey: string): void {
  const status = lockSignatureStatus(lock, publicKey);
  if (!status.ok) {
    throw new KnotError({
      code: KnotErrorCode.LOCK_SIGNATURE,
      message: status.reason ?? "knot.lock signature verification failed.",
      hint: "Sign the lock with the matching developer key: knot lock sign.",
    });
  }
}

export async function loadLockPrivateKey(
  options: { projectRoot?: string; required?: boolean } = {},
): Promise<string | undefined> {
  if (process.env.KNOT_LOCK_KEY) {
    return process.env.KNOT_LOCK_KEY;
  }
  const candidates: string[] = [];
  if (process.env.KNOT_LOCK_KEY_PATH) {
    candidates.push(path.resolve(process.env.KNOT_LOCK_KEY_PATH));
  }
  if (options.projectRoot) {
    candidates.push(path.join(options.projectRoot, ".knot", "lock.ed25519"));
  }
  candidates.push(defaultLockPrivateKeyPath());
  for (const file of candidates) {
    if (existsSync(file)) {
      return readFile(file, "utf8");
    }
  }
  if (options.required) {
    throw new KnotError({
      code: KnotErrorCode.LOCK_SIGNATURE,
      message: "No developer lock private key was found.",
      hint: "Run knot keygen, or set KNOT_LOCK_KEY_PATH / KNOT_LOCK_KEY.",
    });
  }
  return undefined;
}

export async function writeLockKeyPair(
  pair: LockKeyPair,
  options: { privateKeyPath: string; publicKeyPath?: string },
): Promise<void> {
  await mkdir(path.dirname(options.privateKeyPath), { recursive: true });
  await writeFile(options.privateKeyPath, pair.privateKeyPem, { mode: 0o600 });
  if (options.publicKeyPath) {
    await mkdir(path.dirname(options.publicKeyPath), { recursive: true });
    await writeFile(options.publicKeyPath, pair.publicKeyPem);
  }
}
