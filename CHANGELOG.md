# Changelog

## [0.3.0] - 2026-08-15

### Added

- Developer Ed25519 lock signatures (`lockSignature`) in addition to `lockDigest`
- `knot keygen`, `knot lock sign`, and `knot lock verify`
- Frozen/CI/`knot verify` refuse a missing or invalid signature when a project public key is configured
- Provenance attestation verification: DSSE signature, subject-to-artifact binding, and optional certificate-chain check
- `publisherVerified` is true only when signature, subject, and a configured trusted root all succeed
- Live npm corpus (`npm run test:corpus`) for `ms`, `is-number`, `picocolors`, `kleur`, and `escape-string-regexp`

### Changed

- Compatibility matrix and threat model now distinguish lock digest, developer signatures, and publisher identity

## [0.2.0] - 2026-08-15

### Added

- Parent-aware resolution: nested imports use the importing package's declared range
- `KNOT_UNDECLARED_DEPENDENCY` when a package imports a name it did not declare
- `package.json` `imports` (`#specifier`) with escape checks
- `workspace:` protocol and workspace member discovery
- Multi-version lock entries (`name@version`) when ranges require it
- Tamper-evident `lockDigest` on `knot.lock`; frozen/CI runs refuse a mutated lock
- CommonJS `require()` coverage with a fixture corpus (Node customization hooks)

### Changed

- Compatibility matrix now marks imports, workspaces, and CJS as tested rather than aspirational

## [0.1.0] - 2026-08-15

### Added

- Content-addressed global object store with atomic insertion and re-verification
- npm registry source, lazy and prefetch resolution, and `knot.lock`
- Node.js execution without a project-local `node_modules` directory
- CLI: init, run, add, remove, inspect, why, graph, snapshot, verify, audit, gc, cache stats, doctor, migrate, eject, pack, ci, devtools
- Programmatic API via `createKnot()`
- Default-deny lifecycle script policy
- Tests for hashing, resolution, store corruption, offline guarantees, and concurrent inserts
