# Buyer evaluation â€” Knot.js

## Goal

In 15â€“45 minutes, verify the Product builds or runs as documented and that proprietary notices are present.

## Steps

1. Confirm root `LICENSE` is proprietary and `ACQUISITION.md` exists.
2. Skim `README.md` install/run claims.
3. Execute:

```
```bash
npm install -g @magnexis/knotjs
npm install @magnexis/knot.js-core
```
```text
declare Ã¢â€ â€™ resolve Ã¢â€ â€™ verify Ã¢â€ â€™ store Ã¢â€ â€™ execute
              Ã¢â€ â€¢
     retrieve when necessary
              Ã¢â€ â€¢
     share immutable content
```
```text
                    KNOT
Application Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€ â€™ Resolver Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€ â€™ Execution
                   Ã¢â€â€š
          Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â´Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
          Ã¢â€ â€œ                 Ã¢â€ â€œ
    Content Store      Package Sources
          Ã¢â€ â€˜
          Ã¢â€â€š
     Shared Cache
```
```text
project
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ node_modules
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ dependency
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ dependency
    Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ thousands more files
```
```text
project
Ã¢â€â€š
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
               Ã¢â€ â€œ
         Content Graph
               Ã¢â€ â€œ
          ~/.knot/store
          Ã¢â€ â„¢     Ã¢â€ â€œ     Ã¢â€ Ëœ
      Project Project Project
```
```

4. Run tests if present (`npm test`, `pytest`, `cargo test`, `go test ./...`, etc.).
5. Record README vs observed behavior gaps in workpapers.

## Pass criteria

- [ ] Clone succeeds
- [ ] Documented happy path works **or** failure is explained
- [ ] Minimal path needs no surprise secrets
- [ ] License notices intact

*Updated: 2026-09-22*
