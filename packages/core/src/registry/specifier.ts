import { KnotError, KnotErrorCode } from "../errors.js";
import type { PackageSpecifier } from "../types.js";

const SCOPED = /^(@[a-z0-9.~_-]+\/[a-z0-9.~_-]+)(?:@(.+))?$/i;
const UNNAMED = /^([a-z0-9.~_-]+)(?:@(.+))?$/i;

export function parseSpecifier(raw: string): PackageSpecifier {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new KnotError({
      code: KnotErrorCode.USAGE,
      message: "Package specifier is empty.",
    });
  }
  if (trimmed.startsWith("npm:")) {
    return parseSpecifier(trimmed.slice(4));
  }
  const scoped = SCOPED.exec(trimmed);
  if (scoped?.[1]) {
    return { name: scoped[1], range: scoped[2], raw: trimmed };
  }
  const plain = UNNAMED.exec(trimmed);
  if (plain?.[1]) {
    return { name: plain[1], range: plain[2], raw: trimmed };
  }
  throw new KnotError({
    code: KnotErrorCode.RESOLUTION_FAILED,
    message: `Cannot parse package specifier '${raw}'.`,
    hint: "Use name, name@version, or name@range (for example zod@^4).",
    dependency: raw,
  });
}

export function isPackageImportsSpecifier(specifier: string): boolean {
  return specifier.startsWith("#");
}

export function isBareSpecifier(specifier: string): boolean {
  if (
    !specifier ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    specifier.startsWith("file:")
  ) {
    return false;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier) && !specifier.startsWith("npm:")) {
    return false;
  }
  if (
    specifier.startsWith("node:") ||
    specifier.startsWith("data:") ||
    specifier.startsWith("http:") ||
    specifier.startsWith("https:")
  ) {
    return false;
  }
  return true;
}

export function splitPackageSubpath(specifier: string): { name: string; subpath: string | undefined } {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    if (parts.length < 2) {
      return { name: specifier, subpath: undefined };
    }
    const name = `${parts[0]}/${parts[1]}`;
    const rest = parts.slice(2).join("/");
    return { name, subpath: rest ? `./${rest}` : undefined };
  }
  const slash = specifier.indexOf("/");
  if (slash === -1) {
    return { name: specifier, subpath: undefined };
  }
  return { name: specifier.slice(0, slash), subpath: `./${specifier.slice(slash + 1)}` };
}

export function encodeRegistryName(name: string): string {
  return name.replace(/\//g, "%2f");
}
