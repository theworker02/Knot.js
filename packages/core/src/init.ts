import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { writeKnotToml } from "./manifest/project.js";

export async function initProject(cwd: string, options: { name?: string; example?: boolean } = {}): Promise<string[]> {
  const root = path.resolve(cwd);
  const name = options.name ?? path.basename(root);
  const created: string[] = [];
  const knotToml = path.join(root, "knot.toml");
  if (!existsSync(knotToml)) {
    await writeKnotToml(knotToml, {
      name,
      version: "0.1.0",
      runtime: "node",
      dependencies: {},
      mode: "lazy",
      integrity: "strict",
      offline: false,
      scripts: { default: "deny", allow: [] },
    });
    created.push("knot.toml");
  }
  const pkg = path.join(root, "package.json");
  if (!existsSync(pkg)) {
    await writeFile(
      pkg,
      JSON.stringify(
        {
          name,
          version: "0.1.0",
          private: true,
          type: "module",
        },
        null,
        2,
      ) + "\n",
    );
    created.push("package.json");
  }
  if (options.example !== false) {
    const src = path.join(root, "src");
    await mkdir(src, { recursive: true });
    const entry = path.join(src, "index.ts");
    if (!existsSync(entry)) {
      await writeFile(entry, `console.log("Knot.js is ready.");\n`);
      created.push("src/index.ts");
    }
  }
  return created;
}
