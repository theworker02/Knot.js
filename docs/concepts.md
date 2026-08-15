# Concepts

## Manifests

Knot reads `package.json` when present and does not require you to copy name, version, or dependencies into `knot.toml`. `knot.toml` holds Knot-specific policy: mode, integrity, offline, script allowlists, workspace members.

## Lock

`knot.lock` is TOML. It is sorted, diffable, and records integrity plus content identity. Frozen execution refuses packages that are not locked.

## Store

The store is global and content-addressed. Projects register their reachable objects so garbage collection cannot delete live content.

## Verified content vs verified publisher

A matching digest means the bytes are the bytes. It does not mean the publisher is who you think they are.

A developer `lockSignature` means a holder of the project key signed the lock graph. An npm attestation with a valid DSSE signature and matching subject means that statement binds those bytes. Publisher identity is a third claim and requires a trusted certificate root.
