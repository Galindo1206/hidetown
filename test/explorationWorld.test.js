import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERACTION_DISTANCE,
  PLAYER_SPEED,
  canInteract,
  createExplorationPosition,
  explorationScenes,
  getExplorationScene,
  isPositionInsideScene,
  resolveTransition,
  toPublicExplorationWorld,
  validateMovement,
  zoneForPosition
} from "../server/game/explorationWorld.js";

test("define aldea compacta, tres interiores y contrato público sin secretos", () => {
  assert.deepEqual(explorationScenes.map((scene) => scene.id), ["village", "church", "caretaker-house", "bell-tower"]);
  assert.equal(getExplorationScene("village").width / 64, 25);
  assert.equal(getExplorationScene("village").height / 64, 18);
  const worldJson = JSON.stringify(toPublicExplorationWorld());
  assert.doesNotMatch(worldJson, /truth|distortion|analysis|role|clue/);
  assert.equal(PLAYER_SPEED, 220);
  assert.equal(INTERACTION_DISTANCE, 92);
});

test("valida frecuencia, límites, colisiones y velocidad sin aceptar teletransportes", () => {
  const start = createExplorationPosition();
  assert.equal(validateMovement(start, { ...start, x: 805, isMoving: true }, 80).valid, true);
  assert.equal(validateMovement(start, { ...start, x: 805, isMoving: true }, 20).code, "RATE_LIMITED");
  assert.equal(validateMovement(start, { ...start, x: 1200, isMoving: true }, 80).code, "MOVEMENT_TOO_FAST");
  assert.equal(validateMovement(start, { ...start, x: -1, isMoving: true }, 80).code, "POSITION_OUT_OF_BOUNDS");
  assert.equal(validateMovement(start, { ...start, sceneId: "church", isMoving: true }, 80).code, "INVALID_SCENE");
  assert.equal(isPositionInsideScene(getExplorationScene("village"), 700, 120), false);
});

test("solo permite puertas próximas y devuelve un punto válido de entrada y salida", () => {
  assert.equal(resolveTransition(createExplorationPosition(), "church"), null);
  const church = resolveTransition({ sceneId: "village", x: 800, y: 300 }, "church");
  assert.equal(church.sceneId, "church");
  assert.equal(isPositionInsideScene(getExplorationScene("church"), church.x, church.y), true);
  const outside = resolveTransition({ sceneId: "church", x: 448, y: 570 }, "village");
  assert.equal(outside.sceneId, "village");
  assert.equal(zoneForPosition(outside), "square");
  assert.equal(resolveTransition({ sceneId: "village", x: 800, y: 300 }, "missing"), null);
});

test("la interacción usa escena y distancia definitiva del servidor", () => {
  assert.equal(canInteract({ sceneId: "village", x: 770, y: 680 }, "mud-prints"), true);
  assert.equal(canInteract({ sceneId: "village", x: 800, y: 690 }, "ash-remains"), false);
  assert.equal(canInteract({ sceneId: "church", x: 105, y: 355 }, "western-window"), true);
  assert.equal(canInteract({ sceneId: "village", x: 105, y: 355 }, "western-window"), false);
  assert.equal(canInteract({ sceneId: "church", x: 105, y: 355 }, "missing"), false);
});
