# Asset inventory â€” Knot.js

## Repository surfaces

| Asset | Location / notes |
|-------|------------------|
| Source tree | Repository root / language packages |
| Tests | `test/`, `tests/`, CI workflows if present |
| Docs | `README.md`, `docs/` |
| Diligence room | `docs/acquisition/` |
| License / notices | `LICENSE`, transition notices if present |
| Funding | `.github/FUNDING.yml` |
| CI | `.github/workflows/` if present |
| Branding | logos/assets folders if present |

## Capability highlights

- **Not a drop-in npm clone.** It does not recreate hoisting, plugins, or patch workflows. Unsupported cases fail with a `KNOT_*` code and a hint Ã¢â‚¬â€ not a silent fallback.
- **Not 1.0.** Compatibility is evidenced by tests, not hoped for on a marketing page. See [ROADMAP.md](ROADMAP.md).
- **Not a sandbox.** Verified bytes can still be malware. Knot makes substitution, corruption, and surprise install scripts difficult. It does not decide that JavaScript is trustworthy.
- **Not a publisher-identity system by default.** A matching content hash means the bytes are the bytes. It does not mean the publisher is who you think they are. See [attestations](docs/attestations.md) and [THREAT_MODEL.md](THREAT_MODEL.md).
- **Not lock-in.** `knot eject` writes conventional `package.json` + `node_modules/` where feasible. `knot migrate` reads existing lock metadata and never rewrites it.
- **Wrong bytes from a registry or MITM** Ã¢â‚¬â€ partial. npm `dist.integrity` is verified when present; HTTPS is used; a registry without integrity fails closed in strict mode when integrity is required. Source authenticity is still not publisher identity.
- **Corrupt local cache** Ã¢â‚¬â€ yes. Objects are re-hashed; corrupt objects are not executed.
- **Malicious lifecycle scripts** Ã¢â‚¬â€ yes by default. Denied unless allowlisted.
- **Lockfile tampering** Ã¢â‚¬â€ partial. `lockDigest` plus optional developer `lockSignature`.
- **Fake npm provenance** Ã¢â‚¬â€ partial. DSSE + subject binding are verified; publisher identity requires a pinned trusted root.
- **A compromised-but-intact package** Ã¢â‚¬â€ no. Verified bytes can still be malicious. Knot executes them if the developer declared the dependency.
- ES modules, `package.json` `exports` (including conditional and subpath exports)

## Usually excluded

Seller personal accounts, unrelated repos, and unreissued registry tokens â€” unless listed in the definitive agreement.

*Updated: 2026-09-22*
