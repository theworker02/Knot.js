import assert from "node:assert/strict";
import { test } from "node:test";
import { scanSource } from "../../packages/core/src/runtime/prefetch.ts";

test("scans static imports and ignores relative files", () => {
  const scanned = scanSource(`
    import { z } from "zod";
    import express from "express";
    import { serve } from "hono/node-server";
    import { local } from "./util.js";
    require("left-pad");
  `);
  assert.deepEqual(scanned.packages.sort(), ["express", "hono", "left-pad", "zod"]);
  assert.ok(!scanned.specifiers.includes("./util.js"));
});
