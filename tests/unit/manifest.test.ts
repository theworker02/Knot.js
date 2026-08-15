import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadProject } from "../../packages/core/src/manifest/project.ts";

test("loads knot.toml without duplicating package.json unnecessarily", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "knot-manifest-"));
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "demo", version: "1.2.3", dependencies: { zod: "^4" } }),
  );
  await writeFile(
    path.join(dir, "knot.toml"),
    `[project]\nruntime = "node"\n[knot]\nmode = "lazy"\nintegrity = "strict"\n`,
  );
  const project = await loadProject(dir);
  assert.equal(project.name, "demo");
  assert.equal(project.version, "1.2.3");
  assert.equal(project.dependencies.zod, "^4");
  assert.equal(project.mode, "lazy");
});
