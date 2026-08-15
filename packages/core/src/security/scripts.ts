import { KnotError, KnotErrorCode } from "../errors.js";
import type { ProjectConfig, ResolvedPackage } from "../types.js";

export function enforceScriptPolicy(pkg: ResolvedPackage, project: ProjectConfig): void {
  if (!pkg.hasInstallScript) {
    return;
  }
  const allowed = project.scripts.allow.includes(pkg.name) || project.scripts.default === "allow";
  if (allowed) {
    return;
  }
  throw new KnotError({
    code: KnotErrorCode.SCRIPT_DENIED,
    message: [
      "KNOT SECURITY",
      `Package:`,
      `  ${pkg.name}@${pkg.version}`,
      `Requested lifecycle operation:`,
      `  install`,
      `Execution is blocked by current policy.`,
      ``,
      `Knot does not run package install/build scripts unless they are explicitly allowed.`,
    ].join("\n"),
    dependency: `${pkg.name}@${pkg.version}`,
    hint: `Add '${pkg.name}' to [security.scripts].allow in knot.toml if you accept this lifecycle script.`,
    details: {
      policy: project.scripts.default,
      allow: project.scripts.allow,
    },
  });
}

export function formatScriptDenial(pkg: ResolvedPackage, command?: string): string {
  return [
    "KNOT SECURITY",
    "Package:",
    `  ${pkg.name}@${pkg.version}`,
    "Requested lifecycle operation:",
    "  install",
    "Command:",
    `  ${command ?? "(declared install/preinstall/postinstall script)"}`,
    "Execution is blocked by current policy.",
  ].join("\n");
}
