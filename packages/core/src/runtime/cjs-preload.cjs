"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const sessionPath = process.env.KNOT_SESSION;
if (!sessionPath || !fs.existsSync(sessionPath)) {
  return;
}

const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
const modules = session.modules ?? {};

function isBare(request) {
  return (
    Boolean(request) &&
    !request.startsWith(".") &&
    !request.startsWith("/") &&
    !path.isAbsolute(request) &&
    !request.startsWith("node:")
  );
}

const builtins = new Set(Module.builtinModules);

const original = Module._resolveFilename;
Module._resolveFilename = function knotResolveFilename(request, parent, isMain, options) {
  if (isBare(request) && modules[request]) {
    return modules[request];
  }
  if (isBare(request) && (builtins.has(request) || builtins.has(request.split("/")[0]))) {
    return original.call(this, request, parent, isMain, options);
  }
  if (isBare(request)) {
    const error = new Error(
      `KNOT_UNDECLARED_DEPENDENCY: Cannot require '${request}'. The package is not in the Knot session map.\nHint: declare it, then run with --prefetch or knot snapshot.`,
    );
    error.code = "KNOT_UNDECLARED_DEPENDENCY";
    throw error;
  }
  return original.call(this, request, parent, isMain, options);
};
