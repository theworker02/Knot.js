# Troubleshooting

| Symptom                   | Likely cause                        | Action                                                              |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| `KNOT_OFFLINE_MISSING`    | Object not in store                 | `knot snapshot` while online                                        |
| `KNOT_INTEGRITY_MISMATCH` | Bytes ≠ registry integrity          | Delete the object via `knot doctor --repair` and refetch            |
| `KNOT_OBJECT_CORRUPT`     | Cache mutation                      | `knot verify`, then repair                                          |
| `KNOT_SCRIPT_DENIED`      | Install script policy               | Allowlist only if you accept the script                             |
| `KNOT_LOCK_DRIFT`         | Frozen run vs range                 | Update the lock or drop `--frozen`                                  |
| `KNOT_LOCK_TAMPERED`      | `lockDigest` mismatch               | Restore `knot.lock` or regenerate it intentionally                  |
| `KNOT_LOCK_SIGNATURE`     | Missing/invalid developer signature | `knot lock sign` with the matching key                              |
| `KNOT_ATTESTATION`        | Provenance fetch/parse              | Inspect the registry attestation response; do not treat as identity |
| `KNOT_TYPESCRIPT`         | Old Node                            | Use Node 22.6+                                                      |
| `KNOT_STORE_LOCKED`       | Stale lockfile                      | `knot doctor --repair` after confirming no Knot process is running  |

`knot doctor` reports store permissions, orphaned temps, missing lock objects, and registry reachability.
