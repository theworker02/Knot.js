# Roadmap

Knot is 0.x. No 1.0 claim until compatibility is evidenced, not hoped for.

## Now (0.3)

- Content-addressed store shared across projects
- npm resolution + integrity verification
- Parent-aware lazy / prefetch / offline / frozen execution on Node.js
- `package.json` imports and `workspace:` members
- Tamper-evident lock digest plus optional developer Ed25519 signatures
- Provenance attestation verification (DSSE + subject binding; publisher identity only with a trusted root)
- Real npm corpus tests (`tests/corpus`)
- Eject and migrate from npm/yarn/pnpm lock metadata
- Honest compatibility matrix with a growing fixture and live corpus

## Next

- Fulcio / Rekor public-good trust (TUF) so live npm attestations can set `publisherVerified` without a pinned root file
- `package.json` `imports` conditions parity with more Node edge cases
- Broader live corpus (native addons, dual-package hazards) with measured results

## Later, only with evidence

- Bun / Deno / workers adapters
- Module-level (file-granular) materialization beyond package tarballs
- Optional native acceleration after profiling — not before
- A Knot-native registry

## Non-goals

- Becoming a drop-in npm clone
- Silent install-script execution
- Claiming publisher authenticity from content hashes alone
- Recreating npm hoisting
