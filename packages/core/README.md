<p align="center">
  <img src="../../branding/logo.png" width="320" alt="Knot.js — Dependencies without node_modules">
</p>

# @magnexis/knot.js-core

Programmatic API for Knot.js: content-addressed storage, npm resolution, verification, and execution.

```ts
import { createKnot } from "@magnexis/knot.js-core";

const knot = await createKnot({ cwd: process.cwd() });
const dependency = await knot.resolve("zod");
```

See the repository README and `docs/api.md`.
