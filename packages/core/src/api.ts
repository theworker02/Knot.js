import { writeFile } from "node:fs/promises";
import path from "node:path";
import { doctorProject } from "./doctor.js";
import { ejectProject } from "./eject.js";
import { formatGraphDot, formatGraphText, buildGraph } from "./graph/index.js";
import { inspectPackage } from "./inspect.js";
import { parseSpecifier } from "./registry/specifier.js";
import { removeLockPackage, upsertLockPackage, writeLockfile } from "./lockfile/index.js";
import { loadLockPrivateKey } from "./lockfile/sign.js";
import { parseOlderThan, writeKnotToml } from "./manifest/project.js";
import { migrateProject } from "./migrate.js";
import { packProject } from "./pack.js";
import { persistSession, runProject } from "./runtime/execute.js";
import { RuntimeSession } from "./runtime/session.js";
import { auditLock } from "./security/audit.js";
import { provenanceFromAttestation, verifyNpmAttestations } from "./security/attestations.js";
import { verifyLock } from "./security/verify.js";
import type {
  AuditResult,
  CacheStats,
  CreateKnotOptions,
  DoctorResult,
  GcOptions,
  GcResult,
  InspectResult,
  MigrateResult,
  ProvenanceRecord,
  ResolvedPackage,
  RunOptions,
  SnapshotResult,
  VerifyResult,
  WhyResult,
} from "./types.js";
import { explainWhy } from "./why.js";

export class Knot {
  readonly session: RuntimeSession;

  constructor(session: RuntimeSession) {
    this.session = session;
  }

  get project() {
    return this.session.project;
  }

  get store() {
    return this.session.store;
  }

  async resolve(specifier: string): Promise<ResolvedPackage> {
    const resolved = await this.session.resolver.resolveName(specifier);
    return this.session.resolver.ensurePackage(resolved);
  }

  async fetch(specifier: string): Promise<ResolvedPackage> {
    return this.resolve(specifier);
  }

  async verify(): Promise<VerifyResult> {
    return verifyLock(this.session.store, this.session.resolver.getLock(), {
      publicKey: this.session.project.lockPublicKey,
    });
  }

  async signLock(): Promise<void> {
    const privateKeyPem = await loadLockPrivateKey({
      projectRoot: this.session.project.rootDir,
      required: true,
    });
    const written = await writeLockfile(this.session.project.lockPath, this.session.resolver.getLock(), {
      privateKeyPem,
    });
    this.session.resolver.setLock(written);
  }

  async verifyAttestations(name?: string): Promise<ProvenanceRecord[]> {
    const packages = this.session.resolver
      .getLock()
      .packages.filter((pkg) => (name ? pkg.name === name : true) && pkg.source === "npm" && pkg.version);
    const records: ProvenanceRecord[] = [];
    for (const pkg of packages) {
      const response = await this.session.source.fetchAttestations(pkg.name, pkg.version);
      const result = verifyNpmAttestations(response, { integrity: pkg.integrity });
      records.push(
        provenanceFromAttestation(result, {
          registry: this.session.source.id,
          tarballIntegrity: pkg.integrity,
          contentDigest: pkg.object,
          license: pkg.license,
          contentVerified: Boolean(pkg.integrity),
        }),
      );
    }
    return records;
  }

  async graph() {
    return buildGraph(this.session.project, this.session.resolver.getLock(), this.session.store);
  }

  async graphText(): Promise<string> {
    return formatGraphText(await this.graph());
  }

  async graphDot(): Promise<string> {
    return formatGraphDot(await this.graph());
  }

  async snapshot(): Promise<SnapshotResult> {
    const before = this.session.resolver.getLock().packages.length;
    const packages = await this.session.resolver.snapshotReachable(this.session.project.dependencies);
    await persistSession(this.session);
    const objects = packages.filter((pkg) => pkg.object).length;
    return {
      packages: packages.length,
      objects,
      bytes: 0,
      missingFetched: Math.max(0, packages.length - before),
    };
  }

  async inspect(name: string): Promise<InspectResult> {
    const result = await inspectPackage(
      this.session.project,
      this.session.resolver.getLock(),
      this.session.store,
      name,
    );
    if (result.version && result.source === "npm" && !this.session.project.offline) {
      try {
        const [provenance] = await this.verifyAttestations(result.name);
        if (provenance) {
          result.provenance = provenance;
        }
      } catch {
        // inspect still reports cache/integrity state when attestations are unavailable
      }
    }
    return result;
  }

  async why(name: string): Promise<WhyResult> {
    return explainWhy(this.session.project, this.session.resolver.getLock(), this.session.store, name);
  }

  async gc(options: GcOptions = {}): Promise<GcResult> {
    return this.session.store.gc(options);
  }

  async cacheStats(): Promise<CacheStats> {
    return this.session.store.stats();
  }

  async add(raw: string): Promise<ResolvedPackage> {
    const spec = parseSpecifier(raw);
    const resolved = await this.session.resolver.resolveSpecifier({
      ...spec,
      range: spec.range ?? "latest",
    });
    const stored = await this.session.resolver.ensurePackage(resolved);
    this.session.project.dependencies[stored.name] = spec.range ?? `^${stored.version}`;
    this.session.resolver.setLock(
      upsertLockPackage(this.session.resolver.getLock(), {
        name: stored.name,
        version: stored.version,
        source: stored.source,
        integrity: stored.integrity,
        object: stored.object,
        unpacked: stored.unpacked,
        requested: spec.range ?? `^${stored.version}`,
        dependencies: stored.dependencies,
        optionalDependencies: stored.optionalDependencies,
        license: stored.license,
        hasInstallScript: stored.hasInstallScript,
        hasNativeAddon: stored.hasNativeAddon,
        os: stored.os,
        cpu: stored.cpu,
        workspacePath: stored.workspacePath,
      }),
    );
    await this.persistManifests();
    return stored;
  }

  async remove(name: string): Promise<void> {
    delete this.session.project.dependencies[name];
    this.session.resolver.setLock(removeLockPackage(this.session.resolver.getLock(), name));
    await this.persistManifests();
  }

  async run(entry: string, options: RunOptions = {}): Promise<number> {
    return runProject(this.session, entry, options);
  }

  async eject(): Promise<void> {
    await ejectProject(this.session.project, this.session.resolver.getLock(), this.session.store);
  }

  async migrate(options: { dryRun?: boolean } = {}): Promise<MigrateResult> {
    const { result, lock } = await migrateProject(this.session.project, options);
    if (!options.dryRun) {
      this.session.resolver.setLock(lock);
    }
    return result;
  }

  async pack(output?: string): Promise<string> {
    return packProject(this.session.project, this.session.resolver.getLock(), this.session.store, output);
  }

  async doctor(options: { repair?: boolean } = {}): Promise<DoctorResult> {
    return doctorProject(this.session.project, this.session.resolver.getLock(), this.session.store, {
      repair: options.repair,
      pingRegistry: async () => {
        const response = await fetch(`${process.env.KNOT_REGISTRY ?? "https://registry.npmjs.org"}/zod`);
        return response.ok;
      },
    });
  }

  async audit(): Promise<AuditResult> {
    return auditLock(this.session.resolver.getLock(), {
      offline: this.session.project.offline,
    });
  }

  async persistManifests(): Promise<void> {
    const knotPath = this.session.project.knotTomlPath ?? path.join(this.session.project.rootDir, "knot.toml");
    await writeKnotToml(knotPath, this.session.project);
    this.session.project.knotTomlPath = knotPath;
    if (this.session.project.packageJsonPath) {
      const raw = JSON.parse(
        await (await import("node:fs/promises")).readFile(this.session.project.packageJsonPath, "utf8"),
      ) as {
        dependencies?: Record<string, string>;
      };
      raw.dependencies = this.session.project.dependencies;
      await writeFile(this.session.project.packageJsonPath, JSON.stringify(raw, null, 2) + "\n");
    }
    await persistSession(this.session);
  }
}

export async function createKnot(options: CreateKnotOptions = {}): Promise<Knot> {
  const session = await RuntimeSession.open(options);
  return new Knot(session);
}

export { parseOlderThan };
