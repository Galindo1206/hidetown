import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("la Fase 8 carga estilos y audio locales sin recursos remotos", async () => {
  const html = await read("index.html");
  assert.match(html, /js\/audioManager\.js/);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  assert.match(html, /En este pueblo, no todos son quienes dicen ser\./);
});

test("el sistema visual centraliza tokens, capas y superficies", async () => {
  const variables = await read("css/variables.css");
  for (const token of ["--color-night-950", "--color-mist", "--color-paper", "--surface-glass", "--font-display", "--space-4", "--radius-md", "--layer-dialog", "--ease-out"]) {
    assert.ok(variables.includes(token), `Falta el token ${token}`);
  }
});

test("responsive contempla ancho mínimo, altura dinámica, movimiento reducido y contraste", async () => {
  const [base, responsive] = await Promise.all([read("css/base.css"), read("css/responsive.css")]);
  assert.match(base, /min-width:\s*20rem/);
  assert.match(responsive, /100svh/);
  assert.match(responsive, /prefers-reduced-motion:\s*reduce/);
  assert.match(responsive, /forced-colors:\s*active/);
  assert.match(responsive, /env\(safe-area-inset-bottom\)/);
});

test("audio requiere interacción, persiste silencio y libera recursos", async () => {
  const source = await read("js/audioManager.js");
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(source, /userGesture/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /context\.close\(\)/);
  for (const cue of ["bell", "clue", "warning", "vote", "village", "creature"]) assert.ok(source.includes(`${cue}:`));
});

test("roles, pistas y votos reciben indicadores adicionales al color", async () => {
  const [app, components] = await Promise.all([read("js/app.js"), read("css/components.css")]);
  assert.match(app, /candidate-choice__selected/);
  assert.match(app, /clue-card__icon/);
  assert.match(app, /result-role-card__symbol/);
  assert.match(components, /input:checked \+ label \.candidate-choice__selected/);
  assert.match(components, /data-clue-type="fragment"/);
});

test("el mapa de exploración conserva controles accesibles, recuperación y adaptación móvil", async () => {
  const [html, app, game, preload, components] = await Promise.all([
    read("index.html"), read("js/app.js"), read("js/game/explorationGame.js"),
    read("js/game/scenes/PreloadScene.js"), read("css/components.css")
  ]);
  assert.match(html, /id="exploration-timer" role="timer"/);
  assert.match(html, /id="exploration-canvas" aria-label=/);
  assert.match(html, /id="virtual-joystick" role="group"/);
  assert.match(html, /id="open-exploration-notebook"/);
  assert.match(html, /id="exploration-loading-retry"[^>]*>Reintentar</);
  assert.match(app, /function mountExplorationGame\(state\)/);
  assert.match(app, /multiplayer\.on\("exploration-state"[\s\S]*mountExplorationGame/);
  assert.match(app, /multiplayer\.on\("restored"[\s\S]*mountExplorationGame/);
  assert.match(game, /if \(this\.instance\) return this\.sync\(room\)/);
  assert.match(game, /LOAD_TIMEOUT_MS = 12_000/);
  assert.match(preload, /loaderror/);
  assert.match(preload, /createCanvas\(file\.key/);
  assert.match(preload, /essentialLoadFailed/);
  assert.match(app, /hidetown:move/);
  assert.match(app, /announce\(threshold === 5/);
  assert.match(components, /@media \(max-width: 700px\)/);
  assert.match(components, /\.virtual-joystick \{ display: grid; \}/);
});
