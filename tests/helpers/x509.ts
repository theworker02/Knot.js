import { createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

export interface TestCertificate {
  certPem: string;
  privateKeyPem: string;
  publicKeyPem: string;
  commonName: string;
}

export function createTestCertificateAuthority(commonName = "Knot Test CA"): TestCertificate {
  const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return issueCertificate(keys.privateKey, keys.publicKey, {
    subject: commonName,
    issuerKey: keys.privateKey,
    issuerName: commonName,
    ca: true,
  });
}

export function issueLeafCertificate(ca: TestCertificate, commonName = "Knot Test Publisher"): TestCertificate {
  const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return issueCertificate(keys.privateKey, keys.publicKey, {
    subject: commonName,
    issuerKey: createPrivateKey(ca.privateKeyPem),
    issuerName: ca.commonName,
    ca: false,
  });
}

function issueCertificate(
  subjectPrivate: KeyObject,
  subjectPublic: KeyObject,
  options: { subject: string; issuerKey: KeyObject; issuerName: string; ca: boolean },
): TestCertificate {
  const serial = randomBytes(8);
  serial[0] = serial[0]! & 0x7f || 0x01;
  const now = new Date();
  const notBefore = new Date(now.getTime() - 60_000);
  const notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const tbs = sequence(
    context(0, integer(Buffer.from([2]))),
    integer(serial),
    algorithmId(),
    name(options.issuerName),
    sequence(utcTime(notBefore), utcTime(notAfter)),
    name(options.subject),
    subjectPublic.export({ type: "spki", format: "der" }),
    context(3, sequence(...(options.ca ? [basicConstraints(true), keyUsage(true)] : [keyUsage(false)]))),
  );
  const signature = sign("sha256", tbs, { key: options.issuerKey, dsaEncoding: "der" });
  const der = sequence(tbs, algorithmId(), bitString(signature));
  return {
    certPem: toPem("CERTIFICATE", der),
    privateKeyPem: subjectPrivate.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: subjectPublic.export({ type: "spki", format: "pem" }).toString(),
    commonName: options.subject,
  };
}

function basicConstraints(ca: boolean): Buffer {
  const value = ca ? sequence(bool(true), integer(Buffer.from([0]))) : sequence();
  return sequence(oid("2.5.29.19"), bool(true), octetString(value));
}

function keyUsage(ca: boolean): Buffer {
  const bits = ca ? Buffer.from([0x06]) : Buffer.from([0x80]);
  const unused = ca ? 1 : 7;
  return sequence(oid("2.5.29.15"), bool(true), octetString(bitString(bits, unused)));
}

function algorithmId(): Buffer {
  return sequence(oid("1.2.840.10045.4.3.2"));
}

function name(cn: string): Buffer {
  return sequence(set(sequence(oid("2.5.4.3"), utf8(cn))));
}

function utcTime(date: Date): Buffer {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yy = pad(date.getUTCFullYear() % 100);
  const body = `${yy}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(body, "ascii"));
}

function sequence(...parts: Buffer[]): Buffer {
  return tlv(0x30, Buffer.concat(parts));
}

function set(...parts: Buffer[]): Buffer {
  return tlv(0x31, Buffer.concat(parts));
}

function context(tag: number, inner: Buffer): Buffer {
  return tlv(0xa0 | tag, inner);
}

function integer(value: Buffer): Buffer {
  let bytes = value;
  if (bytes.length === 0) bytes = Buffer.from([0]);
  while (bytes.length > 1 && bytes[0] === 0x00 && (bytes[1]! & 0x80) === 0) {
    bytes = bytes.subarray(1);
  }
  if (bytes[0]! & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return tlv(0x02, bytes);
}

function bool(value: boolean): Buffer {
  return tlv(0x01, Buffer.from([value ? 0xff : 0x00]));
}

function octetString(value: Buffer): Buffer {
  return tlv(0x04, value);
}

function bitString(value: Buffer, unused = 0): Buffer {
  return tlv(0x03, Buffer.concat([Buffer.from([unused]), value]));
}

function utf8(value: string): Buffer {
  return tlv(0x0c, Buffer.from(value, "utf8"));
}

function oid(value: string): Buffer {
  const parts = value.split(".").map(Number);
  const body = [parts[0]! * 40 + parts[1]!];
  for (const part of parts.slice(2)) {
    const stack: number[] = [];
    let n = part;
    stack.push(n & 0x7f);
    n >>= 7;
    while (n > 0) {
      stack.push((n & 0x7f) | 0x80);
      n >>= 7;
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) body.push(stack[i]!);
  }
  return tlv(0x06, Buffer.from(body));
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
}

function derLength(length: number): Buffer {
  if (length < 128) return Buffer.from([length]);
  const bytes: number[] = [];
  let n = length;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function toPem(label: string, der: Buffer): string {
  const b64 = der
    .toString("base64")
    .replace(/(.{64})/g, "$1\n")
    .replace(/\n+$/g, "");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}
