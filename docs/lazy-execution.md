# Lazy Execution

Bare specifiers are resolved when the runtime encounters them. Transitive dependencies are not materialized just because they appear in someone else's `package.json`.

Concurrent requests for the same artifact share one in-flight promise and one store lock.

CommonJS `require()` is resolved by a `--require` preload that maps bare specifiers onto the content store. That map is built before the process starts, so CJS cannot lazily fetch a never-seen package mid-`require`. Use `--prefetch` or `knot snapshot` for CJS entrypoints. ESM `import` remains lazily fetchable.
