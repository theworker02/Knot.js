# Prefetching

`--prefetch` (or `mode = "prefetch"`) scans static `import`, `export from`, and `require("…")` strings from the entry module and starts retrieval before execution.

This is not a complete program analysis. Computed `import()` specifiers are not prefetched and will fail at runtime if the package was never declared or cached.

Compare modes with `npm run bench` rather than assuming prefetch is always faster.
