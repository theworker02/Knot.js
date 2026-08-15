import { createServer, type Server } from "node:http";
import { createNpmTarball, type FixturePackage } from "./tarball.ts";

export interface MockPackage extends FixturePackage {
  tarball?: { bytes: Buffer; integrity: string; sha256: string };
}

export async function startMockRegistry(packages: MockPackage[]): Promise<{
  url: string;
  close(): Promise<void>;
  packages: Map<string, MockPackage[]>;
}> {
  const map = new Map<string, MockPackage[]>();
  for (const pkg of packages) {
    pkg.tarball ??= await createNpmTarball(pkg);
    const list = map.get(pkg.name) ?? [];
    list.push(pkg);
    map.set(pkg.name, list);
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith(".tgz")) {
      const file = pathname.split("/").pop() ?? "";
      for (const versions of map.values()) {
        const pkg = versions.find((item) => file === `${item.name.split("/").pop()}-${item.version}.tgz`);
        if (pkg?.tarball) {
          res.setHeader("content-type", "application/octet-stream");
          res.end(pkg.tarball.bytes);
          return;
        }
      }
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const name = pathname.slice(1).replace(/%2f/gi, "/");
    const versions = map.get(name);
    if (!versions?.length) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    const latest = versions[versions.length - 1]!;
    const versionMap: Record<string, unknown> = {};
    for (const pkg of versions) {
      versionMap[pkg.version] = {
        name: pkg.name,
        version: pkg.version,
        dist: {
          tarball: `http://127.0.0.1:${addressPort(server)}/${encodeURIComponent(pkg.name)}/-/${pkg.name.split("/").pop()}-${pkg.version}.tgz`,
          integrity: pkg.tarball?.integrity,
        },
        dependencies: pkg.dependencies ?? {},
        ...(pkg.omitExports ? {} : { exports: pkg.exports ?? { ".": "./index.js" } }),
        imports: pkg.imports,
        type: pkg.type ?? "module",
        main: pkg.main ?? "index.js",
        scripts: pkg.scripts,
      };
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        name,
        "dist-tags": { latest: latest.version },
        versions: versionMap,
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${addressPort(server)}`,
    packages: map,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

function addressPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server has no port");
  }
  return address.port;
}
