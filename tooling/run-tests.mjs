import { glob } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const roots = process.argv.slice(2);
const search = roots.length === 0 ? ["tests"] : roots;

const files = [];
for (const root of search) {
  const pattern = root.endsWith(".ts") ? root : path.posix.join(root.replaceAll("\\", "/"), "**/*.test.ts");
  for await (const file of glob(pattern)) {
    files.push(file);
  }
}
files.sort();
if (files.length === 0) {
  console.error(`No tests matched: ${search.join(", ")}`);
  process.exit(1);
}

const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
