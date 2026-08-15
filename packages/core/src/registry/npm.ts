import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import { KnotError, KnotErrorCode } from "../errors.js";
import { createLogger } from "../log.js";
import { encodeRegistryName, parseSpecifier } from "./specifier.js";
import type { NpmAttestationResponse } from "../security/attestations.js";
import type {
  KnotLogger,
  PackageSource,
  PackageSpecifier,
  ProvenanceRecord,
  Resolution,
  ResolvedPackage,
} from "../types.js";
import { registryCachePath, type StoreLayout } from "../paths.js";

export interface NpmPackumentVersion {
  name: string;
  version: string;
  dist?: {
    tarball?: string;
    integrity?: string;
    shasum?: string;
  };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  exports?: unknown;
  imports?: unknown;
  main?: string;
  module?: string;
  type?: "module" | "commonjs";
  license?: string;
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  scripts?: Record<string, string>;
  bin?: Record<string, string> | string;
  repository?: { url?: string } | string;
  hasInstallScript?: boolean;
}

export interface NpmPackument {
  name: string;
  versions: Record<string, NpmPackumentVersion>;
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
}

export interface NpmSourceOptions {
  registryUrl?: string;
  layout?: StoreLayout;
  logger?: KnotLogger;
  fetchImpl?: typeof fetch;
  offline?: boolean;
}

const DEFAULT_REGISTRY = "https://registry.npmjs.org";

export class NpmPackageSource implements PackageSource {
  readonly id = "npm";
  private readonly registryUrl: string;
  private readonly logger: KnotLogger;
  private readonly fetchImpl: typeof fetch;
  private readonly layout?: StoreLayout;
  private readonly offline: boolean;
  private readonly packumentCache = new Map<string, NpmPackument>();

  constructor(options: NpmSourceOptions = {}) {
    this.registryUrl = (options.registryUrl ?? process.env.KNOT_REGISTRY ?? DEFAULT_REGISTRY).replace(/\/$/, "");
    this.logger = options.logger ?? createLogger();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.layout = options.layout;
    this.offline = Boolean(options.offline);
  }

  async resolve(specifier: PackageSpecifier): Promise<Resolution> {
    const parsed = specifier.name ? specifier : parseSpecifier(specifier.raw);
    const packument = await this.packument(parsed.name);
    const version = this.selectVersion(packument, parsed.range);
    const meta = packument.versions[version];
    if (!meta) {
      throw new KnotError({
        code: KnotErrorCode.RESOLUTION_FAILED,
        message: `Version ${version} of ${parsed.name} is missing from the packument.`,
        dependency: `${parsed.name}@${parsed.range ?? "*"}`,
      });
    }
    const pkg = toResolvedPackage(meta, this.registryUrl, packument.time?.[version]);
    this.logger.event("RESOLVE", `${pkg.name}@${pkg.version}`, { range: parsed.range ?? "*", source: this.id });
    return { specifier: parsed, package: pkg };
  }

  async fetch(resolution: Resolution): Promise<import("../types.js").Artifact> {
    const url = resolution.package.tarballUrl;
    if (!url) {
      throw new KnotError({
        code: KnotErrorCode.RESOLUTION_FAILED,
        message: `No tarball URL for ${resolution.package.name}@${resolution.package.version}`,
        dependency: `${resolution.package.name}@${resolution.package.version}`,
      });
    }
    if (this.offline) {
      throw new KnotError({
        code: KnotErrorCode.OFFLINE_MISSING,
        message: "Offline mode is enabled and the artifact is not already cached.",
        dependency: `${resolution.package.name}@${resolution.package.version}`,
      });
    }
    this.logger.event("FETCH", this.hostOf(url), {
      package: `${resolution.package.name}@${resolution.package.version}`,
    });
    const response = await this.request(url);
    if (!response.ok) {
      throw new KnotError({
        code: KnotErrorCode.NETWORK,
        message: `Failed to download ${resolution.package.name}@${resolution.package.version} (${response.status})`,
        dependency: `${resolution.package.name}@${resolution.package.version}`,
      });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      object: {
        algorithm: "sha256",
        digest: "",
        size: bytes.length,
        mediaType: "application/gzip",
        source: url,
        integrity: resolution.package.integrity,
        createdAt: new Date().toISOString(),
        lastAccessAt: new Date().toISOString(),
      },
      bytes,
    };
  }

  async packument(name: string): Promise<NpmPackument> {
    const cached = this.packumentCache.get(name);
    if (cached) {
      return cached;
    }
    const disk = await this.readDiskCache(name);
    if (disk && this.offline) {
      this.packumentCache.set(name, disk);
      return disk;
    }
    if (this.offline) {
      throw new KnotError({
        code: KnotErrorCode.REGISTRY_UNAVAILABLE,
        message: `Offline mode cannot load packument for ${name}.`,
        dependency: name,
        hint: "Run knot snapshot while online, or disable --offline.",
      });
    }
    const url = `${this.registryUrl}/${encodeRegistryName(name)}`;
    const response = await this.request(url, {
      headers: { accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8" },
    });
    if (response.status === 404) {
      throw new KnotError({
        code: KnotErrorCode.RESOLUTION_FAILED,
        message: `Package '${name}' was not found on ${this.registryUrl}.`,
        dependency: name,
      });
    }
    if (!response.ok) {
      throw new KnotError({
        code: KnotErrorCode.REGISTRY_UNAVAILABLE,
        message: `Registry returned ${response.status} for ${name}.`,
        dependency: name,
      });
    }
    const packument = (await response.json()) as NpmPackument;
    this.packumentCache.set(name, packument);
    await this.writeDiskCache(name, packument);
    return packument;
  }

  async fetchAttestations(name: string, version: string): Promise<NpmAttestationResponse> {
    if (this.offline) {
      return { attestations: [] };
    }
    const encoded = `${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
    const url = `${this.registryUrl}/-/npm/v1/attestations/${encoded}`;
    const response = await this.request(url, { headers: { accept: "application/json" } });
    if (response.status === 404) {
      return { attestations: [] };
    }
    if (!response.ok) {
      throw new KnotError({
        code: KnotErrorCode.ATTESTATION,
        message: `Registry returned ${response.status} for attestations of ${name}@${version}.`,
        dependency: `${name}@${version}`,
      });
    }
    return (await response.json()) as NpmAttestationResponse;
  }

  private selectVersion(packument: NpmPackument, range?: string): string {
    const versions = Object.keys(packument.versions);
    if (versions.length === 0) {
      throw new KnotError({
        code: KnotErrorCode.RESOLUTION_FAILED,
        message: `Package '${packument.name}' has no published versions.`,
        dependency: packument.name,
      });
    }
    if (!range || range === "latest" || range === "*") {
      const tagged = packument["dist-tags"]?.latest;
      if (tagged && packument.versions[tagged]) {
        return tagged;
      }
      return versions.sort(semver.rcompare)[0]!;
    }
    if (semver.valid(range) && packument.versions[range]) {
      return range;
    }
    const resolved = semver.maxSatisfying(versions, range, { includePrerelease: false });
    if (!resolved) {
      throw new KnotError({
        code: KnotErrorCode.RESOLUTION_FAILED,
        message: `No version of ${packument.name} satisfies '${range}'.`,
        dependency: `${packument.name}@${range}`,
        hint: "Check the requested range in knot.toml or package.json.",
      });
    }
    return resolved;
  }

  private async request(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init);
    } catch (error) {
      throw new KnotError({
        code: KnotErrorCode.REGISTRY_UNAVAILABLE,
        message: `Unable to reach package source at ${url}.`,
        cause: error,
        hint: "Check network connectivity, proxy settings, or use --offline with a populated store.",
      });
    }
  }

  private hostOf(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  private async readDiskCache(name: string): Promise<NpmPackument | undefined> {
    if (!this.layout) return undefined;
    const file = registryCachePath(this.layout, "npm", name);
    try {
      return JSON.parse(await readFile(file, "utf8")) as NpmPackument;
    } catch {
      return undefined;
    }
  }

  private async writeDiskCache(name: string, packument: NpmPackument): Promise<void> {
    if (!this.layout) return;
    const file = registryCachePath(this.layout, "npm", name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(packument));
  }
}

export function toResolvedPackage(meta: NpmPackumentVersion, registry: string, publishedAt?: string): ResolvedPackage {
  const scripts = meta.scripts ?? {};
  const hasInstallScript = Boolean(
    meta.hasInstallScript || scripts.install || scripts.preinstall || scripts.postinstall || scripts.build,
  );
  const provenance: ProvenanceRecord = {
    registry,
    tarballIntegrity: meta.dist?.integrity as ResolvedPackage["integrity"],
    publishedAt,
    repository: typeof meta.repository === "string" ? meta.repository : meta.repository?.url,
    license: meta.license,
    signaturePresent: false,
    publisherVerified: false,
    contentVerified: Boolean(meta.dist?.integrity),
    attestationPresent: false,
    attestationCount: 0,
    notes: [
      "Content integrity comes from the registry dist.integrity field.",
      "Publisher identity is not established until a provenance attestation is cryptographically verified against a trusted root.",
    ],
  };
  return {
    name: meta.name,
    version: meta.version,
    source: "npm",
    integrity: meta.dist?.integrity as ResolvedPackage["integrity"],
    requestedRange: meta.version,
    tarballUrl: meta.dist?.tarball,
    dependencies: meta.dependencies ?? {},
    optionalDependencies: meta.optionalDependencies ?? {},
    peerDependencies: meta.peerDependencies ?? {},
    peerDependenciesMeta: meta.peerDependenciesMeta,
    exports: meta.exports,
    imports: meta.imports,
    main: meta.main,
    module: meta.module,
    type: meta.type,
    license: meta.license,
    engines: meta.engines,
    os: meta.os,
    cpu: meta.cpu,
    hasInstallScript,
    hasNativeAddon: false,
    bin: meta.bin,
    provenance,
  };
}
