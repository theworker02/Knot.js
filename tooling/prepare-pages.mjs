import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const websiteDir = path.join(root, "website");
const brandingDir = path.join(root, "branding");
const distDir = path.join(websiteDir, "dist");
const requiredBranding = ["logo.png", "logo-mark.png", "favicon.png", "favicon.svg"];

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const name of readdirSync(websiteDir)) {
  if (name === "dist") {
    continue;
  }
  cpSync(path.join(websiteDir, name), path.join(distDir, name), { recursive: true });
}

cpSync(brandingDir, path.join(distDir, "branding"), { recursive: true });

const htmlPath = path.join(distDir, "index.html");
const html = readFileSync(htmlPath, "utf8")
  .replaceAll("../branding/", "./branding/")
  .replaceAll("../docs/", "https://github.com/theworker02/Knot.js/blob/main/docs/");
writeFileSync(htmlPath, html);
writeFileSync(path.join(distDir, ".nojekyll"), "");

const missing = requiredBranding.filter((file) => !existsSync(path.join(distDir, "branding", file)));
if (missing.length) {
  console.error("Missing branding assets in pages artifact:\n" + missing.map((file) => `  ${file}`).join("\n"));
  process.exit(1);
}

console.log("pages artifact ready at website/dist");
