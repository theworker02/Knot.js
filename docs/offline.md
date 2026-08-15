# Offline Mode

```bash
knot run --offline
```

If a required object is missing:

```text
KNOT_OFFLINE_MISSING
Required:
  zod@4.x
Expected object:
  sha256:…
The object does not exist in the local Knot store.
```

Knot will not hang on a network call. Combine with `--frozen` after `knot snapshot` for CI and air-gapped hosts.
