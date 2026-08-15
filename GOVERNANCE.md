# Governance

Knot.js is an experimental infrastructure project.

## Maintainers

The repository owner (`theworker02`) is the current maintainer.

## Decision process

- Compatibility and security decisions prefer evidence over convenience.
- Features that cannot be implemented correctly are marked experimental or unsupported.
- 1.0 requires a documented compatibility corpus and a stable lock/store format.

## Changes

Substantial changes should be proposed in an issue before a pull request. Security-sensitive changes require tests that would fail if the protection were removed.

## Ejection

Governance includes a product rule: Knot must remain ejectable. Features that trap applications inside Knot-only formats without an export path are out of policy.
