export const KnotErrorCode = {
  RESOLUTION_FAILED: "KNOT_RESOLUTION_FAILED",
  INTEGRITY_MISMATCH: "KNOT_INTEGRITY_MISMATCH",
  OBJECT_CORRUPT: "KNOT_OBJECT_CORRUPT",
  OFFLINE_MISSING: "KNOT_OFFLINE_MISSING",
  SCRIPT_DENIED: "KNOT_SCRIPT_DENIED",
  PLATFORM_UNSUPPORTED: "KNOT_PLATFORM_UNSUPPORTED",
  LOCK_DRIFT: "KNOT_LOCK_DRIFT",
  REGISTRY_UNAVAILABLE: "KNOT_REGISTRY_UNAVAILABLE",
  MANIFEST_INVALID: "KNOT_MANIFEST_INVALID",
  LOCK_INVALID: "KNOT_LOCK_INVALID",
  STORE_CORRUPT: "KNOT_STORE_CORRUPT",
  STORE_LOCKED: "KNOT_STORE_LOCKED",
  UNSUPPORTED: "KNOT_UNSUPPORTED",
  USAGE: "KNOT_USAGE",
  IO: "KNOT_IO",
  NETWORK: "KNOT_NETWORK",
  TYPESCRIPT: "KNOT_TYPESCRIPT",
  NATIVE_INCOMPATIBLE: "KNOT_NATIVE_INCOMPATIBLE",
  EJECT_FAILED: "KNOT_EJECT_FAILED",
  MIGRATE_FAILED: "KNOT_MIGRATE_FAILED",
  PACK_FAILED: "KNOT_PACK_FAILED",
  DOCTOR: "KNOT_DOCTOR",
  FROZEN: "KNOT_FROZEN",
  SIZE_LIMIT: "KNOT_SIZE_LIMIT",
  ARCHIVE: "KNOT_ARCHIVE",
  PROJECT_NOT_FOUND: "KNOT_PROJECT_NOT_FOUND",
  UNDECLARED_DEPENDENCY: "KNOT_UNDECLARED_DEPENDENCY",
  LOCK_TAMPERED: "KNOT_LOCK_TAMPERED",
  LOCK_SIGNATURE: "KNOT_LOCK_SIGNATURE",
  ATTESTATION: "KNOT_ATTESTATION",
  WORKSPACE_UNRESOLVED: "KNOT_WORKSPACE_UNRESOLVED",
  IMPORTS_UNRESOLVED: "KNOT_IMPORTS_UNRESOLVED",
} as const;

export type KnotErrorCode = (typeof KnotErrorCode)[keyof typeof KnotErrorCode];

export interface KnotErrorOptions {
  code: KnotErrorCode;
  message: string;
  cause?: unknown;
  dependency?: string;
  object?: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export class KnotError extends Error {
  readonly code: KnotErrorCode;
  readonly dependency?: string;
  readonly object?: string;
  readonly hint?: string;
  readonly details: Record<string, unknown>;

  constructor(options: KnotErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "KnotError";
    this.code = options.code;
    this.dependency = options.dependency;
    this.object = options.object;
    this.hint = options.hint;
    this.details = options.details ?? {};
  }

  override toString(): string {
    const lines = [`${this.code}: ${this.message}`];
    if (this.dependency) {
      lines.push(`Dependency: ${this.dependency}`);
    }
    if (this.object) {
      lines.push(`Object: ${this.object}`);
    }
    if (this.hint) {
      lines.push(`Hint: ${this.hint}`);
    }
    return lines.join("\n");
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      dependency: this.dependency,
      object: this.object,
      hint: this.hint,
      details: this.details,
    };
  }
}

export function isKnotError(value: unknown): value is KnotError {
  return value instanceof KnotError;
}

export function fail(options: KnotErrorOptions): never {
  throw new KnotError(options);
}
