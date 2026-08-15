# Threat Model

Knot is a dependency _execution_ system. It sits on the path between untrusted registries and `node`.

## Assets

- Content store objects and metadata
- `knot.lock` resolution graph
- Project manifests (`knot.toml`, `package.json`)
- The running application process
- Developer attention (script-approval decisions)

## Adversaries

| Adversary                        | Goal                                    |
| -------------------------------- | --------------------------------------- |
| Malicious registry or MITM       | Serve substitute bytes                  |
| Compromised package              | Run code or install scripts             |
| Local attacker / shared CI cache | Corrupt or swap objects                 |
| Concurrent Knot processes        | Race inserts, GC, and verification      |
| Lockfile tampering               | Change resolved identity without notice |

## Threats and current posture

| Threat                                 | Mitigated?     | Notes                                                                                                  |
| -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| Malicious registry serving wrong bytes | Partial        | npm `dist.integrity` is verified when present; source authenticity is not publisher identity           |
| Compromised package                    | No             | Verified bytes can still be malicious. Knot executes them if the developer declared the dependency     |
| MITM                                   | Partial        | HTTPS + integrity. A registry without integrity fails closed in strict mode when integrity is required |
| Corrupted local cache                  | Yes            | Objects are re-hashed; corrupt objects are not executed                                                |
| Malicious archive                      | Partial        | Path traversal and escape symlinks are rejected; extraction is size-limited                            |
| Dependency confusion                   | Partial        | Names resolve against the configured registry only; no implicit extra registries                       |
| Symlink attacks                        | Partial        | Archive links that escape the destination are rejected                                                 |
| TOCTOU races                           | Partial        | Per-object locks and atomic rename; Windows rename is exclusive-create based                           |
| Concurrent cache modification          | Partial        | Object locks + GC lock; killed processes leave `.partial` files, not valid objects                     |
| Lockfile tampering                     | Partial        | `lockDigest` plus optional developer Ed25519 `lockSignature`; required when a public key is configured |
| Fake npm provenance                    | Partial        | DSSE + subject binding are verified; publisher identity requires a pinned trusted root                 |
| Malicious lifecycle scripts            | Yes by default | Denied unless allowlisted                                                                              |
| Native artifact reuse across platforms | Yes            | OS/arch/ABI participate in native identity; incompatible artifacts are rejected                        |

## Explicit non-guarantees

- Knot does not sandbox application code.
- Knot does not prove who published a package unless an attestation signature, subject binding, and trusted-root chain all succeed.
- Knot does not make a malicious-but-intact tarball safe.
- Knot does not replace a software bill of materials or review process.

## Residual risk

The largest residual risk is also the honest one: **a verified package can still be malware**. Knot's job is to make substitution, corruption, and surprise install scripts difficult — not to decide that JavaScript is trustworthy.
