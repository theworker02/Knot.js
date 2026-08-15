# Benchmarks

This suite measures Knot on the current machine. It does **not** invent npm/pnpm comparison numbers.

To compare against `npm install`, `npm ci`, and `pnpm install`, run those tools on the same fixture with `/usr/bin/time` or `Measure-Command` and record the host, Node version, and date beside the results.

## Methodology

Workloads:

- tiny application (hello-world)
- TypeScript entry
- store put/get of a 1 MiB object
- concurrent identical puts

Metrics:

- cold startup of `knot run` on a no-dependency app
- warm startup (second run)
- object insert time
- cache hit time
- process CPU is left to the OS time tool

Results generated locally belong in `benchmarks/results/local/` and are gitignored. Checked-in results must include hardware and must be produced by `npm run bench`.
