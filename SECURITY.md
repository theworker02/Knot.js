# Security Policy

Knot downloads, verifies, caches, and executes third-party JavaScript. Integrity failures are security bugs.

## Supported versions

| Version | Supported                           |
| ------- | ----------------------------------- |
| 0.x     | Yes, best-effort while experimental |

## Reporting a vulnerability

**Do not open a public issue** for vulnerabilities that could:

- bypass integrity verification
- poison the content store
- traverse paths during archive extraction
- execute lifecycle scripts against policy
- confuse package sources / registries
- treat publisher identity as proven when it is not
- escape any future sandbox

Use GitHub Security Advisories on this repository:

https://github.com/theworker02/Knot.js/security/advisories/new

Include:

- Knot version
- Node.js version and OS
- a minimal reproduction
- impact (integrity bypass, cache poisoning, arbitrary script execution, etc.)

We will acknowledge reports and work on a fix before any coordinated disclosure.

## What Knot claims

Knot claims **verified content** when bytes match a recorded digest/integrity.

Knot does **not** claim **verified publisher identity** unless a provenance attestation's DSSE signature, subject digest, and certificate chain to a configured trusted root have all been verified. Content integrity and publisher identity are not equivalent.

## Scope examples

In scope:

- integrity bypass
- cache poisoning
- path traversal
- arbitrary lifecycle execution
- signature/provenance bypass
- registry confusion
- malicious archive extraction
- TOCTOU races around object insertion

Out of scope unless they break Knot's own guarantees:

- vulnerabilities inside a user-selected dependency's runtime behavior after successful verification
- social-engineering of a developer into allowlisting a malicious install script
