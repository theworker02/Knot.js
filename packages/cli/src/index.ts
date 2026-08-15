import { createServer } from "node:http";
import path from "node:path";
import {
  ContentStore,
  KnotError,
  KnotErrorCode,
  createKnot,
  createLogger,
  defaultLockPrivateKeyPath,
  defaultStoreDir,
  formatGraphDot,
  formatGraphText,
  formatWhy,
  generateLockKeyPair,
  initProject,
  loadProject,
  parseOlderThan,
  writeKnotToml,
  writeLockKeyPair,
} from "@magnexis/knot.js-core";
import { VERSION } from "./version.js";

export { VERSION };

interface Flags {
  rest: string[];
  boolean: Set<string>;
  values: Record<string, string>;
}

export async function main(argv: string[]): Promise<void> {
  const flags = parseArgs(argv);
  const command = flags.rest[0] ?? "help";
  const args = flags.rest.slice(1);

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      write(helpText());
      return;
    case "version":
    case "--version":
    case "-v":
      write(VERSION);
      return;
    case "init":
      await cmdInit(args);
      return;
    case "run":
      await cmdRun(args, flags);
      return;
    case "add":
      await cmdAdd(args);
      return;
    case "remove":
      await cmdRemove(args);
      return;
    case "inspect":
      await cmdInspect(args, flags);
      return;
    case "why":
      await cmdWhy(args);
      return;
    case "gc":
      await cmdGc(flags);
      return;
    case "verify":
      await cmdVerify();
      return;
    case "eject":
      await cmdEject();
      return;
    case "graph":
      await cmdGraph(flags);
      return;
    case "audit":
      await cmdAudit();
      return;
    case "snapshot":
      await cmdSnapshot();
      return;
    case "pack":
      await cmdPack(args);
      return;
    case "ci":
      await cmdCi(args, flags);
      return;
    case "cache":
      await cmdCache(args);
      return;
    case "doctor":
      await cmdDoctor(flags);
      return;
    case "migrate":
      await cmdMigrate(flags);
      return;
    case "devtools":
      await cmdDevtools(flags);
      return;
    case "keygen":
      await cmdKeygen(flags);
      return;
    case "lock":
      await cmdLock(args);
      return;
    default:
      throw new KnotError({
        code: KnotErrorCode.USAGE,
        message: `Unknown command '${command}'.`,
        hint: "Run knot help to list commands.",
      });
  }
}

async function cmdInit(args: string[]): Promise<void> {
  const cwd = path.resolve(args[0] ?? process.cwd());
  const created = await initProject(cwd);
  write(`Initialized Knot project in ${cwd}`);
  for (const file of created) {
    write(`  created ${file}`);
  }
}

async function cmdRun(args: string[], flags: Flags): Promise<void> {
  const entry = args[0] ?? "src/index.ts";
  const knot = await createKnot({
    offline: flags.boolean.has("offline"),
    frozen: flags.boolean.has("frozen"),
  });
  const code = await knot.run(entry, {
    lazy: flags.boolean.has("lazy"),
    prefetch: flags.boolean.has("prefetch"),
    offline: flags.boolean.has("offline"),
    frozen: flags.boolean.has("frozen"),
    argv: args.slice(1),
  });
  process.exitCode = code;
}

async function cmdAdd(args: string[]): Promise<void> {
  const spec = args[0];
  if (!spec) {
    throw new KnotError({ code: KnotErrorCode.USAGE, message: "Usage: knot add <package>" });
  }
  const knot = await createKnot();
  const resolved = await knot.add(spec);
  write(`added ${resolved.name}@${resolved.version}`);
  if (resolved.object) write(`object ${resolved.object}`);
}

async function cmdRemove(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    throw new KnotError({ code: KnotErrorCode.USAGE, message: "Usage: knot remove <package>" });
  }
  const knot = await createKnot();
  await knot.remove(name);
  write(`removed ${name}`);
}

async function cmdInspect(args: string[], flags: Flags): Promise<void> {
  const name = args[0];
  if (!name) {
    throw new KnotError({ code: KnotErrorCode.USAGE, message: "Usage: knot inspect <package>" });
  }
  const knot = await createKnot();
  const result = await knot.inspect(name);
  if (flags.boolean.has("json")) {
    write(JSON.stringify(result, null, 2));
    return;
  }
  write(`${result.name}${result.version ? `@${result.version}` : ""}`);
  write(`resolved version   ${result.version ?? "-"}`);
  write(`source             ${result.source ?? "-"}`);
  write(`integrity          ${result.integrity ?? "-"}`);
  write(`content identity   ${result.object ?? "-"}`);
  write(`cache state        ${result.cached ? "cached" : "missing"} ${result.verified ? "verified" : "unverified"}`);
  write(`disk usage         ${formatBytes(result.diskUsageBytes)}`);
  write(`license            ${result.license ?? "-"}`);
  write(`resolution path    ${result.resolutionPath.join(" → ")}`);
  write(`dependencies       ${Object.keys(result.dependencies).join(", ") || "(none)"}`);
  if (result.provenance) {
    write(`attestations       ${result.provenance.attestationCount}`);
    write(`attestation sig    ${result.provenance.attestationSignatureValid ? "valid" : "unverified"}`);
    write(`subject binding    ${result.provenance.attestationSubjectMatches ? "matched" : "unmatched"}`);
    write(`publisher          ${result.provenance.publisherVerified ? "verified" : "not verified"}`);
    if (result.provenance.signerIdentity) write(`signer             ${result.provenance.signerIdentity}`);
  }
}

async function cmdWhy(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    throw new KnotError({ code: KnotErrorCode.USAGE, message: "Usage: knot why <package>" });
  }
  const knot = await createKnot();
  write(formatWhy(await knot.why(name)));
}

async function cmdGc(flags: Flags): Promise<void> {
  const store = new ContentStore({ root: defaultStoreDir(), logger: createLogger() });
  await store.init();
  const older = flags.values["older-than"];
  const result = await store.gc({
    dryRun: flags.boolean.has("dry-run"),
    olderThanMs: older ? parseOlderThan(older) : undefined,
  });
  write(`examined ${result.examined}`);
  write(`reachable ${result.reachable}`);
  write(`${result.dryRun ? "would delete" : "deleted"} ${result.deleted}`);
  write(`reclaimed ${formatBytes(result.bytesReclaimed)}`);
}

async function cmdVerify(): Promise<void> {
  const knot = await createKnot();
  const result = await knot.verify();
  write(`checked ${result.checked}`);
  if (result.lockDigestOk !== undefined) write(`lock digest        ${result.lockDigestOk ? "ok" : "failed"}`);
  if (result.lockSignatureOk !== undefined) write(`lock signature     ${result.lockSignatureOk ? "ok" : "failed"}`);
  if (!result.ok) {
    for (const failure of result.failed) {
      write(`${failure.object}: ${failure.reason}`);
    }
    const signatureFailed = result.lockSignatureOk === false;
    const digestFailed = result.lockDigestOk === false;
    throw new KnotError({
      code: signatureFailed
        ? KnotErrorCode.LOCK_SIGNATURE
        : digestFailed
          ? KnotErrorCode.LOCK_TAMPERED
          : KnotErrorCode.OBJECT_CORRUPT,
      message: `${result.failed.length} object(s) failed verification.`,
    });
  }
  write("all reachable objects verified");
}

async function cmdKeygen(flags: Flags): Promise<void> {
  const pair = generateLockKeyPair();
  const outDir = flags.values.out ?? path.dirname(defaultLockPrivateKeyPath());
  const privateKeyPath = path.join(outDir, "lock.ed25519");
  let publicKeyPath = path.join(outDir, "lock.ed25519.pub");
  let projectRoot: string | undefined;
  try {
    const project = await loadProject(process.cwd());
    projectRoot = project.rootDir;
    publicKeyPath = path.join(project.rootDir, ".knot", "lock.pub");
    await writeLockKeyPair(pair, { privateKeyPath, publicKeyPath });
    project.lockPublicKey = pair.publicKeyPem;
    project.lockPublicKeyFile = ".knot/lock.pub";
    const knotPath = project.knotTomlPath ?? path.join(project.rootDir, "knot.toml");
    await writeKnotToml(knotPath, project);
    write(`private key ${privateKeyPath}`);
    write(`public key  ${publicKeyPath}`);
    write(`configured  ${knotPath} [security.lock]`);
    return;
  } catch (error) {
    if (projectRoot) throw error;
  }
  await writeLockKeyPair(pair, { privateKeyPath, publicKeyPath });
  write(`private key ${privateKeyPath}`);
  write(`public key  ${publicKeyPath}`);
}

async function cmdLock(args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === "sign") {
    const knot = await createKnot();
    await knot.signLock();
    write("signed knot.lock");
    return;
  }
  if (sub === "verify") {
    await cmdVerify();
    return;
  }
  throw new KnotError({
    code: KnotErrorCode.USAGE,
    message: "Usage: knot lock sign | knot lock verify",
  });
}

async function cmdEject(): Promise<void> {
  const knot = await createKnot();
  await knot.eject();
  write("ejected to package.json + node_modules");
  write("Knot remains available; conventional Node tooling can now take over.");
}

async function cmdGraph(flags: Flags): Promise<void> {
  const knot = await createKnot();
  const graph = await knot.graph();
  if (flags.boolean.has("json")) {
    write(JSON.stringify(graph, null, 2));
    return;
  }
  if (flags.boolean.has("dot")) {
    write(formatGraphDot(graph));
    return;
  }
  write(formatGraphText(graph));
}

async function cmdAudit(): Promise<void> {
  const knot = await createKnot();
  const result = await knot.audit();
  write(`source ${result.source}`);
  if (result.notes.length) {
    for (const note of result.notes) write(note);
  }
  if (result.advisories.length === 0) {
    write("no known advisories from the configured source");
    return;
  }
  for (const advisory of result.advisories) {
    write(`${advisory.severity} ${advisory.name}@${advisory.version} ${advisory.title}`);
    if (advisory.url) write(`  ${advisory.url}`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

async function cmdSnapshot(): Promise<void> {
  const knot = await createKnot();
  const result = await knot.snapshot();
  write(`packages ${result.packages}`);
  write(`objects  ${result.objects}`);
}

async function cmdPack(args: string[]): Promise<void> {
  const knot = await createKnot();
  const dest = await knot.pack(args[0]);
  write(dest);
}

async function cmdCi(args: string[], flags: Flags): Promise<void> {
  const knot = await createKnot({ frozen: true, offline: flags.boolean.has("offline") });
  const verify = await knot.verify();
  if (!verify.ok) {
    throw new KnotError({
      code: KnotErrorCode.OBJECT_CORRUPT,
      message: "CI verification failed.",
      details: { failed: verify.failed },
    });
  }
  const entry = args[0];
  if (entry) {
    const code = await knot.run(entry, { frozen: true, offline: flags.boolean.has("offline"), prefetch: true });
    process.exitCode = code;
    return;
  }
  write("ci ok");
}

async function cmdCache(args: string[]): Promise<void> {
  if (args[0] !== "stats") {
    throw new KnotError({ code: KnotErrorCode.USAGE, message: "Usage: knot cache stats" });
  }
  const store = new ContentStore({ root: defaultStoreDir(), logger: createLogger({ level: "error" }) });
  await store.init();
  const stats = await store.stats();
  write("Knot Store");
  write(`Objects:             ${stats.objects.toLocaleString()}`);
  write(`Physical size:       ${formatBytes(stats.physicalBytes)}`);
  write(`Logical size:        ${formatBytes(stats.logicalBytes)}`);
  write(`Deduplicated:        ${formatBytes(stats.deduplicatedBytes)}`);
  write(`Projects observed:   ${stats.projectsObserved.toLocaleString()}`);
}

async function cmdDoctor(flags: Flags): Promise<void> {
  const knot = await createKnot();
  const result = await knot.doctor({ repair: flags.boolean.has("repair") });
  for (const finding of result.findings) {
    write(
      `${finding.severity.toUpperCase()} ${finding.code} ${finding.message}${finding.repaired ? " (repaired)" : ""}`,
    );
  }
  if (result.findings.length === 0) {
    write("doctor found no issues");
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function cmdMigrate(flags: Flags): Promise<void> {
  const knot = await createKnot();
  const result = await knot.migrate({ dryRun: flags.boolean.has("dry-run") });
  write(`source   ${result.source}`);
  write(`packages ${result.packages}`);
  write(result.dryRun ? "dry run; original lockfiles were not modified" : "wrote knot.lock");
  for (const warning of result.warnings) write(`warning: ${warning}`);
}

async function cmdDevtools(flags: Flags): Promise<void> {
  const knot = await createKnot();
  const port = Number(flags.values.port ?? "17321");
  const graph = await knot.graph();
  const stats = await knot.cacheStats();
  const html = devtoolsHtml(graph, stats);
  const server = createServer((req, res) => {
    if (req.url === "/api/graph") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(graph));
      return;
    }
    if (req.url === "/api/stats") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(stats));
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  write(`Knot devtools listening on http://127.0.0.1:${port}`);
  if (flags.boolean.has("once")) {
    server.close();
  }
}

function parseArgs(argv: string[]): Flags {
  const boolean = new Set<string>();
  const values: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        values[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
        const key = body;
        if (key === "older-than" || key === "port" || key === "out") {
          values[key] = argv[++i]!;
        } else {
          boolean.add(key);
        }
      } else {
        boolean.add(body);
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      boolean.add(arg.slice(1));
    } else {
      rest.push(arg);
    }
  }
  return { rest, boolean, values };
}

function write(text: string): void {
  process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}

function helpText(): string {
  return `Knot.js ${VERSION}
Dependencies without node_modules.

Usage:
  knot <command> [options]

Commands:
  init                 Create knot.toml and a starter entry
  run <entry>          Resolve, verify, and execute
  add <pkg>            Add a dependency
  remove <pkg>         Remove a dependency
  inspect <pkg>        Show resolution and cache state
  why <pkg>            Explain why a package is present
  graph                Print the dependency graph
  snapshot             Materialize the reachable graph
  verify               Verify reachable objects
  audit                Query known advisories
  gc                   Garbage-collect unreferenced objects
  cache stats          Show global store statistics
  doctor               Diagnose store and project issues
  migrate              Import npm/yarn/pnpm lock metadata
  eject                Write package.json + node_modules
  pack [file]          Create a portable .knot bundle
  ci [entry]           Frozen, non-interactive verification
  keygen               Create an Ed25519 developer lock key
  lock sign            Sign knot.lock with the developer key
  lock verify          Verify lock digest and developer signature
  devtools             Local graph and store visualization
  version              Print the CLI version

Run options:
  --lazy --prefetch --offline --frozen
`;
}

function devtoolsHtml(graph: unknown, stats: unknown): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Knot DevTools</title>
<style>
  body { font: 14px/1.5 ui-sans-serif, system-ui; margin: 2rem; background: #0b0f14; color: #e8eef4; }
  h1 { font-weight: 600; }
  pre { background: #121821; padding: 1rem; overflow: auto; }
  .muted { color: #8b9bb0; }
</style>
<h1>Knot DevTools</h1>
<p class="muted">Dependency graph, object store, and cache identity. Functional, not decorative.</p>
<h2>Store</h2>
<pre>${escapeHtml(JSON.stringify(stats, null, 2))}</pre>
<h2>Graph</h2>
<pre>${escapeHtml(JSON.stringify(graph, null, 2))}</pre>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch] ?? ch);
}
