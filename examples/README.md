# Examples

Every example is intended to run with:

```bash
node ../../packages/cli/dist/bin.js run src/index.ts
```

| Example        | Notes                                |
| -------------- | ------------------------------------ |
| `hello-world`  | No dependencies                      |
| `typescript`   | Type stripping on Node 22.6+         |
| `cli`          | Argv passthrough                     |
| `web-server`   | Stops when `KNOT_EXAMPLE_ONCE=1`     |
| `offline`      | `offline = true`, no registry needed |
| `monorepo`     | Relative workspace import            |
| `native-addon` | Documents script-denial policy       |

Examples that later add registry packages should be snapshotted in CI rather than assumed to work offline.
