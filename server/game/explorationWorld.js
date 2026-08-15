import { getExplorationObject } from "./explorationDefinitions.js";

export const TILE_SIZE = 64;
export const PLAYER_SPEED = 220;
export const POSITION_UPDATE_MIN_MS = 60;
export const INTERACTION_DISTANCE = 92;
export const TRANSITION_DISTANCE = 104;

const scene = (id, name, width, height, spawn, objects, transitions, obstacles = []) => Object.freeze({
  id, name, width, height, spawn: Object.freeze(spawn),
  objects: Object.freeze(objects.map(Object.freeze)),
  transitions: Object.freeze(transitions.map(Object.freeze)),
  obstacles: Object.freeze(obstacles.map(Object.freeze))
});

export const explorationScenes = Object.freeze([
  scene("village", "San Jerónimo", 1600, 1152, { x: 800, y: 690, direction: "down" }, [
    { id: "mud-prints", x: 770, y: 610 }, { id: "fountain", x: 850, y: 545 },
    { id: "old-post", x: 1030, y: 650 }, { id: "western-window", x: 500, y: 310 },
    { id: "mud-trail", x: 410, y: 630 }, { id: "ash-remains", x: 300, y: 760 }
  ], [
    { id: "church-door", label: "Entrar a la iglesia", x: 800, y: 300, targetSceneId: "church", targetX: 448, targetY: 535 },
    { id: "caretaker-door", label: "Entrar a la casa", x: 1240, y: 500, targetSceneId: "caretaker-house", targetX: 448, targetY: 535 },
    { id: "tower-door", label: "Entrar al campanario", x: 1265, y: 245, targetSceneId: "bell-tower", targetX: 448, targetY: 535 }
  ], [
    { x: 650, y: 80, width: 300, height: 180 },
    { x: 1120, y: 90, width: 280, height: 120 },
    { x: 1120, y: 330, width: 280, height: 125 },
    { x: 80, y: 120, width: 270, height: 160 },
    { x: 80, y: 850, width: 360, height: 160 },
    { x: 1180, y: 820, width: 300, height: 170 }
  ]),
  scene("church", "Iglesia", 896, 640, { x: 448, y: 535, direction: "up" }, [
    { id: "bell-rope", x: 220, y: 190 }, { id: "altar", x: 448, y: 125 },
    { id: "candles", x: 590, y: 165 }, { id: "western-window", x: 105, y: 285 }
  ], [{ id: "church-exit", label: "Salir a la plaza", x: 448, y: 570, targetSceneId: "village", targetX: 800, targetY: 355 }], [
    { x: 300, y: 65, width: 296, height: 75 }, { x: 55, y: 55, width: 35, height: 500 }, { x: 806, y: 55, width: 35, height: 500 }
  ]),
  scene("caretaker-house", "Casa del cuidador", 896, 640, { x: 448, y: 535, direction: "up" }, [
    { id: "locked-chest", x: 190, y: 155 }, { id: "caretaker-diary", x: 500, y: 325 },
    { id: "old-key", x: 620, y: 330 }
  ], [{ id: "caretaker-exit", label: "Salir a la plaza", x: 448, y: 570, targetSceneId: "village", targetX: 1240, targetY: 570 }], [
    { x: 80, y: 75, width: 260, height: 105 }, { x: 530, y: 70, width: 230, height: 115 }, { x: 335, y: 190, width: 245, height: 90 }
  ]),
  scene("bell-tower", "Campanario", 896, 640, { x: 448, y: 535, direction: "up" }, [
    { id: "stopped-clock", x: 448, y: 175 }, { id: "bell-mechanism", x: 425, y: 275 },
    { id: "dusty-stairs", x: 555, y: 360 }
  ], [{ id: "tower-exit", label: "Salir a la plaza", x: 448, y: 570, targetSceneId: "village", targetX: 1265, targetY: 290 }], [
    { x: 360, y: 55, width: 176, height: 105 }, { x: 180, y: 210, width: 210, height: 130 }, { x: 590, y: 260, width: 150, height: 160 }
  ])
]);

const scenesById = new Map(explorationScenes.map((item) => [item.id, item]));
const directions = new Set(["up", "down", "left", "right"]);

export function getExplorationScene(sceneId) { return scenesById.get(sceneId) || null; }

export function getWorldObject(objectId) {
  for (const current of explorationScenes) {
    const found = current.objects.find((item) => item.id === objectId);
    if (found) return { ...found, sceneId: current.id };
  }
  return null;
}

export function createExplorationPosition() {
  const spawn = getExplorationScene("village").spawn;
  return { sceneId: "village", x: spawn.x, y: spawn.y, direction: spawn.direction, isMoving: false };
}

export function isPositionInsideScene(sceneDefinition, x, y) {
  const margin = 28;
  if (!sceneDefinition || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < margin || y < margin || x > sceneDefinition.width - margin || y > sceneDefinition.height - margin) return false;
  return !sceneDefinition.obstacles.some((box) => x > box.x - margin && x < box.x + box.width + margin && y > box.y - margin && y < box.y + box.height + margin);
}

export function validateMovement(previous, next, elapsedMs) {
  const currentScene = getExplorationScene(previous?.sceneId);
  const nextScene = getExplorationScene(next?.sceneId);
  if (!currentScene || !nextScene || currentScene.id !== nextScene.id) return { valid: false, code: "INVALID_SCENE" };
  if (!directions.has(next.direction) || typeof next.isMoving !== "boolean") return { valid: false, code: "INVALID_POSITION" };
  if (!Number.isFinite(elapsedMs) || elapsedMs < POSITION_UPDATE_MIN_MS) return { valid: false, code: "RATE_LIMITED" };
  if (!isPositionInsideScene(nextScene, next.x, next.y)) return { valid: false, code: "POSITION_OUT_OF_BOUNDS" };
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  const allowed = PLAYER_SPEED * Math.max(POSITION_UPDATE_MIN_MS, Math.min(500, elapsedMs)) / 1000 + 20;
  if (distance > allowed) return { valid: false, code: "MOVEMENT_TOO_FAST" };
  return { valid: true, position: { sceneId: next.sceneId, x: Math.round(next.x * 10) / 10, y: Math.round(next.y * 10) / 10, direction: next.direction, isMoving: next.isMoving } };
}

export function resolveTransition(position, targetSceneId) {
  const source = getExplorationScene(position?.sceneId);
  const target = getExplorationScene(targetSceneId);
  if (!source || !target) return null;
  const portal = source.transitions.find((item) => item.targetSceneId === targetSceneId && Math.hypot(item.x - position.x, item.y - position.y) <= TRANSITION_DISTANCE);
  if (!portal || !isPositionInsideScene(target, portal.targetX, portal.targetY)) return null;
  return { sceneId: target.id, x: portal.targetX, y: portal.targetY, direction: target.id === "village" ? "down" : "up", isMoving: false };
}

export function canInteract(position, objectId) {
  const current = getExplorationScene(position?.sceneId);
  const worldObject = current?.objects.find((item) => item.id === objectId);
  return Boolean(worldObject && getExplorationObject(objectId)
    && Math.hypot(worldObject.x - position.x, worldObject.y - position.y) <= INTERACTION_DISTANCE);
}

export function zoneForPosition(position) {
  if (!position) return null;
  if (position.sceneId === "village") return position.x < 620 ? "western-street" : "square";
  return position.sceneId;
}

export function toPublicExplorationWorld() {
  return {
    tileSize: TILE_SIZE,
    playerSpeed: PLAYER_SPEED,
    interactionDistance: INTERACTION_DISTANCE,
    scenes: explorationScenes.map((item) => ({
      id: item.id, name: item.name, width: item.width, height: item.height,
      spawn: { ...item.spawn }, objects: item.objects.map((object) => ({ ...object })),
      transitions: item.transitions.map((transition) => ({ ...transition })), obstacles: item.obstacles.map((obstacle) => ({ ...obstacle }))
    }))
  };
}
