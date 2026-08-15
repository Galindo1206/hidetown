import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import express from "express";
import { Server } from "socket.io";
import { environment } from "./config/environment.js";
import { RoomService } from "./services/roomService.js";
import { RateLimiter } from "./utils/rateLimiter.js";
import { registerConnectionHandlers } from "./socket/connectionHandlers.js";
import { toPublicError } from "./utils/errors.js";
import { createLogger } from "./utils/logger.js";
import { PUBLIC_VERSION } from "./config/version.js";

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(serverDirectory, "..");

export function createGameServer({ config = environment, logger = createLogger({ level: config.logLevel }) } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const socketOptions = {
    serveClient: true,
    maxHttpBufferSize: 10_000,
    transports: ["polling", "websocket"]
  };
  if (config.allowedOrigins?.length) socketOptions.cors = { origin: config.allowedOrigins, methods: ["GET", "POST"] };
  socketOptions.allowRequest = (request, callback) => {
    const origin = request.headers.origin;
    if (!origin) return callback(null, true);
    let sameOrigin = false;
    try { sameOrigin = new URL(origin).host === request.headers.host; }
    catch { return callback(null, false); }
    const accepted = sameOrigin || config.allowedOrigins?.includes(origin);
    if (!accepted) logger.warn?.("socket_origin_rejected", { hasOrigin: true });
    return callback(null, accepted);
  };
  const io = new Server(httpServer, socketOptions);
  const reconnectGraceMs = config.reconnectGraceSeconds !== undefined
    ? config.reconnectGraceSeconds * 1_000
    : config.reconnectGraceMs ?? 30_000;
  const roomService = new RoomService({
    reconnectGraceMs,
    roomInactivityMs: (config.roomInactivityMinutes ?? 60) * 60_000,
    explorationDurationMs: (config.explorationDurationSeconds ?? 90) * 1_000,
    explorationReadyTimeoutMs: config.explorationReadyTimeoutMs ?? 30_000,
    explorationSearchMs: config.explorationSearchMs ?? 3_000,
    explorationFinishedDelayMs: config.explorationFinishedDelayMs ?? 1_200,
    discussionDurationMs: (config.discussionDurationSeconds ?? 240) * 1_000,
    reconstructionRequiredScore: config.reconstructionRequiredScore ?? 4,
    votingDurationMs: (config.votingDurationSeconds ?? 60) * 1_000,
    tiebreakerDurationMs: (config.tiebreakerDurationSeconds ?? 30) * 1_000,
    discussionFinishedDelayMs: config.discussionFinishedDelayMs ?? 900,
    votingStartDelayMs: config.votingStartDelayMs ?? 1_200,
    resultRevealDelayMs: config.resultRevealDelayMs ?? 700,
    voteRequestCooldownMs: config.voteRequestCooldownMs ?? 250
  });
  const rateLimiter = new RateLimiter({
    windowMs: config.rateLimitWindowMs,
    maxActions: config.rateLimitMaxActions
  });
  const actionRateLimiter = new RateLimiter({
    windowMs: config.rateLimitWindowMs,
    maxActions: (config.rateLimitMaxActions ?? 8) * 8
  });
  const cleanupIntervalMs = (config.roomCleanupIntervalMinutes ?? 5) * 60_000;
  let cleanupTimer = null;
  let stopped = false;

  app.disable("x-powered-by");
  if (config.nodeEnv === "production") app.set("trust proxy", 1);
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:"
    );
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (config.nodeEnv === "production" && request.secure) {
      response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.get("/health", (request, response) => {
    logger.debug?.("health_check", { status: "ok" });
    response.setHeader("Cache-Control", "no-store");
    response.json({ status: "ok", version: PUBLIC_VERSION });
  });
  const staticOptions = { index: false, fallthrough: false, etag: true, maxAge: "1h" };
  app.use("/css", express.static(join(projectRoot, "css"), staticOptions));
  app.use("/js", express.static(join(projectRoot, "js"), staticOptions));
  app.use("/assets", express.static(join(projectRoot, "assets"), { ...staticOptions, maxAge: "1d" }));
  app.get("/vendor/phaser.js", (request, response) => response.sendFile(join(projectRoot, "node_modules", "phaser", "dist", "phaser.min.js")));
  app.get("/", (request, response) => {
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    response.sendFile(join(projectRoot, "index.html"));
  });
  app.use((request, response) => response.status(404).json({
    error: { code: "RESOURCE_NOT_FOUND", message: "El recurso solicitado no existe.", recoverable: true }
  }));
  app.use((error, request, response, next) => {
    logger.error?.("http_request_failed", { method: request.method, path: request.path, errorName: error?.name || "Error" });
    if (response.headersSent) return next(error);
    return response.status(500).json({ error: toPublicError(error) });
  });

  registerConnectionHandlers({ io, roomService, rateLimiter, actionRateLimiter, logger });

  async function start({ port = config.port, host = config.host } = {}) {
    await new Promise((resolveStart, rejectStart) => {
      httpServer.once("error", rejectStart);
      httpServer.listen(port, host, () => {
        httpServer.off("error", rejectStart);
        resolveStart();
      });
    });
    cleanupTimer = setInterval(() => {
      roomService.cleanupInactiveRooms(() => logger.info?.("room_removed", { reason: "inactivity" }));
      rateLimiter.cleanup();
      actionRateLimiter.cleanup();
    }, cleanupIntervalMs);
    cleanupTimer.unref?.();
    return httpServer.address();
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = null;
    roomService.clear();
    rateLimiter.clear();
    actionRateLimiter.clear();
    await new Promise((resolveStop) => io.close(resolveStop));
  }

  return { app, httpServer, io, roomService, start, stop };
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  const logger = createLogger({ level: environment.logLevel });
  const gameServer = createGameServer({ logger });
  gameServer.start().then(() => {
    const address = gameServer.httpServer.address();
    logger.info("server_started", { host: environment.host, port: address.port, environment: environment.nodeEnv, version: PUBLIC_VERSION });
  }).catch((error) => {
    logger.error("server_start_failed", { errorName: error?.name || "Error" });
    process.exitCode = 1;
  });
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("server_shutdown", { signal });
    try {
      await gameServer.stop();
      logger.info("server_stopped", { signal });
    } catch (error) { logger.error("server_shutdown_failed", { errorName: error?.name || "Error" }); }
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("uncaughtException", (error) => {
    logger.error("uncaught_exception", { errorName: error?.name || "Error" });
    process.exitCode = 1;
    shutdown("uncaughtException");
  });
  process.once("unhandledRejection", (reason) => {
    logger.error("unhandled_rejection", { errorName: reason?.name || "Error" });
    process.exitCode = 1;
    shutdown("unhandledRejection");
  });
}
