# Architecture

Knot is a TypeScript monorepo with two published packages:

| Package                  | Role                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `@magnexis/knot.js-core` | Store, resolver, registry source, runtime, security, public API |
| `@magnexis/knotjs`       | CLI (`knot`)                                                    |

Internal modules inside `@magnexis/knot.js-core` match the conceptual packages from the design: `store`, `resolver`, `runtime`, `security`, `registry`. They are not separate npm packages. Extra package boundaries would add versioning cost without changing the execution model.

## Data flow

```text
                    KNOT
Application ──→ Resolver ──→ Execution
                   │
          ┌────────┴────────┐
          ↓                 ↓
    Content Store      Package Sources
          ↑
          │
     Shared Cache
```

1. The project declares allowed packages in `package.json` and/or `knot.toml`.
2. `knot.lock` records resolved identity, integrity, content address, `lockDigest`, and an optional developer `lockSignature`.
3. The Node customization hook intercepts bare specifiers.
4. The resolver consults the lock, then the configured `PackageSource`.
5. Artifacts are verified, addressed, and inserted atomically.
6. The loader returns a `file:` URL into the unpacked content-addressed directory.

## Store layout

```text
~/.knot/
├── objects/sha256/aa/<digest>
├── metadata/sha256/aa/<digest>.json
├── unpacked/sha256/aa/<digest>/package/
├── manifests/
├── indexes/projects/
├── registry/
├── compiled/
├── tmp/
├── locks/
├── trash/
├── keys/lock.ed25519
└── logs/
```

Developer lock private keys default to `~/.knot/keys/lock.ed25519`. The matching public key is project-local (`.knot/lock.pub` or `knot.toml`).

Objects are immutable after insertion. Writes go to `tmp/` and are renamed into place. A killed process must not leave a valid-looking corrupt object.

## Identity

```text
content identity  = hash(bytes)
package identity  = name + version + source + integrity + content identity
native identity   = package identity + os + arch + abi
```

## Runtime adapters

The core is independent of a specific package manager UX. The first proven adapter is Node.js via `module.register`. Bun, Deno, browsers, and workers are design targets, not claims.

## Concurrency

- In-process fetch/insert deduplication
- Per-object exclusive lockfiles
- A dedicated GC lock
- Project indexes record reachable objects so GC cannot delete in-use content
