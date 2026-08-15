# Security

See also [SECURITY.md](../SECURITY.md) and [THREAT_MODEL.md](../THREAT_MODEL.md).

```toml
[security.scripts]
default = "deny"
allow = ["some-native-package"]
```

When a package needs an install script and is not allowlisted, Knot prints why and stops. It will not run `node-gyp rebuild` because a tarball asked it to.

`knot verify` re-hashes every object reachable from the current lock and, when a developer public key is configured, checks `lockSignature`. `knot audit` queries OSV when the network is available and says so when it is not.

npm provenance attestations are verified as three separate facts:

1. The DSSE signature matches the embedded certificate key.
2. The in-toto subject digest matches the artifact Knot stored.
3. The certificate chains to a caller-supplied trusted root.

`publisherVerified` is true only when all three succeed. A matching content hash alone never establishes publisher identity. See [attestations](attestations.md).
