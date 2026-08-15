import { createEnvironment } from "../server/config/environment.js";
import { createGameServer } from "../server/server.js";
import { createLogger } from "../server/utils/logger.js";

const config = createEnvironment({
  NODE_ENV: "production",
  PORT: process.env.SMOKE_PORT || "3000",
  LOG_LEVEL: "error",
  ALLOWED_ORIGINS: ""
});
const server = createGameServer({ config, logger: createLogger({ level: "error" }) });
const checks = {};

try {
  await server.start({ host: "127.0.0.1", port: 0 });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const routes = [
    ["root", "/", 200],
    ["health", "/health", 200],
    ["css", "/css/base.css", 200],
    ["javascript", "/js/app.js", 200],
    ["phaser", "/vendor/phaser.js", 200],
    ["favicon", "/assets/icons/favicon.svg", 200],
    ["socketIo", "/socket.io/?EIO=4&transport=polling", 200],
    ["privateEnv", "/.env", 404],
    ["privateServer", "/server/server.js", 404],
    ["privateTests", "/test/production.test.js", 404]
  ];
  for (const [name, path, expected] of routes) {
    const response = await fetch(`${origin}${path}`);
    checks[name] = response.status;
    if (response.status !== expected) throw new Error(`${name} respondió ${response.status}; se esperaba ${expected}.`);
    if (name === "health") {
      const body = await response.json();
      if (body.status !== "ok") throw new Error("El health check no devolvió estado ok.");
      checks.version = body.version;
    } else await response.body?.cancel();
  }
} finally {
  await server.stop();
}

process.stdout.write(`${JSON.stringify({ ok: true, checks })}\n`);
