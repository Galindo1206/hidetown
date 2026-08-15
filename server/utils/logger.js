const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) =>
    value === null || ["string", "number", "boolean"].includes(typeof value)
  ));
}

export function createLogger({ level = "info", output = console } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(logLevel, event, metadata) {
    if (LEVELS[logLevel] > threshold) return;
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: logLevel,
      event,
      ...normalizeMetadata(metadata)
    });
    const method = logLevel === "error" ? "error" : logLevel === "warn" ? "warn" : "log";
    output[method]?.(record);
  }

  return Object.freeze({
    error: (event, metadata) => write("error", event, metadata),
    warn: (event, metadata) => write("warn", event, metadata),
    info: (event, metadata) => write("info", event, metadata),
    debug: (event, metadata) => write("debug", event, metadata),
    log: (event, metadata) => write("info", event, metadata)
  });
}

