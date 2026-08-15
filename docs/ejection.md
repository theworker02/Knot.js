# Ejection

```bash
knot eject
```

Writes `package.json` dependencies from the Knot graph and copies unpacked store objects into `node_modules/`.

## What converts

- Declared and locked package versions
- Stored, verified tarball contents

## What does not fully convert

- Knot script policy (npm will run install scripts unless you change npm's own settings)
- Content-address identity (npm does not use Knot object ids)
- Lazy materialization (eject is eager by nature)

Eject is the escape hatch. Knot should earn adoption through usefulness, not lock-in.
