import { readFile } from "node:fs/promises";
import path from "node:path";
import { isBareSpecifier, splitPackageSubpath } from "../registry/specifier.js";

const IMPORT_RE =
  /(?:^|[^\w.$])(?:import\s+(?:type\s+)?(?:[^'"\n]+from\s+)?|export\s+(?:type\s+)?[^'"\n]*from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;

export interface ScanResult {
  specifiers: string[];
  packages: string[];
}

export function scanSource(source: string): ScanResult {
  const specifiers = new Set<string>();
  const packages = new Set<string>();
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1];
    if (!spec || !isBareSpecifier(spec)) continue;
    specifiers.add(spec);
    packages.add(splitPackageSubpath(spec).name);
  }
  return { specifiers: [...specifiers], packages: [...packages] };
}

export async function scanEntry(entryFile: string, maxFiles = 32): Promise<ScanResult> {
  const specifiers = new Set<string>();
  const packages = new Set<string>();
  const queue = [path.resolve(entryFile)];
  const seen = new Set<string>();
  while (queue.length && seen.size < maxFiles) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const scanned = scanSource(source);
    for (const spec of scanned.specifiers) specifiers.add(spec);
    for (const name of scanned.packages) packages.add(name);
    for (const match of source.matchAll(/(?:import|export)\s+[^'"\n]*from\s+['"](\.[^'"]+)['"]/g)) {
      const rel = match[1];
      if (!rel) continue;
      const next = resolveRelative(file, rel);
      if (next) queue.push(next);
    }
  }
  return { specifiers: [...specifiers], packages: [...packages] };
}

function resolveRelative(fromFile: string, spec: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    `${base}.mts`,
    `${base}.mjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ];
  return candidates[0];
}
