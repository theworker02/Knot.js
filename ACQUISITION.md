# Acquisition Brief â€” Knot.js

**Date:** 2026-09-22  
**Repository:** https://github.com/theworker02/Knot.js  
**Default branch:** `main`  
**Primary language:** TypeScript  
**Status:** Diligence briefing only. **No acquisition has occurred** by virtue of this file.  
**License:** Proprietary â€” sale, written commercial license, or completed asset transfer required (see root `LICENSE`).  
**Valuation:** Not stated.  
**Contact:** GitHub [@theworker02](https://github.com/theworker02) Â· [thanks.dev/u/gh/theworker02](https://thanks.dev/u/gh/theworker02)

> Cloning or forking this repository does **not** grant production, redistribution, SaaS, OEM, or commercial rights.

---

## 1. Executive thesis

<img src="branding/logo.png" width="420" alt="Knot.js Ã¢â‚¬â€ Dependencies without node_modules"> Knot is an experimental content-addressed dependency execution framework for JavaScript and TypeScript. <a href="https://www.npmjs.com/package/@magnexis/knotjs"><img src="https://img.shields.io/npm/v/@magnexis/knotjs?label=%40magnexis%2fknotjs" alt="npm CLI"></a>

**Why a buyer cares:** Knot.js packages transferable product IP â€” source, docs, in-repo brand assets, and a diligence room under `docs/acquisition/` â€” under a clear proprietary posture so diligence can proceed without mistaking the repo for open source.

---

## 2. Product snapshot

| Item           | Detail                 |
| -------------- | ---------------------- |
| Product        | Knot.js                |
| Repo           | `theworker02/Knot.js`  |
| Language       | TypeScript             |
| Open source?   | **No** â€” proprietary |
| Rightsholder   | theworker02            |
| Diligence pack | `docs/acquisition/`    |

### Capability highlights (from current materials)

- **Not a drop-in npm clone.** It does not recreate hoisting, plugins, or patch workflows. Unsupported cases fail with a `KNOT_*` code and a hint Ã¢â‚¬â€ not a silent fallback.
- **Not 1.0.** Compatibility is evidenced by tests, not hoped for on a marketing page. See [ROADMAP.md](ROADMAP.md).
- **Not a sandbox.** Verified bytes can still be malware. Knot makes substitution, corruption, and surprise install scripts difficult. It does not decide that JavaScript is trustworthy.
- **Not a publisher-identity system by default.** A matching content hash means the bytes are the bytes. It does not mean the publisher is who you think they are. See [attestations](docs/attestations.md) and [THREAT_MODEL.md](THREAT_MODEL.md).
- **Not lock-in.** `knot eject` writes conventional `package.json` + `node_modules/` where feasible. `knot migrate` reads existing lock metadata and never rewrites it.
- **Wrong bytes from a registry or MITM** Ã¢â‚¬â€ partial. npm `dist.integrity` is verified when present; HTTPS is used; a registry without integrity fails closed in strict mode when integrity is required. Source authenticity is still not publisher identity.
- **Corrupt local cache** Ã¢â‚¬â€ yes. Objects are re-hashed; corrupt objects are not executed.
- **Malicious lifecycle scripts** Ã¢â‚¬â€ yes by default. Denied unless allowlisted.
- **Lockfile tampering** Ã¢â‚¬â€ partial. `lockDigest` plus optional developer `lockSignature`.
- **Fake npm provenance** Ã¢â‚¬â€ partial. DSSE + subject binding are verified; publisher identity requires a pinned trusted root.
- **A compromised-but-intact package** Ã¢â‚¬â€ no. Verified bytes can still be malicious. Knot executes them if the developer declared the dependency.
- ES modules, `package.json` `exports` (including conditional and subpath exports)

---

## 3. Problem / opportunity

Teams evaluating Knot.js typically need either (a) a commercial right to run or embed it, or (b) outright ownership of the Product IP for strategic build-out. Public GitHub visibility without a proprietary license creates false assumptions about free production use. This brief and the linked data room make the commercial path explicit.

---

## 4. What ships today

Honest maturity: treat repository contents, README claims, tests, and release tags as the source of truth. Do not assume production customers, ARR, filed patents, or SLAs unless separately evidenced in diligence.

Typical transferable surfaces:

- Source tree and build/test scripts present in-repo
- Documentation and design notes
- Acquisition / diligence markdown under `docs/acquisition/`
- Branding assets committed to the repository (if any)

---

## 5. Demo / evaluation path (buyer)

Minimal path (no secrets required unless README says otherwise):

````
```bash
npm install -g @magnexis/knotjs
npm install @magnexis/knot.js-core
````

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

Extended evaluation: `docs/acquisition/BUYER_EVALUATION.md`. Written NDA / evaluation grants may be required for private materials.

---

## 6. What a transaction typically includes

Subject to definitive schedules:

| Included (typical) | Excluded (typical) |
|--------------------|--------------------|
| Repo materials + asserted original IP | Seller personal accounts / unrelated repos |
| Docs + diligence room at closing | Third-party dependency source under separate licenses |
| In-repo brand marks as assigned | Secrets without rotation plan |
| Know-how captured in docs | Fabricated revenue, user, or adoption metrics |

---

## 7. Suggested deal structures

| Structure | When it fits |
|-----------|--------------|
| Non-exclusive commercial license | Deploy/run under seat or environment terms |
| Exclusive field-of-use license | Buyer wants exclusivity; seller may retain entity |
| Asset / IP assignment | Buyer wants ownership of Materials outright |
| OEM / redistribution | Separate agreement â€” not implied here |

Commercial terms (price, earnouts, escrow) are negotiated under NDA with counsel.

---

## 8. Buyer diligence checklist

- [ ] Confirm Rightsholder identity and authority to sell/license
- [ ] Inventory Materials (`docs/acquisition/ASSET_INVENTORY.md`)
- [ ] Review IP posture (`IP_PROVENANCE.md`) and dependencies (`DEPENDENCY_INVENTORY.md`)
- [ ] Run evaluation script (`BUYER_EVALUATION.md`)
- [ ] Review risks (`RISK_REGISTER.md`)
- [ ] Agree transfer scope (`TRANSFER_MANIFEST.md`) and handoff (`HANDOFF_CHECKLIST.md`)
- [ ] Supersede root `LICENSE` at closing via definitive agreement

---

## 9. Related documents

| Document | Purpose |
|----------|---------|
| `LICENSE` | Proprietary â€” no default grant |
| `docs/acquisition/README.md` | Data-room index |
| `docs/acquisition/EXECUTIVE_SUMMARY.md` | One-page thesis |
| `README.md` | Product overview |
| `SECURITY.md` | Vulnerability reporting |
| `COMMERCIAL.md` | Licensing contact path |
| `.github/FUNDING.yml` | Sponsors / thanks.dev |

---

## 10. Disclaimer

This package is informational and **does not** create a binding offer, grant of rights, or investment advice. Engage counsel for any transaction.

---

*Document version: 2.0.0 / 2026-09-22 Â· Classification: acquisition briefing*
```
