# Quick Start

```bash
knot init
knot run src/index.ts
```

Add a registry dependency:

```bash
knot add zod
```

Inspect and explain it:

```bash
knot inspect zod
knot why zod
```

Prepare a machine or image that must not use the network:

```bash
knot snapshot
knot run src/index.ts --offline --frozen
```

Leave Knot:

```bash
knot eject
```
