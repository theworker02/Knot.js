# CLI Reference

```text
knot init
knot run <entry> [--lazy|--prefetch|--offline|--frozen]
knot add <pkg>
knot remove <pkg>
knot inspect <pkg> [--json]
knot why <pkg>
knot graph [--json|--dot]
knot snapshot
knot verify
knot audit
knot gc [--dry-run] [--older-than 30d]
knot cache stats
knot doctor [--repair]
knot migrate [--dry-run]
knot eject
knot pack [file]
knot ci [entry]
knot keygen [--out <dir>]
knot lock sign
knot lock verify
knot devtools [--port 17321]
```

`KNOT_LOG=debug` prints resolve/cache/fetch/verify/object/load events.
