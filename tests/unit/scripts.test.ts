import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceScriptPolicy } from "../../packages/core/src/security/scripts.ts";
import { KnotErrorCode } from "../../packages/core/src/errors.ts";
import type { ProjectConfig, ResolvedPackage } from "../../packages/core/src/types.ts";

const project = (allow: string[] = []): ProjectConfig => ({
  name: "app",
  version: "1.0.0",
  runtime: "node",
  dependencies: {},
  devDependencies: {},
  optionalDependencies: {},
  peerDependencies: {},
  mode: "lazy",
  integrity: "strict",
  offline: false,
  scripts: { default: "deny", allow },
  workspaceMembers: [],
  lockPath: "knot.lock",
  rootDir: ".",
});

test("install scripts are denied unless allowlisted", () => {
  const pkg: ResolvedPackage = {
    name: "native-thing",
    version: "2.1.0",
    source: "npm",
    requestedRange: "2.1.0",
    dependencies: {},
    optionalDependencies: {},
    peerDependencies: {},
    hasInstallScript: true,
    hasNativeAddon: true,
  };
  assert.throws(
    () => enforceScriptPolicy(pkg, project()),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, KnotErrorCode.SCRIPT_DENIED);
      return true;
    },
  );
  assert.doesNotThrow(() => enforceScriptPolicy(pkg, project(["native-thing"])));
});
