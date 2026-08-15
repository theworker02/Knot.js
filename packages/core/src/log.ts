import type { KnotLogger, LogLevel, TraceKind } from "./types.js";

const LEVEL_RANK: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

function parseLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? "").trim().toLowerCase();
  if (
    value === "silent" ||
    value === "error" ||
    value === "warn" ||
    value === "info" ||
    value === "debug" ||
    value === "trace"
  ) {
    return value;
  }
  if (value === "1" || value === "true" || value === "verbose") {
    return "debug";
  }
  return "info";
}

function formatFields(fields?: Record<string, unknown>): string {
  if (!fields || Object.keys(fields).length === 0) {
    return "";
  }
  return (
    " " +
    Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ")
  );
}

export function createLogger(options?: { level?: LogLevel; name?: string }): KnotLogger {
  const envLevel = parseLevel(process.env.KNOT_LOG);
  const level = options?.level ?? envLevel;
  const write = (min: LogLevel, line: string): void => {
    if (LEVEL_RANK[level] < LEVEL_RANK[min]) {
      return;
    }
    const stream = min === "error" ? process.stderr : process.stderr;
    stream.write(line + "\n");
  };

  return {
    level,
    debug(message, fields) {
      write("debug", `DEBUG  ${message}${formatFields(fields)}`);
    },
    info(message, fields) {
      write("info", `INFO   ${message}${formatFields(fields)}`);
    },
    warn(message, fields) {
      write("warn", `WARN   ${message}${formatFields(fields)}`);
    },
    error(message, fields) {
      write("error", `ERROR  ${message}${formatFields(fields)}`);
    },
    event(kind: TraceKind, message, fields) {
      const min: LogLevel = kind === "CACHE" || kind === "LOAD" || kind === "OBJECT" ? "debug" : "info";
      write(min, `${kind.padEnd(8)} ${message}${formatFields(fields)}`);
    },
  };
}

export function padKind(kind: TraceKind): string {
  return kind.padEnd(8);
}
