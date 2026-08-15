# CI

```bash
knot ci
knot ci src/index.ts
```

CI defaults:

- frozen lock graph
- strict integrity
- developer lock signature when a public key is configured
- no prompts
- non-zero exit on verification failure

Example GitHub Actions job: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
