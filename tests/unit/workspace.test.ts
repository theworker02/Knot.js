import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  discoverWorkspacePackages,
  isWorkspaceRange,
  parseWorkspaceRange,
} from "../../packages/core/src/workspace/index.ts";
import type { ProjectConfig } from "../../packages/core/src/types.ts";

test("parses workspace protocol ranges", () => {
  assert.equal(isWorkspaceRange("workspace:*"), true);
  assert.deepEqual(parseWorkspaceRange("workspace:^"), { kind: "caret", value: "^" });
  assert.deepEqual(parseWorkspaceRange("workspace:packages/shared"), { kind: "path", value: "packages/shared" });
});

test("discovers workspace members from glob patterns", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "knot-ws-"));
  await mkdir(path.join(root, "packages", "shared"), { recursive: true });
  await writeFile(
    path.join(root, "packages", "shared", "package.json"),
    JSON.stringify({ name: "shared", version: "0.2.0", type: "module" }),
  );
  const project = {
    name: "root",
    version: "1.0.0",
    runtime: "node",
    dependencies: {},
    devDependencies: {},
    optionalDependencies: {},
    peerDependencies: {},
    mode: "lazy",
    integrity: "strict",
    offline: false,
    scripts: { default: "deny", allow: [] },
    workspaceMembers: ["packages/*"],
    lockPath: path.join(root, "knot.lock"),
    rootDir: root,
  } as ProjectConfig;
  const members = await discoverWorkspacePackages(project);
  assert.equal(members.length, 1);
  assert.equal(members[0]?.name, "shared");
  assert.equal(members[0]?.relativePath, "packages/shared");
});
