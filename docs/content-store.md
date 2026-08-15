# Content Store

Default root: `~/.knot` (`KNOT_STORE` overrides).

Objects live at `objects/sha256/<prefix>/<digest>`. Metadata is stored beside them and is not trusted without a byte hash.

```bash
knot cache stats
knot gc
knot gc --dry-run
knot gc --older-than 30d
```

GC never deletes objects listed in a registered project index. Deletion moves files through `trash/` so a crash does not leave a half-removed valid object.
