import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { finished } from "node:stream/promises";
import type { ContentId, HashAlgorithm, Integrity } from "./types.js";

const HEX = /^[0-9a-f]+$/;

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha512(data: Buffer | string): string {
  return createHash("sha512").update(data).digest("hex");
}

export function digest(algorithm: HashAlgorithm, data: Buffer | string): string {
  return createHash(algorithm).update(data).digest("hex");
}

export function contentId(algorithm: HashAlgorithm, hexDigest: string): ContentId {
  return `${algorithm}:${hexDigest}`;
}

export function parseContentId(id: string): { algorithm: HashAlgorithm; digest: string } {
  const idx = id.indexOf(":");
  if (idx <= 0) {
    throw new Error(`Invalid content id: ${id}`);
  }
  const algorithm = id.slice(0, idx);
  const value = id.slice(idx + 1);
  if ((algorithm !== "sha256" && algorithm !== "sha512") || !HEX.test(value)) {
    throw new Error(`Invalid content id: ${id}`);
  }
  return { algorithm, digest: value };
}

export function integrityOf(algorithm: HashAlgorithm, data: Buffer | string): Integrity {
  const b64 = createHash(algorithm).update(data).digest("base64");
  return `${algorithm}-${b64}`;
}

export function parseIntegrity(value: string): { algorithm: HashAlgorithm; hash: Buffer } {
  const idx = value.indexOf("-");
  if (idx <= 0) {
    throw new Error(`Invalid integrity: ${value}`);
  }
  const algorithm = value.slice(0, idx);
  const b64 = value.slice(idx + 1);
  if (algorithm !== "sha256" && algorithm !== "sha512") {
    throw new Error(`Unsupported integrity algorithm: ${algorithm}`);
  }
  const hash = Buffer.from(b64, "base64");
  if (hash.length === 0) {
    throw new Error(`Invalid integrity: ${value}`);
  }
  return { algorithm, hash };
}

export function verifyIntegrity(data: Buffer, expected: string): boolean {
  const { algorithm, hash } = parseIntegrity(expected);
  const actual = createHash(algorithm).update(data).digest();
  if (actual.length !== hash.length) {
    return false;
  }
  return timingSafeEqual(actual, hash);
}

export function verifyHexDigest(data: Buffer, algorithm: HashAlgorithm, expectedHex: string): boolean {
  const actual = Buffer.from(digest(algorithm, data), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export async function hashFile(filePath: string, algorithm: HashAlgorithm = "sha256"): Promise<string> {
  const hash = createHash(algorithm);
  const stream = createReadStream(filePath);
  stream.on("data", (chunk) => hash.update(chunk));
  await finished(stream);
  return hash.digest("hex");
}

export function objectPathSegments(digestHex: string): { prefix: string; rest: string } {
  if (digestHex.length < 4) {
    throw new Error("Digest too short for object layout");
  }
  return { prefix: digestHex.slice(0, 2), rest: digestHex };
}
