# Contributing to Knot.js

Knot executes third-party JavaScript. Treat integrity, archive extraction, and lockfile handling as security-sensitive.

## Development

Requirements: Node.js 20.10+ (22.6+ recommended for TypeScript entrypoints).

```bash
npm install
npm run build
npm test
npm run typecheck
npm run lint
npm run format:check
```

Do not add a dependency unless it replaces infrastructure we should not rewrite. Knot is reinventing dependency _execution_, not every adjacent wheel.

## Rules

- Do not fake functionality or mark incomplete work as done.
- Do not weaken integrity checks to make a package run.
- Do not skip or delete failing tests to obtain a green build.
- Do not claim compatibility or benchmark numbers that were not measured.
- Lifecycle scripts stay denied unless a test is specifically about allowlisting.
- New commands need implementation, tests, documentation, failure handling, and diagnostics.

## Pull requests

Use conventional commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

Open focused pull requests. Describe the execution-model impact, not only the file list.
