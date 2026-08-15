# Migration

```bash
knot migrate --dry-run
knot migrate
```

Reads, in order when present:

- `package-lock.json`
- `yarn.lock`
- `pnpm-lock.yaml`
- `package.json` dependencies

Original lockfiles are never rewritten. The result is `knot.toml` (if missing) and `knot.lock`.
