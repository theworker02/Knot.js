import { createHash, createPublicKey, verify, X509Certificate, type KeyObject } from "node:crypto";
import { KnotError, KnotErrorCode } from "../errors.js";
import { parseIntegrity, verifyIntegrity } from "../hash.js";
import type { Integrity, ProvenanceRecord } from "../types.js";

export const DSSE_PAYLOAD_TYPE = "application/vnd.in-toto+json";

export interface DsseEnvelope {
  payloadType: string;
  payload: string;
  signatures: Array<{ sig: string; keyid?: string }>;
}

export interface SigstoreBundle {
  mediaType?: string;
  dsseEnvelope?: {
    payloadType?: string;
    payload?: string;
    signatures?: Array<{ sig?: string; keyid?: string }>;
  };
  verificationMaterial?: {
    certificate?: { rawBytes?: string };
    x509CertificateChain?: { certificates?: Array<{ rawBytes?: string }> };
  };
  certificatePem?: string;
}

export interface NpmAttestation {
  predicateType?: string;
  bundle?: SigstoreBundle;
}

export interface NpmAttestationResponse {
  attestations?: NpmAttestation[];
}

export interface InTotoStatement {
  _type?: string;
  subject?: Array<{ name?: string; digest?: Record<string, string> }>;
  predicateType?: string;
  predicate?: unknown;
}

export interface AttestationVerifyOptions {
  integrity?: Integrity;
  artifactBytes?: Buffer;
  trustedRoots?: string[];
}

export interface AttestationVerifyResult {
  present: boolean;
  count: number;
  signatureValid: boolean;
  subjectMatches: boolean;
  certificateChainValid: boolean;
  publisherVerified: boolean;
  signerIdentity?: string;
  predicateTypes: string[];
  notes: string[];
}

export function dssePae(payloadType: string, payload: Buffer): Buffer {
  const type = Buffer.from(payloadType, "utf8");
  const prefix = Buffer.from(`DSSEv1 ${type.length} ${payloadType} ${payload.length} `, "utf8");
  return Buffer.concat([prefix, payload]);
}

export function parseStatement(payloadBase64: string): InTotoStatement {
  const json = Buffer.from(payloadBase64, "base64").toString("utf8");
  return JSON.parse(json) as InTotoStatement;
}

export function encodeStatement(statement: InTotoStatement): string {
  return Buffer.from(JSON.stringify(statement), "utf8").toString("base64");
}

export function certificateFromBundle(bundle: SigstoreBundle): X509Certificate | undefined {
  try {
    if (bundle.certificatePem) {
      return new X509Certificate(bundle.certificatePem);
    }
    const raw =
      bundle.verificationMaterial?.certificate?.rawBytes ??
      bundle.verificationMaterial?.x509CertificateChain?.certificates?.[0]?.rawBytes;
    if (!raw) {
      return undefined;
    }
    return new X509Certificate(Buffer.from(raw, "base64"));
  } catch {
    return undefined;
  }
}

export function chainCertificatesFromBundle(bundle: SigstoreBundle): X509Certificate[] {
  const certs: X509Certificate[] = [];
  const leaf = certificateFromBundle(bundle);
  if (leaf) certs.push(leaf);
  const extras = bundle.verificationMaterial?.x509CertificateChain?.certificates?.slice(1) ?? [];
  for (const item of extras) {
    if (item.rawBytes) {
      certs.push(new X509Certificate(Buffer.from(item.rawBytes, "base64")));
    }
  }
  return certs;
}

export function verifyDsseEnvelope(envelope: DsseEnvelope, publicKey: KeyObject | string): boolean {
  const payload = Buffer.from(envelope.payload, "base64");
  const pae = dssePae(envelope.payloadType, payload);
  const key = typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
  for (const item of envelope.signatures) {
    const signature = Buffer.from(item.sig, "base64");
    if (signature.length === 0) continue;
    if (tryVerify(key, pae, signature)) {
      return true;
    }
  }
  return false;
}

function tryVerify(key: KeyObject, data: Buffer, signature: Buffer): boolean {
  const type = key.asymmetricKeyType;
  if (type === "ed25519" || type === "ed448") {
    try {
      return verify(null, data, key, signature);
    } catch {
      return false;
    }
  }
  for (const encoding of ["der", "ieee-p1363"] as const) {
    try {
      if (verify("SHA256", data, { key, dsaEncoding: encoding }, signature)) {
        return true;
      }
    } catch {
      // try the next encoding
    }
  }
  try {
    return verify("SHA256", data, key, signature);
  } catch {
    return false;
  }
}

export function digestMatchesIntegrity(digest: Record<string, string> | undefined, integrity?: Integrity): boolean {
  if (!digest || !integrity) return false;
  const parsed = parseIntegrity(integrity);
  const candidates = [digest[parsed.algorithm], digest[parsed.algorithm.replace("sha", "sha-")]].filter(
    (value): value is string => Boolean(value),
  );
  for (const candidate of candidates) {
    if (sameHash(parsed.hash, candidate)) {
      return true;
    }
  }
  return false;
}

export function digestMatchesBytes(digest: Record<string, string> | undefined, bytes?: Buffer): boolean {
  if (!digest || !bytes) return false;
  for (const [algorithm, value] of Object.entries(digest)) {
    const normalized = algorithm.replace("-", "").toLowerCase();
    if (normalized !== "sha256" && normalized !== "sha512") continue;
    const actual = createHash(normalized).update(bytes).digest();
    if (sameHash(actual, value)) {
      return true;
    }
  }
  return false;
}

function sameHash(expected: Buffer, candidate: string): boolean {
  const hex =
    candidate.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(candidate) ? Buffer.from(candidate, "hex") : undefined;
  const b64 = Buffer.from(candidate, "base64");
  return Boolean(
    (hex && buffersEqual(expected, hex)) || (b64.length === expected.length && buffersEqual(expected, b64)),
  );
}

function buffersEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

export function subjectMatchesArtifact(statement: InTotoStatement, options: AttestationVerifyOptions): boolean {
  const subjects = statement.subject ?? [];
  return subjects.some((subject) => {
    const digest = subject.digest;
    return digestMatchesIntegrity(digest, options.integrity) || digestMatchesBytes(digest, options.artifactBytes);
  });
}

export function verifyCertificateChain(leaf: X509Certificate, trustedRoots: string[]): boolean {
  if (trustedRoots.length === 0) {
    return false;
  }
  const now = Date.now();
  if (Date.parse(leaf.validFrom) > now || Date.parse(leaf.validTo) < now) {
    return false;
  }
  for (const rootPem of trustedRoots) {
    let root: X509Certificate;
    try {
      root = new X509Certificate(rootPem);
    } catch {
      continue;
    }
    if (Date.parse(root.validFrom) > now || Date.parse(root.validTo) < now) {
      continue;
    }
    try {
      if (leaf.fingerprint256 === root.fingerprint256) {
        return Boolean(leaf.verify(leaf.publicKey));
      }
      if (leaf.verify(root.publicKey)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export function signerIdentityFromCertificate(cert: X509Certificate): string | undefined {
  const san = cert.subjectAltName;
  if (san) {
    const uri = /URI:([^,\s]+)/.exec(san);
    if (uri?.[1]) return uri[1];
    const email = /email:([^,\s]+)/i.exec(san);
    if (email?.[1]) return email[1];
    const dns = /DNS:([^,\s]+)/.exec(san);
    if (dns?.[1]) return dns[1];
  }
  const cn = /CN=([^,\n]+)/.exec(cert.subject);
  return cn?.[1]?.trim();
}

export function verifyAttestationBundle(
  bundle: SigstoreBundle,
  options: AttestationVerifyOptions = {},
): AttestationVerifyResult {
  const notes: string[] = [];
  const envelope = bundle.dsseEnvelope;
  if (!envelope?.payload || !envelope.signatures?.length) {
    return emptyResult("Attestation bundle has no DSSE envelope.");
  }
  const dsse: DsseEnvelope = {
    payloadType: envelope.payloadType ?? DSSE_PAYLOAD_TYPE,
    payload: envelope.payload,
    signatures: envelope.signatures
      .filter((item): item is { sig: string; keyid?: string } => Boolean(item.sig))
      .map((item) => ({ sig: item.sig, keyid: item.keyid })),
  };
  if (dsse.signatures.length === 0) {
    return emptyResult("Attestation bundle has no DSSE signatures.");
  }

  let statement: InTotoStatement;
  try {
    statement = parseStatement(dsse.payload);
  } catch (error) {
    throw new KnotError({
      code: KnotErrorCode.ATTESTATION,
      message: "Attestation payload is not a JSON in-toto statement.",
      cause: error,
    });
  }

  const cert = certificateFromBundle(bundle);
  let signatureValid = false;
  if (cert) {
    signatureValid = verifyDsseEnvelope(dsse, cert.publicKey);
    if (!signatureValid) {
      notes.push("DSSE signature did not verify with the embedded certificate public key.");
    }
  } else {
    notes.push("Attestation bundle has no embedded certificate.");
  }

  const subjectMatches =
    Boolean(options.integrity || options.artifactBytes) && subjectMatchesArtifact(statement, options);
  if (options.integrity || options.artifactBytes) {
    if (!subjectMatches) {
      notes.push("Attestation subject digest does not match the stored artifact.");
    }
  } else {
    notes.push("No artifact integrity was provided, so subject binding was not checked.");
  }

  let certificateChainValid = false;
  if (cert && options.trustedRoots && options.trustedRoots.length > 0) {
    certificateChainValid = verifyCertificateChain(cert, options.trustedRoots);
    if (!certificateChainValid) {
      notes.push("Embedded certificate did not chain to a configured trusted root.");
    }
  } else {
    notes.push("Publisher identity is not claimed: no trusted root was configured for the certificate chain.");
  }

  const publisherVerified = signatureValid && subjectMatches && certificateChainValid;
  if (signatureValid && subjectMatches && !certificateChainValid) {
    notes.push("Content binding is verified. Publisher identity is not.");
  }

  return {
    present: true,
    count: 1,
    signatureValid,
    subjectMatches,
    certificateChainValid,
    publisherVerified,
    signerIdentity: cert ? signerIdentityFromCertificate(cert) : undefined,
    predicateTypes: statement.predicateType ? [statement.predicateType] : [],
    notes,
  };
}

export function verifyNpmAttestations(
  response: NpmAttestationResponse | undefined,
  options: AttestationVerifyOptions = {},
): AttestationVerifyResult {
  const attestations = response?.attestations ?? [];
  if (attestations.length === 0) {
    return {
      present: false,
      count: 0,
      signatureValid: false,
      subjectMatches: false,
      certificateChainValid: false,
      publisherVerified: false,
      predicateTypes: [],
      notes: ["No npm attestations were returned for this package version."],
    };
  }

  const merged: AttestationVerifyResult = {
    present: true,
    count: attestations.length,
    signatureValid: false,
    subjectMatches: false,
    certificateChainValid: false,
    publisherVerified: false,
    predicateTypes: [],
    notes: [],
  };

  for (const item of attestations) {
    if (!item.bundle) {
      merged.notes.push("An attestation entry had no Sigstore bundle.");
      continue;
    }
    const result = verifyAttestationBundle(item.bundle, options);
    merged.signatureValid = merged.signatureValid || result.signatureValid;
    merged.subjectMatches = merged.subjectMatches || result.subjectMatches;
    merged.certificateChainValid = merged.certificateChainValid || result.certificateChainValid;
    merged.publisherVerified = merged.publisherVerified || result.publisherVerified;
    if (result.signerIdentity && !merged.signerIdentity) {
      merged.signerIdentity = result.signerIdentity;
    }
    merged.predicateTypes.push(...result.predicateTypes);
    if (item.predicateType && !merged.predicateTypes.includes(item.predicateType)) {
      merged.predicateTypes.push(item.predicateType);
    }
    merged.notes.push(...result.notes);
  }

  merged.notes = [...new Set(merged.notes)];
  merged.predicateTypes = [...new Set(merged.predicateTypes)];
  return merged;
}

export function provenanceFromAttestation(
  result: AttestationVerifyResult,
  base: Partial<ProvenanceRecord> = {},
): ProvenanceRecord {
  return {
    registry: base.registry,
    tarballIntegrity: base.tarballIntegrity,
    contentDigest: base.contentDigest,
    publishedAt: base.publishedAt,
    repository: base.repository,
    license: base.license,
    signaturePresent: result.signatureValid,
    publisherVerified: result.publisherVerified,
    contentVerified: Boolean(base.contentVerified) || result.subjectMatches,
    attestationPresent: result.present,
    attestationCount: result.count,
    attestationSignatureValid: result.signatureValid,
    attestationSubjectMatches: result.subjectMatches,
    certificateChainValid: result.certificateChainValid,
    signerIdentity: result.signerIdentity,
    notes: result.notes,
  };
}

export function integrityOfBytes(bytes: Buffer, algorithm: "sha256" | "sha512" = "sha512"): Integrity {
  const b64 = createHash(algorithm).update(bytes).digest("base64");
  return `${algorithm}-${b64}`;
}

export function artifactBytesMatchIntegrity(bytes: Buffer, integrity: Integrity): boolean {
  return verifyIntegrity(bytes, integrity);
}

function emptyResult(note: string): AttestationVerifyResult {
  return {
    present: true,
    count: 1,
    signatureValid: false,
    subjectMatches: false,
    certificateChainValid: false,
    publisherVerified: false,
    predicateTypes: [],
    notes: [note],
  };
}
