# Resolution

Resolution is **parent-aware**.

When `parent-pkg` imports `child-pkg`, Knot uses `parent-pkg`'s declared range — not the application’s dependency list and not a hoisted `node_modules` tree.

```text
app
 └── parent-pkg@1.0.0
      └── child-pkg@^1.0.0   ← range comes from parent-pkg
```

If a package imports a name it did not declare (and that is not an optional or peer dependency), Knot fails with `KNOT_UNDECLARED_DEPENDENCY`. That is intentional. Silent hoisting is how undeclared dependencies become production incidents.

The first source is `knot.lock`, which may contain **more than one version** of the same name when ranges require it. If a range still satisfies a locked version, Knot reuses it.

Otherwise the configured `PackageSource` (npm today) selects a version with semver, records integrity, and fetches the tarball.

```ts
interface PackageSource {
  resolve(specifier: PackageSpecifier): Promise<Resolution>;
  fetch(resolution: Resolution): Promise<Artifact>;
}
```

`workspace:` ranges never hit the registry. See [workspaces](workspaces.md).

`#` specifiers never hit the registry directly. See [imports](imports.md).
