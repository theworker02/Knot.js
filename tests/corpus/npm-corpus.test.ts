import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createKnot } from "../../packages/core/src/api.ts";
import { writeKnotToml } from "../../packages/core/src/manifest/project.ts";
import { verifyIntegrity } from "../../packages/core/src/hash.ts";

const CORPUS = [
  {
    name: "ms",
    version: "2.1.3",
    check: async (mod: Record<string, unknown>) => {
      const ms = (mod.default ?? mod) as (value: number) => string;
      assert.equal(ms(1000), "1s");
    },
  },
  {
    name: "is-number",
    version: "7.0.0",
    check: async (mod: Record<string, unknown>) => {
      const isNumber = (mod.default ?? mod) as (value: unknown) => boolean;
      assert.equal(isNumber(5), true);
      assert.equal(isNumber("nope"), false);
    },
  },
  {
    name: "picocolors",
    version: "1.1.1",
    check: async (mod: Record<string, unknown>) => {
      const pc = (mod.default ?? mod) as { createColors?: (enabled: boolean) => { red: (s: string) => string } };
      const colors = pc.createColors?.(false) ?? (mod as { red: (s: string) => string });
      assert.equal(colors.red("x"), "x");
    },
  },
  {
    name: "kleur",
    version: "4.1.5",
    check: async (mod: Record<string, unknown>) => {
      const kleur = (mod.default ?? mod) as { red: (s: string) => string };
      assert.equal(typeof kleur.red("x"), "string");
    },
  },
  {
    name: "escape-string-regexp",
    version: "5.0.0",
    check: async (mod: Record<string, unknown>) => {
      const escape = (mod.default ?? mod) as (value: string) => string;
      assert.equal(escape("foo.bar?"), "foo\\.bar\\?");
    },
  },
] as const;

async function registryReachable(): Promise<boolean> {
  try {
    const response = await fetch("https://registry.npmjs.org/ms/2.1.3", {
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

test("real npm packages resolve, verify, store, and execute without node_modules", async (t) => {
  if (process.env.KNOT_CORPUS === "0") {
    t.skip("KNOT_CORPUS=0");
    return;
  }
  const online = await registryReachable();
  if (!online) {
    if (process.env.KNOT_CORPUS === "1") {
      throw new Error("KNOT_CORPUS=1 requires registry.npmjs.org");
    }
    t.skip("registry.npmjs.org is unreachable");
    return;
  }

  const dir = await mkdtemp(path.join(tmpdir(), "knot-corpus-"));
  const storeDir = await mkdtemp(path.join(tmpdir(), "knot-corpus-store-"));
  await writeKnotToml(path.join(dir, "knot.toml"), {
    name: "corpus",
    version: "0.1.0",
    runtime: "node",
    dependencies: Object.fromEntries(CORPUS.map((pkg) => [pkg.name, pkg.version])),
    mode: "lazy",
    integrity: "strict",
  });

  const knot = await createKnot({ cwd: dir, storeDir, registryUrl: "https://registry.npmjs.org" });
  for (const pkg of CORPUS) {
    const resolved = await knot.add(`${pkg.name}@${pkg.version}`);
    assert.ok(resolved.object, `${pkg.name} must have a content identity`);
    assert.ok(resolved.integrity, `${pkg.name} must have registry integrity`);
    const bytes = await knot.store.read(resolved.object);
    assert.equal(verifyIntegrity(bytes, resolved.integrity), true);
    await knot.store.verifyObject(resolved.object);
    const url = await knot.session.resolveFileUrl(pkg.name);
    const imported = (await import(url)) as Record<string, unknown>;
    await pkg.check(imported);
    assert.equal(existsSync(path.join(dir, "node_modules")), false, "corpus must not create node_modules");
  }
});
