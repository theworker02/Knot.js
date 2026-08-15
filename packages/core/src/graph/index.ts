import type { DependencyGraph, GraphNode, ProjectConfig } from "../types.js";
import { ContentStore } from "../store/index.js";
import { findLockPackage, type KnotLockfile } from "../lockfile/index.js";

export async function buildGraph(
  project: ProjectConfig,
  lock: KnotLockfile,
  store: ContentStore,
): Promise<DependencyGraph> {
  const nodes: Record<string, GraphNode> = {};
  const rootId = `${project.name}@${project.version}`;
  nodes[rootId] = {
    id: rootId,
    name: project.name,
    version: project.version,
    requestedRange: project.version,
    source: "workspace",
    dependencies: Object.entries(project.dependencies).map(([name, range]) => {
      const locked = findLockPackage(lock, name, range);
      return locked ? `${locked.name}@${locked.version}` : name;
    }),
    optional: false,
    dev: false,
    peer: false,
    cached: true,
    verified: true,
  };

  for (const pkg of lock.packages) {
    const id = `${pkg.name}@${pkg.version}`;
    const cached = Boolean(pkg.object && (await store.has(pkg.object)));
    let verified = false;
    if (cached && pkg.object) {
      try {
        await store.verifyObject(pkg.object);
        verified = true;
      } catch {
        verified = false;
      }
    }
    nodes[id] = {
      id,
      name: pkg.name,
      version: pkg.version,
      requestedRange: pkg.requested ?? pkg.version,
      integrity: pkg.integrity,
      object: pkg.object,
      source: pkg.source,
      dependencies: Object.entries(pkg.dependencies ?? {}).map(([name, range]) => {
        const locked = findLockPackage(lock, name, range);
        return locked ? `${locked.name}@${locked.version}` : `${name}@${range}`;
      }),
      optional: false,
      dev: false,
      peer: false,
      cached: pkg.source === "workspace" ? true : cached,
      verified: pkg.source === "workspace" ? true : verified,
    };
  }

  return { root: rootId, nodes };
}

export function formatGraphText(graph: DependencyGraph): string {
  const lines = [graph.root];
  const root = graph.nodes[graph.root];
  const deps = root?.dependencies ?? [];
  deps.forEach((id, index) => {
    const last = index === deps.length - 1;
    walk(graph, id, "", last, lines, new Set([graph.root]));
  });
  return lines.join("\n");
}

function walk(
  graph: DependencyGraph,
  id: string,
  prefix: string,
  last: boolean,
  lines: string[],
  seen: Set<string>,
): void {
  const branch = last ? "└── " : "├── ";
  const node = graph.nodes[id];
  const label = node ? `${node.name}@${node.version}` : id;
  lines.push(`${prefix}${branch}${label}`);
  if (!node || seen.has(id)) {
    return;
  }
  seen.add(id);
  const nextPrefix = prefix + (last ? "    " : "│   ");
  node.dependencies.forEach((child, index) => {
    walk(graph, child, nextPrefix, index === node.dependencies.length - 1, lines, seen);
  });
}

export function formatGraphDot(graph: DependencyGraph): string {
  const lines = ["digraph knot {", '  rankdir="LR";'];
  for (const node of Object.values(graph.nodes)) {
    lines.push(`  "${node.id}" [label="${node.name}@${node.version}"];`);
    for (const dep of node.dependencies) {
      lines.push(`  "${node.id}" -> "${dep}";`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}
