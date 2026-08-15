# JavaScript API

```ts
import { createKnot } from "@magnexis/knot.js-core";

const knot = await createKnot({
  cwd: process.cwd(),
});

const dependency = await knot.resolve("zod");
console.log(dependency.object, dependency.integrity);

await knot.verify();
await knot.signLock();
console.log(await knot.verifyAttestations("zod"));
console.log(await knot.graph());
await knot.snapshot();
console.log(await knot.inspect("zod"));
await knot.gc({ dryRun: true });
```

`createKnot` is the public surface. Store, registry, and loader modules are internal and may change in 0.x.
