export type HashAlgorithm = "sha256" | "sha512";

export type Integrity = `${HashAlgorithm}-${string}`;

export type ContentId = `${HashAlgorithm}:${string}`;

export type RuntimeName = "node" | "bun" | "deno";

export type ResolutionMode = "lazy" | "prefetch";

export type IntegrityMode = "strict" | "warn";

export type ScriptPolicyDefault = "deny" | "allow";

export interface KnotObject {
  algorithm: HashAlgorithm;
  digest: string;
  size: number;
  mediaType: string;
  source?: string;
  integrity?: Integrity;
  createdAt: string;
  lastAccessAt: string;
}

export interface PackageSpecifier {
  name: string;
  range?: string;
  raw: string;
}

export interface PlatformConstraint {
  os?: string[];
  cpu?: string[];
  libc?: string[];
  abi?: string;
}

export interface NativeIdentity {
  os: string;
  arch: string;
  abi: string;
  napi?: string;
}

export interface PackageIdentity {
  name: string;
  version: string;
  source: string;
  integrity?: Integrity;
  object?: ContentId;
  native?: NativeIdentity;
}

export interface ResolvedPackage extends PackageIdentity {
  requestedRange: string;
  tarballUrl?: string;
  unpacked?: ContentId;
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
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
  hasInstallScript: boolean;
  hasNativeAddon: boolean;
  bin?: Record<string, string> | string;
  provenance?: ProvenanceRecord;
  workspacePath?: string;
}

export interface ProvenanceRecord {
  registry?: string;
  tarballIntegrity?: Integrity;
  contentDigest?: ContentId;
  publishedAt?: string;
  repository?: string;
  license?: string;
  signaturePresent: boolean;
  publisherVerified: boolean;
  contentVerified: boolean;
  attestationPresent: boolean;
  attestationCount: number;
  attestationSignatureValid?: boolean;
  attestationSubjectMatches?: boolean;
  certificateChainValid?: boolean;
  signerIdentity?: string;
  notes: string[];
}

export interface Artifact {
  object: KnotObject;
  bytes: Buffer;
  unpackedDir?: string;
}

export interface Resolution {
  specifier: PackageSpecifier;
  package: ResolvedPackage;
}

export interface PackageSource {
  id: string;
  resolve(specifier: PackageSpecifier): Promise<Resolution>;
  fetch(resolution: Resolution): Promise<Artifact>;
}

export interface GraphNode {
  id: string;
  name: string;
  version: string;
  requestedRange: string;
  integrity?: Integrity;
  object?: ContentId;
  source: string;
  dependencies: string[];
  optional: boolean;
  dev: boolean;
  peer: boolean;
  cached: boolean;
  verified: boolean;
}

export interface DependencyGraph {
  root: string;
  nodes: Record<string, GraphNode>;
}

export interface CacheStats {
  objects: number;
  physicalBytes: number;
  logicalBytes: number;
  deduplicatedBytes: number;
  projectsObserved: number;
  unpackedPackages: number;
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  failed: Array<{ object: ContentId | "knot.lock"; reason: string }>;
  lockDigestOk?: boolean;
  lockSignatureOk?: boolean;
}

export interface GcOptions {
  dryRun?: boolean;
  olderThanMs?: number;
}

export interface GcResult {
  dryRun: boolean;
  examined: number;
  reachable: number;
  deleted: number;
  bytesReclaimed: number;
  objects: ContentId[];
}

export interface RunOptions {
  lazy?: boolean;
  prefetch?: boolean;
  offline?: boolean;
  frozen?: boolean;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}

export interface WhyResult {
  name: string;
  version?: string;
  requiredBy: string[][];
  resolvedBecause?: string;
  object?: ContentId;
  integrity?: Integrity;
  cached: boolean;
  verified: boolean;
}

export interface InspectResult {
  name: string;
  version?: string;
  requestedRange?: string;
  source?: string;
  integrity?: Integrity;
  object?: ContentId;
  unpacked?: string;
  dependencies: Record<string, string>;
  exports?: unknown;
  cached: boolean;
  verified: boolean;
  diskUsageBytes: number;
  license?: string;
  resolutionPath: string[];
  hasInstallScript: boolean;
  hasNativeAddon: boolean;
  provenance?: ProvenanceRecord;
}

export interface DoctorFinding {
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  repairable: boolean;
  repaired?: boolean;
}

export interface DoctorResult {
  ok: boolean;
  findings: DoctorFinding[];
}

export interface AuditAdvisory {
  name: string;
  version: string;
  severity: string;
  title: string;
  url?: string;
  source: string;
}

export interface AuditResult {
  ok: boolean;
  advisories: AuditAdvisory[];
  source: string;
  notes: string[];
}

export interface SnapshotResult {
  packages: number;
  objects: number;
  bytes: number;
  missingFetched: number;
}

export interface MigrateResult {
  dryRun: boolean;
  source: string;
  packages: number;
  warnings: string[];
}

export interface ProjectConfig {
  name: string;
  version: string;
  runtime: RuntimeName;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  mode: ResolutionMode;
  integrity: IntegrityMode;
  offline: boolean;
  scripts: {
    default: ScriptPolicyDefault;
    allow: string[];
  };
  workspaceMembers: string[];
  lockPublicKey?: string;
  lockPublicKeyFile?: string;
  knotTomlPath?: string;
  packageJsonPath?: string;
  lockPath: string;
  rootDir: string;
}

export interface CreateKnotOptions {
  cwd?: string;
  storeDir?: string;
  registryUrl?: string;
  offline?: boolean;
  frozen?: boolean;
  logger?: KnotLogger;
}

export interface KnotLogger {
  level: LogLevel;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  event(kind: TraceKind, message: string, fields?: Record<string, unknown>): void;
}

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

export type TraceKind =
  "RESOLVE" | "CACHE" | "FETCH" | "VERIFY" | "OBJECT" | "LOAD" | "PREFETCH" | "LOCK" | "SCRIPT" | "RUN";
