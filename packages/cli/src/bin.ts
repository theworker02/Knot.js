#!/usr/bin/env node
import { main } from "./index.js";

main(process.argv.slice(2)).catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "KNOT_ERROR";
  const message = error instanceof Error ? error.toString() : String(error);
  process.stderr.write(`${code}\n${message}\n`);
  process.exit(1);
});
