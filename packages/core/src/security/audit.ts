import type { AuditAdvisory, AuditResult, KnotLogger } from "../types.js";
import { createLogger } from "../log.js";
import type { KnotLockfile } from "../lockfile/index.js";

const OSV = "https://api.osv.dev/v1/querybatch";

interface OsvQuery {
  package: { name: string; ecosystem: "npm" };
  version: string;
}

interface OsvResponse {
  results?: Array<{
    vulns?: Array<{
      id?: string;
      summary?: string;
      details?: string;
      severity?: Array<{ type?: string; score?: string }>;
      references?: Array<{ url?: string }>;
    }>;
  }>;
}

export async function auditLock(
  lock: KnotLockfile,
  options: { fetchImpl?: typeof fetch; logger?: KnotLogger; offline?: boolean } = {},
): Promise<AuditResult> {
  const logger = options.logger ?? createLogger();
  if (options.offline) {
    return {
      ok: true,
      advisories: [],
      source: "none",
      notes: ["Audit skipped because offline mode cannot query vulnerability databases."],
    };
  }
  if (lock.packages.length === 0) {
    return { ok: true, advisories: [], source: "osv.dev", notes: ["No locked packages to audit."] };
  }
  const queries: OsvQuery[] = lock.packages.map((pkg) => ({
    package: { name: pkg.name, ecosystem: "npm" },
    version: pkg.version,
  }));
  try {
    const response = await (options.fetchImpl ?? fetch)(OSV, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries }),
    });
    if (!response.ok) {
      return {
        ok: false,
        advisories: [],
        source: "osv.dev",
        notes: [`OSV query failed with HTTP ${response.status}.`],
      };
    }
    const body = (await response.json()) as OsvResponse;
    const advisories: AuditAdvisory[] = [];
    for (const [index, result] of (body.results ?? []).entries()) {
      const pkg = lock.packages[index];
      if (!pkg || !result.vulns) continue;
      for (const vuln of result.vulns) {
        advisories.push({
          name: pkg.name,
          version: pkg.version,
          severity: vuln.severity?.[0]?.score ?? "unknown",
          title: vuln.summary ?? vuln.id ?? "advisory",
          url: vuln.references?.[0]?.url ?? (vuln.id ? `https://osv.dev/vulnerability/${vuln.id}` : undefined),
          source: "osv.dev",
        });
      }
    }
    logger.info(`audit complete`, { packages: lock.packages.length, advisories: advisories.length });
    return { ok: advisories.length === 0, advisories, source: "osv.dev", notes: [] };
  } catch (error) {
    return {
      ok: false,
      advisories: [],
      source: "osv.dev",
      notes: [`Unable to query OSV: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
