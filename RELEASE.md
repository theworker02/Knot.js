# Release

Knot is 0.x. Do not publish 1.0 without a measured compatibility corpus.

## Prepare

1. Update `packages/core/package.json`, `packages/cli/package.json`, and `packages/cli/src/version.ts` together.
2. Update `CHANGELOG.md`.
3. `npm run build && npm test && npm run lint && npm run typecheck && npm run format:check`
4. `npm pack --dry-run --workspace @theworker02/knot.js-core && npm pack --dry-run --workspace knotjs`

## Publish

Tag `v0.x.y`. The release workflow builds, tests, packs tarballs, writes `SHA256SUMS`, and creates a GitHub release.

npm publication is manual until trusted publishing is configured:

```bash
npm publish --workspace @theworker02/knot.js-core --access public
npm publish --workspace knotjs --access public
```

Never reuse a published version.
