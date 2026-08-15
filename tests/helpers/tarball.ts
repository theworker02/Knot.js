import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as tar from "tar";

export interface FixturePackage {
  name: string;
  version: string;
  type?: "module" | "commonjs";
  exports?: unknown;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  main?: string;
  imports?: unknown;
  omitExports?: boolean;
  files?: Record<string, string>;
}

export async function createNpmTarball(
  pkg: FixturePackage,
): Promise<{ bytes: Buffer; integrity: string; sha256: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "knot-fixture-"));
  const root = path.join(dir, "package");
  await mkdir(root, { recursive: true });
  const files = pkg.files ?? { "index.js": "export const value = 1;\n" };
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        type: pkg.type ?? "module",
        main: pkg.main ?? "index.js",
        ...(pkg.omitExports ? {} : { exports: pkg.exports ?? { ".": "./index.js" } }),
        imports: pkg.imports,
        dependencies: pkg.dependencies ?? {},
        scripts: pkg.scripts,
      },
      null,
      2,
    ),
  );
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  const tgz = path.join(dir, "package.tgz");
  await tar.c({ gzip: true, file: tgz, cwd: dir }, ["package"]);
  const bytes = await readFile(tgz);
  await rm(dir, { recursive: true, force: true });
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes, integrity, sha256 };
}
