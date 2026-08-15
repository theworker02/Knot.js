import assert from "node:assert/strict";
import { test } from "node:test";
import { NpmPackageSource } from "../../packages/core/src/registry/npm.ts";
import { verifyNpmAttestations } from "../../packages/core/src/security/attestations.ts";

const CANDIDATES = [
  { name: "sigstore", version: "3.1.0" },
  { name: "@sigstore/bundle", version: "3.1.0" },
  { name: "tuf-js", version: "3.0.1" },
];

async function registryReachable(): Promise<boolean> {
  try {
    const response = await fetch("https://registry.npmjs.org/-/ping", { signal: AbortSignal.timeout(8000) });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

test("live npm attestations verify DSSE and subject binding without claiming publisher identity", async (t) => {
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

  const source = new NpmPackageSource({ registryUrl: "https://registry.npmjs.org" });
  let found:
    | {
        name: string;
        version: string;
        integrity?: `${"sha256" | "sha512"}-${string}`;
        response: Awaited<ReturnType<NpmPackageSource["fetchAttestations"]>>;
      }
    | undefined;

  for (const candidate of CANDIDATES) {
    const response = await source.fetchAttestations(candidate.name, candidate.version);
    if ((response.attestations?.length ?? 0) === 0) {
      continue;
    }
    const resolution = await source.resolve({
      name: candidate.name,
      range: candidate.version,
      raw: `${candidate.name}@${candidate.version}`,
    });
    found = {
      name: candidate.name,
      version: candidate.version,
      integrity: resolution.package.integrity,
      response,
    };
    break;
  }

  if (!found) {
    if (process.env.KNOT_CORPUS === "1") {
      throw new Error("No candidate package returned npm attestations");
    }
    t.skip("no live npm attestations found for candidate packages");
    return;
  }

  assert.ok(found.integrity, `${found.name}@${found.version} must publish dist.integrity`);
  const artifact = await source.fetch({
    specifier: { name: found.name, range: found.version, raw: `${found.name}@${found.version}` },
    package: (await source.resolve({ name: found.name, range: found.version, raw: `${found.name}@${found.version}` }))
      .package,
  });

  const result = verifyNpmAttestations(found.response, {
    integrity: found.integrity,
    artifactBytes: artifact.bytes,
  });
  assert.equal(result.present, true);
  assert.ok(result.count > 0);
  assert.equal(result.signatureValid, true, "DSSE must verify with the embedded certificate");
  assert.equal(result.subjectMatches, true, "attestation subject must bind the downloaded tarball");
  assert.equal(result.certificateChainValid, false);
  assert.equal(
    result.publisherVerified,
    false,
    "publisher identity is not claimed without a pinned Fulcio/trusted root",
  );
});
