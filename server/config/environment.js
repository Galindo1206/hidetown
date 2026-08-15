import dotenv from "dotenv";

dotenv.config({ quiet: true });

function readInteger(source, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER, required = false } = {}) {
  const rawValue = source[name]?.trim() || "";
  if (!rawValue && !required) return fallback;
  if (!/^\d+$/.test(rawValue)) throw new Error(`${name} debe ser un número entero entre ${min} y ${max}.`);
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} debe ser un número entero entre ${min} y ${max}.`);
  return value;
}

function readOrigins(value, { strict = false } = {}) {
  if (!value?.trim()) return [];
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  const invalid = origins.find((origin) => {
    try {
      const parsed = new URL(origin);
      return !["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin;
    } catch { return true; }
  });
  if (strict && invalid) throw new Error("ALLOWED_ORIGINS contiene un origen inválido. Usa orígenes completos separados por comas.");
  return origins.filter((origin) => {
    try {
      const parsed = new URL(origin);
      return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === origin;
    } catch { return false; }
  });
}

export function createEnvironment(source = process.env) {
  const rawNodeEnv = source.NODE_ENV?.trim() || "development";
  if (!["development", "test", "production"].includes(rawNodeEnv)) {
    throw new Error("NODE_ENV debe ser development, test o production.");
  }
  const nodeEnv = rawNodeEnv === "production" ? "production" : "development";
  const logLevel = source.LOG_LEVEL?.trim() || (nodeEnv === "production" ? "info" : "debug");
  if (!Object.hasOwn({ error: 1, warn: 1, info: 1, debug: 1 }, logLevel)) {
    throw new Error("LOG_LEVEL debe ser error, warn, info o debug.");
  }
  return Object.freeze({
    host: nodeEnv === "production" ? "0.0.0.0" : source.HOST?.trim() || "0.0.0.0",
    port: readInteger(source, "PORT", 3000, { max: 65535, required: nodeEnv === "production" }),
    reconnectGraceSeconds: readInteger(source, "RECONNECTION_GRACE_SECONDS", 30, { min: 5, max: 300 }),
    roomInactivityMinutes: readInteger(source, "ROOM_INACTIVITY_MINUTES", 60, { min: 5, max: 1_440 }),
    roomCleanupIntervalMinutes: readInteger(source, "ROOM_CLEANUP_INTERVAL_MINUTES", 5, { min: 1, max: 60 }),
    allowedOrigins: readOrigins(source.ALLOWED_ORIGINS, { strict: nodeEnv === "production" }),
    nodeEnv,
    logLevel,
    rateLimitWindowMs: readInteger(source, "RATE_LIMIT_WINDOW_MS", 10_000, { min: 1_000, max: 60_000 }),
    rateLimitMaxActions: readInteger(source, "RATE_LIMIT_MAX_ACTIONS", 8, { min: 1, max: 100 }),
    explorationDurationSeconds: readInteger(source, "EXPLORATION_DURATION_SECONDS", 60, { min: 30, max: 180 }),
    discussionDurationSeconds: readInteger(source, "DISCUSSION_DURATION_SECONDS", 240, { min: 30, max: 600 }),
    votingDurationSeconds: readInteger(source, "VOTING_DURATION_SECONDS", 60, { min: 15, max: 180 }),
    tiebreakerDurationSeconds: readInteger(source, "TIEBREAKER_DURATION_SECONDS", 30, { min: 10, max: 120 })
  });
}

export const environment = createEnvironment();
