import type { ProjectConfig, WhyResult } from "./types.js";
import type { KnotLockfile } from "./lockfile/index.js";
import { ContentStore } from "./store/index.js";

export async function explainWhy(
  project: ProjectConfig,
  lock: KnotLockfile,
  store: ContentStore,
  name: string,
): Promise<WhyResult> {
  const pkg = lock.packages.find((item) => item.name === name);
  const requiredBy: string[][] = [];
  if (project.dependencies[name]) {
    requiredBy.push([project.name, `${name}@${pkg?.version ?? project.dependencies[name]}`]);
  }
  for (const parent of lock.packages) {
    if (parent.dependencies && name in parent.dependencies) {
      requiredBy.push([
        project.name,
        `${parent.name}@${parent.version}`,
        `${name}@${pkg?.version ?? parent.dependencies[name]}`,
      ]);
    }
  }
  const cached = Boolean(pkg?.object && (await store.has(pkg.object)));
  let verified = false;
  if (cached && pkg?.object) {
    try {
      await store.verifyObject(pkg.object);
      verified = true;
    } catch {
      verified = false;
    }
  }
  return {
    name,
    version: pkg?.version,
    requiredBy,
    resolvedBecause: pkg
      ? `${requiredBy[0]?.[requiredBy[0].length - 2] ?? project.name} requires ${name} ${pkg.requested ?? project.dependencies[name] ?? pkg.version}`
      : undefined,
    object: pkg?.object,
    integrity: pkg?.integrity,
    cached,
    verified,
  };
}

export function formatWhy(result: WhyResult): string {
  const lines = [`${result.name}${result.version ? `@${result.version}` : ""}`];
  lines.push("Required by:");
  if (result.requiredBy.length === 0) {
    lines.push("(not referenced by the current project lock graph)");
  } else {
    for (const chain of result.requiredBy) {
      chain.forEach((item, index) => {
        lines.push(`${"  ".repeat(index)}${index === 0 ? "" : "└── "}${item}`);
      });
    }
  }
  if (result.resolvedBecause) {
    lines.push("Resolved because:");
    lines.push(`  ${result.resolvedBecause}`);
  }
  lines.push("Object:");
  lines.push(`  ${result.object ?? "(not stored)"}`);
  lines.push("Status:");
  lines.push(`  ${result.cached ? "cached" : "not cached"}`);
  lines.push(`  ${result.verified ? "verified" : "unverified"}`);
  return lines.join("\n");
}
