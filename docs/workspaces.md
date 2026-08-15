# Workspaces

Knot 0.2 resolves local workspace packages without copying them into the content store.

```toml
[dependencies]
shared = "workspace:*"

[workspace]
members = ["packages/*", "apps/*"]
```

Supported ranges:

| Range                       | Meaning                                        |
| --------------------------- | ---------------------------------------------- |
| `workspace:*`               | The local member with that package name        |
| `workspace:^`               | Same, recorded as a caret of the local version |
| `workspace:~`               | Same, recorded as a tilde of the local version |
| `workspace:packages/shared` | Resolve by member path                         |

Workspace packages participate in the graph and in `knot why` / `knot inspect`. They are not content-addressed npm objects. `knot eject` copies them like any other resolved package when a path exists.

A workspace member that imports an npm package still goes through the parent-aware resolver: the member's `package.json` dependencies are the source of truth, not the root application's hoisted tree.
