import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEnvironment } from "../server/config/environment.js";
import { createGameServer } from "../server/server.js";
import { createLogger } from "../server/utils/logger.js";

const baseConfig = {
  host: "127.0.0.1",
  port: 0,
  nodeEnv: "production",
  logLevel: "error",
  allowedOrigins: [],
  reconnectGraceSeconds: 30,
  roomInactivityMinutes: 60,
  roomCleanupIntervalMinutes: 5,
  rateLimitWindowMs: 1_000,
  rateLimitMaxActions: 20
};

test("producción exige PORT válido y rechaza orígenes o niveles inválidos", () => {
  assert.throws(() => createEnvironment({ NODE_ENV: "production" }), /PORT/);
  assert.throws(() => createEnvironment({ NODE_ENV: "production", PORT: "abc" }), /PORT/);
  assert.throws(() => createEnvironment({ NODE_ENV: "production", PORT: "3000", LOG_LEVEL: "verbose" }), /LOG_LEVEL/);
  assert.throws(() => createEnvironment({ NODE_ENV: "staging", PORT: "3000" }), /NODE_ENV/);
  assert.throws(() => createEnvironment({ NODE_ENV: "production", PORT: "3000", ALLOWED_ORIGINS: "ejemplo.com" }), /ALLOWED_ORIGINS/);
  const config = createEnvironment({ NODE_ENV: "production", PORT: "10000", ALLOWED_ORIGINS: "https://pueblo.example" });
  assert.equal(config.reconstructionRequiredScore, 4);
  assert.equal(createEnvironment({ RECONSTRUCTION_REQUIRED_SCORE: "3" }).reconstructionRequiredScore, 3);
  assert.throws(() => createEnvironment({ RECONSTRUCTION_REQUIRED_SCORE: "0" }), /RECONSTRUCTION_REQUIRED_SCORE/);
  assert.throws(() => createEnvironment({ RECONSTRUCTION_REQUIRED_SCORE: "6" }), /RECONSTRUCTION_REQUIRED_SCORE/);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 10_000);
  assert.deepEqual(config.allowedOrigins, ["https://pueblo.example"]);
});

test("cliente usa mismo origen y el reporte técnico limita sus campos", async () => {
  const [client, app] = await Promise.all([
    readFile(new URL("../js/multiplayer.js", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8")
  ]);
  assert.match(client, /window\.io\(\{/);
  assert.doesNotMatch(client, /https?:\/\/(?:localhost|127\.0\.0\.1)/);
  const reportBody = app.slice(app.indexOf("async function copySafeReport"), app.indexOf("function hideConnectionAlert"));
  assert.match(reportBody, /Versión:|Etapa:|Navegador:|Fecha:|Código de error público:/);
  assert.doesNotMatch(reportBody, /roomCode|reconnectToken|chatMessages|privateRole|privateClues|hasVoted/);
});

test("servidor de producción publica salud mínima, caché segura y cabeceras de proxy HTTPS", async (context) => {
  const server = createGameServer({ config: baseConfig, logger: createLogger({ level: "error", output: {} }) });
  await server.start({ host: "127.0.0.1", port: 0 });
  context.after(() => server.stop());
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;

  server.roomService.createRoom("Inti", "private-socket");
  const health = await fetch(`${origin}/health`);
  const serializedHealth = JSON.stringify(await health.json());
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.deepEqual(JSON.parse(serializedHealth), { status: "ok", version: "0.9.0-beta.1" });
  assert.doesNotMatch(serializedHealth, /rooms|Inti|private-socket/);

  const html = await fetch(`${origin}/`, { headers: { "X-Forwarded-Proto": "https" } });
  assert.match(html.headers.get("content-type"), /^text\/html/);
  assert.match(html.headers.get("cache-control"), /no-store/);
  assert.match(html.headers.get("strict-transport-security"), /max-age=31536000/);
  assert.equal(html.headers.get("x-powered-by"), null);

  const script = await fetch(`${origin}/js/multiplayer.js`);
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.match(script.headers.get("cache-control"), /max-age=3600/);
  assert.match(await script.text(), /window\.io\(/);

  const phaser = await fetch(`${origin}/vendor/phaser.js`);
  assert.equal(phaser.status, 200);
  assert.match(phaser.headers.get("content-type"), /javascript/);
  assert.ok(Number(phaser.headers.get("content-length")) > 1_000_000);

  const favicon = await fetch(`${origin}/assets/icons/favicon.svg`);
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get("content-type"), /image\/svg\+xml/);

  const socketHandshake = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`);
  assert.equal(socketHandshake.status, 200);
  assert.match(await socketHandshake.text(), /^0\{/);

  for (const privatePath of ["/.env", "/server/server.js", "/test/production.test.js", "/package.json", "/docs/DEPLOY_RENDER.md"]) {
    const privateResponse = await fetch(`${origin}${privatePath}`);
    assert.equal(privateResponse.status, 404, privatePath);
  }
});

test("desarrollo limita Socket.IO al mismo origen o lista explícita", async (context) => {
  const server = createGameServer({ config: { ...baseConfig, nodeEnv: "development", allowedOrigins: ["https://amigos.example"] }, logger: createLogger({ level: "error", output: {} }) });
  await server.start({ host: "127.0.0.1", port: 0 });
  context.after(() => server.stop());
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const sameOrigin = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: origin } });
  const allowed = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: "https://amigos.example" } });
  const rejected = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: "https://intruso.example" } });
  assert.equal(sameOrigin.status, 200);
  assert.equal(allowed.status, 200);
  assert.equal(rejected.status, 403);
});

test("logger estructurado respeta nivel y no incorpora metadatos complejos", () => {
  const lines = [];
  const logger = createLogger({ level: "info", output: { log: (line) => lines.push(line), error: (line) => lines.push(line) } });
  logger.debug("ignored", { token: "never-written" });
  logger.info("room_created", { players: 3, payload: { secret: true } });
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(lines[0])).sort(), ["event", "level", "players", "timestamp"]);
});
