import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKnot } from "../../packages/core/src/api.ts";
import { writeKnotToml } from "../../packages/core/src/manifest/project.ts";
import { KnotErrorCode } from "../../packages/core/src/errors.ts";

test("offline mode fails clearly when an object is missing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "knot-offline-"));
  const storeDir = await mkdtemp(path.join(tmpdir(), "knot-store-"));
  await writeKnotToml(path.join(dir, "knot.toml"), {
    name: "demo",
    version: "0.1.0",
    runtime: "node",
    dependencies: { zod: "^4" },
    mode: "lazy",
    integrity: "strict",
    offline: true,
  });
  const knot = await createKnot({ cwd: dir, storeDir, offline: true, registryUrl: "http://127.0.0.1:9" });
  await assert.rejects(
    () => knot.resolve("zod"),
    (error: unknown) => {
      assert.ok(error && typeof error === "object" && "code" in error);
      assert.equal((error as { code: string }).code, KnotErrorCode.OFFLINE_MISSING);
      return true;
    },
  );
});
