import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import * as tar from "tar";
import { KnotError, KnotErrorCode } from "./errors.js";
import type { ProjectConfig } from "./types.js";
import { lockObjects, type KnotLockfile } from "./lockfile/index.js";
import { ContentStore } from "./store/index.js";

export async function packProject(
  project: ProjectConfig,
  lock: KnotLockfile,
  store: ContentStore,
  output?: string,
): Promise<string> {
  const dest = path.resolve(output ?? path.join(project.rootDir, `${project.name}.knot`));
  const staging = path.join(store.layout.tmp, `bundle-${Date.now()}`);
  await mkdir(path.join(staging, "objects"), { recursive: true });
  await mkdir(path.join(staging, "app"), { recursive: true });

  if (project.knotTomlPath && existsSync(project.knotTomlPath)) {
    await writeFile(path.join(staging, "knot.toml"), await readFile(project.knotTomlPath));
  }
  if (existsSync(project.lockPath)) {
    await writeFile(path.join(staging, "knot.lock"), await readFile(project.lockPath));
  }
  if (project.packageJsonPath && existsSync(project.packageJsonPath)) {
    await writeFile(path.join(staging, "app", "package.json"), await readFile(project.packageJsonPath));
  }

  const manifest = {
    name: project.name,
    version: project.version,
    createdAt: new Date().toISOString(),
    objects: lockObjects(lock),
    packages: lock.packages.map((pkg) => ({ name: pkg.name, version: pkg.version, object: pkg.object })),
  };
  await writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  for (const id of lockObjects(lock)) {
    if (!(await store.has(id))) {
      throw new KnotError({
        code: KnotErrorCode.PACK_FAILED,
        message: `Cannot pack missing object ${id}.`,
        object: id,
        hint: "Run knot snapshot before knot pack.",
      });
    }
    const bytes = await store.read(id);
    await writeFile(path.join(staging, "objects", id.replace(":", "-")), bytes);
  }

  await tar.c(
    {
      gzip: false,
      cwd: staging,
      file: dest + ".tmp",
    },
    ["."],
  );

  await pipeline(createReadStream(dest + ".tmp"), createGzip(), createWriteStream(dest));
  return dest;
}
