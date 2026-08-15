# Compatibility

This matrix is a claim about tests, not aspirations.

| Behavior                              | Status                               | Evidence                                                                    |
| ------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| ES modules                            | Supported                            | Integration import from store                                               |
| `package.json` exports                | Supported                            | `tests/unit/exports.test.ts`                                                |
| Conditional exports                   | Supported                            | same                                                                        |
| Subpath exports                       | Supported                            | same                                                                        |
| Static `import`                       | Supported                            | Prefetch scanner + loader                                                   |
| npm integrity (`dist.integrity`)      | Supported                            | Store insert + verify tests                                                 |
| TypeScript entry (`knot run file.ts`) | Supported on Node 22.6+              | type-stripping flags                                                        |
| CommonJS `require`                    | Supported on Node 20.10+ hooks       | `tests/integration/cjs-require.test.ts`                                     |
| Parent-aware nested deps              | Supported                            | `tests/integration/nested-deps.test.ts`                                     |
| Undeclared dependency                 | Fails clearly                        | `KNOT_UNDECLARED_DEPENDENCY`                                                |
| `package.json` `imports`              | Supported                            | `tests/unit/imports.test.ts`, `tests/integration/imports-workspace.test.ts` |
| `workspace:` protocol                 | Supported                            | same + `tests/unit/workspace.test.ts`                                       |
| Lock tamper evidence                  | Supported                            | `tests/unit/lock-digest.test.ts`                                            |
| Developer lock signatures             | Supported                            | `tests/unit/lock-sign.test.ts`                                              |
| Attestation DSSE + subject binding    | Supported                            | `tests/unit/attestations.test.ts`                                           |
| Publisher identity (trusted root)     | Supported when a root is configured  | same; live npm stays unverified without a pinned Fulcio root                |
| Real npm corpus                       | Supported                            | `tests/corpus/npm-corpus.test.ts` (`npm run test:corpus`)                   |
| `import()` with a string literal      | Supported if the package is declared | Prefetch + loader                                                           |
| `import()` with a computed specifier  | Unsupported                          | Fails at runtime with a resolution error                                    |
| `optionalDependencies`                | Partial                              | Fetched only if imported                                                    |
| `peerDependencies`                    | Resolved from the project            | Parent-aware range lookup                                                   |
| Platform `os` / `cpu`                 | Supported                            | Native identity checks                                                      |
| Native `.node` addons                 | Detected                             | Scripts denied by default                                                   |
| `postinstall` / `install`             | Denied by default                    | `tests/unit/scripts.test.ts`                                                |
| Yarn/pnpm plugins, patches            | Unsupported                          | Migrate reads versions only                                                 |
| Bun / Deno runtimes                   | Unsupported                          | Adapter not proven                                                          |

If a package needs an unsupported feature, Knot must fail with a `KNOT_*` code and a hint — not pretend the package loaded.
