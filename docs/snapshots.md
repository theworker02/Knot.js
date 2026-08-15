# Snapshots

```bash
knot snapshot
```

Walks the declared dependency graph, fetches missing objects, verifies them, and updates `knot.lock` plus the project store index.

Use snapshots for CI, containers, air-gapped environments, and reproducible runs:

```bash
knot run --offline --frozen
```
