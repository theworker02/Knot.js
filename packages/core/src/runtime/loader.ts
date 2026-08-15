import type { InitializeHook, LoadHook, ResolveHook } from "node:module";
import { isBareSpecifier, isPackageImportsSpecifier } from "../registry/specifier.js";
import { createLogger } from "../log.js";
import { RuntimeSession, type RuntimeSessionData } from "./session.js";

let sessionPromise: Promise<RuntimeSession> | undefined;
let logger = createLogger();

export const initialize: InitializeHook<RuntimeSessionData> = (data) => {
  const options = data ?? {
    cwd: process.env.KNOT_PROJECT ?? process.cwd(),
    storeDir: process.env.KNOT_STORE ?? "",
    offline: process.env.KNOT_OFFLINE === "1",
    frozen: process.env.KNOT_FROZEN === "1",
    registryUrl: process.env.KNOT_REGISTRY,
  };
  if (options.logLevel) {
    process.env.KNOT_LOG = options.logLevel;
    logger = createLogger({ level: options.logLevel as never });
  }
  sessionPromise = RuntimeSession.open({
    cwd: options.cwd,
    storeDir: options.storeDir || undefined,
    registryUrl: options.registryUrl,
    offline: options.offline,
    frozen: options.frozen,
    logger,
  });
};

async function session(): Promise<RuntimeSession> {
  if (!sessionPromise) {
    initialize({
      cwd: process.env.KNOT_PROJECT ?? process.cwd(),
      storeDir: process.env.KNOT_STORE ?? "",
      offline: process.env.KNOT_OFFLINE === "1",
      frozen: process.env.KNOT_FROZEN === "1",
      registryUrl: process.env.KNOT_REGISTRY,
    });
  }
  return sessionPromise!;
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (!isBareSpecifier(specifier) && !isPackageImportsSpecifier(specifier)) {
    return nextResolve(specifier, context);
  }
  try {
    const runtime = await session();
    const url = await runtime.resolveFileUrl(specifier, {
      parentURL: context.parentURL,
      conditions: context.conditions,
    });
    logger.event("LOAD", specifier, { url, parent: context.parentURL });
    return { url, shortCircuit: true };
  } catch (error) {
    if (context.parentURL) {
      throw error;
    }
    return nextResolve(specifier, context);
  }
};

export const load: LoadHook = async (url, context, nextLoad) => {
  return nextLoad(url, context);
};
