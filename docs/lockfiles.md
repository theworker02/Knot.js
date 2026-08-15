# Lockfiles

```toml
lockVersion = 1

[[package]]
name = "zod"
version = "4.0.0"
source = "npm"
integrity = "sha512-…"
object = "sha256:…"
```

`knot.lock` also records `lockDigest`, a SHA-256 of the canonical package list. That is tamper evidence, not a publisher signature.

Projects can add a **developer** Ed25519 signature over that digest:

```bash
knot keygen
knot lock sign
knot lock verify
```

The public key lives in `.knot/lock.pub` or `knot.toml` `[security.lock]`. The private key stays in `~/.knot/keys/lock.ed25519`, `KNOT_LOCK_KEY_PATH`, or `KNOT_LOCK_KEY`. It is never written into `knot.lock`.

When a public key is configured, `knot verify`, `knot ci`, and `--frozen` refuse a missing or invalid `lockSignature`. This proves the lock was signed by a holder of the developer key. It does not prove who published an npm package.

`knot run --frozen` and `knot ci` refuse dependency drift. Knot does not rewrite `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`.
