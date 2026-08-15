import { existsSync } from "node:fs";
import path from "node:path";

const required = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "ROADMAP.md",
  "ARCHITECTURE.md",
  "GOVERNANCE.md",
  "THREAT_MODEL.md",
  "docs/introduction.md",
  "docs/why-knot.md",
  "docs/installation.md",
  "docs/quick-start.md",
  "docs/concepts.md",
  "docs/content-store.md",
  "docs/resolution.md",
  "docs/workspaces.md",
  "docs/imports.md",
  "docs/lazy-execution.md",
  "docs/prefetching.md",
  "docs/lockfiles.md",
  "docs/attestations.md",
  "docs/security.md",
  "docs/offline.md",
  "docs/snapshots.md",
  "docs/ci.md",
  "docs/containers.md",
  "docs/migration.md",
  "docs/ejection.md",
  "docs/compatibility.md",
  "docs/cli.md",
  "docs/api.md",
  "docs/troubleshooting.md",
  "docs/architecture.md",
  "docs/contributing.md",
  "branding/logo.svg",
  "branding/logo-mark.svg",
  "branding/wordmark.svg",
  "branding/favicon.svg",
  "branding/logo.png",
  "branding/logo-mark.png",
  "branding/wordmark.png",
  "branding/favicon.png",
  "website/index.html",
];

const missing = required.filter((file) => !existsSync(path.resolve(file)));
if (missing.length) {
  console.error("Missing documentation files:\n" + missing.map((file) => `  ${file}`).join("\n"));
  process.exit(1);
}
console.log(`docs ok (${required.length} files)`);
