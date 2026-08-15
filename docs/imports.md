# package.json imports

Internal specifiers starting with `#` resolve against the **importing package's** `imports` map.

```json
{
  "imports": {
    "#util": "./util.js",
    "#internal/*": "./src/*.js",
    "#lodash": "lodash"
  }
}
```

- A relative target stays inside that package root. Escape attempts fail with `KNOT_IMPORTS_UNRESOLVED`.
- A bare target is resolved as a normal dependency of the same importer.
- Missing `#` mappings fail clearly. Knot does not search `node_modules`.
