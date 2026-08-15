import assert from "node:assert/strict";
import { createHash, createPrivateKey, sign, X509Certificate } from "node:crypto";
import { test } from "node:test";
import {
  DSSE_PAYLOAD_TYPE,
  dssePae,
  encodeStatement,
  integrityOfBytes,
  provenanceFromAttestation,
  verifyAttestationBundle,
  verifyCertificateChain,
  verifyDsseEnvelope,
  verifyNpmAttestations,
  type InTotoStatement,
  type SigstoreBundle,
} from "../../packages/core/src/security/attestations.ts";
import { createTestCertificateAuthority, issueLeafCertificate } from "../helpers/x509.ts";

function signedBundle(options: {
  bytes: Buffer;
  leafPem: string;
  leafKeyPem: string;
  name?: string;
  tamperPayload?: boolean;
}): SigstoreBundle {
  const digest = createHash("sha256").update(options.bytes).digest("hex");
  const statement: InTotoStatement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: options.name ?? "pkg:npm/demo@1.0.0", digest: { sha256: digest } }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: { builder: { id: "knot-test" } },
  };
  const payload = encodeStatement(statement);
  const pae = dssePae(DSSE_PAYLOAD_TYPE, Buffer.from(payload, "base64"));
  const signature = sign("sha256", pae, { key: createPrivateKey(options.leafKeyPem), dsaEncoding: "der" });
  let signedPayload = payload;
  if (options.tamperPayload) {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as InTotoStatement;
    parsed.subject = [{ name: "pkg:npm/evil@9.9.9", digest: { sha256: "00".repeat(32) } }];
    signedPayload = encodeStatement(parsed);
  }
  return {
    dsseEnvelope: {
      payloadType: DSSE_PAYLOAD_TYPE,
      payload: signedPayload,
      signatures: [{ sig: signature.toString("base64") }],
    },
    certificatePem: options.leafPem,
    verificationMaterial: {
      certificate: { rawBytes: new X509Certificate(options.leafPem).raw.toString("base64") },
    },
  };
}

test("generated certificates verify as a chain", () => {
  for (let i = 0; i < 32; i += 1) {
    const ca = createTestCertificateAuthority();
    const leaf = issueLeafCertificate(ca);
    const leafCert = new X509Certificate(leaf.certPem);
    const caCert = new X509Certificate(ca.certPem);
    assert.equal(caCert.verify(caCert.publicKey), true);
    assert.equal(leafCert.verify(caCert.publicKey), true);
    assert.equal(verifyCertificateChain(leafCert, [ca.certPem]), true);
    assert.equal(verifyCertificateChain(leafCert, []), false);
  }
});

test("attestation verification requires signature, subject, and a trusted root for publisher identity", () => {
  const ca = createTestCertificateAuthority();
  const leaf = issueLeafCertificate(ca, "publisher@example.test");
  const other = createTestCertificateAuthority("Other CA");
  const bytes = Buffer.from("attested artifact bytes");
  const integrity = integrityOfBytes(bytes, "sha256");
  const bundle = signedBundle({ bytes, leafPem: leaf.certPem, leafKeyPem: leaf.privateKeyPem });

  const verified = verifyAttestationBundle(bundle, { integrity, artifactBytes: bytes, trustedRoots: [ca.certPem] });
  assert.equal(verified.signatureValid, true);
  assert.equal(verified.subjectMatches, true);
  assert.equal(verified.certificateChainValid, true);
  assert.equal(verified.publisherVerified, true);
  assert.ok(verified.signerIdentity);

  const noRoot = verifyAttestationBundle(bundle, { integrity, artifactBytes: bytes });
  assert.equal(noRoot.signatureValid, true);
  assert.equal(noRoot.subjectMatches, true);
  assert.equal(noRoot.certificateChainValid, false);
  assert.equal(noRoot.publisherVerified, false);
  assert.ok(noRoot.notes.some((note) => note.includes("Publisher identity is not claimed")));

  const wrongRoot = verifyAttestationBundle(bundle, { integrity, trustedRoots: [other.certPem] });
  assert.equal(wrongRoot.signatureValid, true);
  assert.equal(wrongRoot.publisherVerified, false);

  const wrongBytes = verifyAttestationBundle(bundle, {
    integrity: integrityOfBytes(Buffer.from("different"), "sha256"),
    trustedRoots: [ca.certPem],
  });
  assert.equal(wrongBytes.signatureValid, true);
  assert.equal(wrongBytes.subjectMatches, false);
  assert.equal(wrongBytes.publisherVerified, false);

  const tampered = signedBundle({
    bytes,
    leafPem: leaf.certPem,
    leafKeyPem: leaf.privateKeyPem,
    tamperPayload: true,
  });
  const badSig = verifyAttestationBundle(tampered, { integrity, trustedRoots: [ca.certPem] });
  assert.equal(badSig.signatureValid, false);
  assert.equal(badSig.publisherVerified, false);

  const provenance = provenanceFromAttestation(verified, { contentVerified: true, tarballIntegrity: integrity });
  assert.equal(provenance.publisherVerified, true);
  assert.equal(provenance.attestationPresent, true);
  assert.equal(provenance.attestationSignatureValid, true);
  assert.equal(provenance.attestationSubjectMatches, true);
});

test("DSSE verify uses the embedded certificate key and npm attestation lists merge honestly", () => {
  const ca = createTestCertificateAuthority();
  const leaf = issueLeafCertificate(ca);
  const bytes = Buffer.from("list");
  const bundle = signedBundle({ bytes, leafPem: leaf.certPem, leafKeyPem: leaf.privateKeyPem });
  assert.ok(bundle.dsseEnvelope);
  const envelope = {
    payloadType: bundle.dsseEnvelope.payloadType ?? DSSE_PAYLOAD_TYPE,
    payload: bundle.dsseEnvelope.payload!,
    signatures: [{ sig: bundle.dsseEnvelope.signatures![0]!.sig! }],
  };
  assert.equal(verifyDsseEnvelope(envelope, new X509Certificate(leaf.certPem).publicKey), true);

  const empty = verifyNpmAttestations({ attestations: [] });
  assert.equal(empty.present, false);
  assert.equal(empty.publisherVerified, false);

  const merged = verifyNpmAttestations(
    { attestations: [{ predicateType: "https://slsa.dev/provenance/v1", bundle }] },
    { artifactBytes: bytes, trustedRoots: [ca.certPem] },
  );
  assert.equal(merged.present, true);
  assert.equal(merged.count, 1);
  assert.equal(merged.publisherVerified, true);
});
