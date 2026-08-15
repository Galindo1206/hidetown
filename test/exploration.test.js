import test from "node:test";
import assert from "node:assert/strict";
import { createEnvironment } from "../server/config/environment.js";
import { explorationZones, getExplorationObject } from "../server/game/explorationDefinitions.js";
import { getWorldObject } from "../server/game/explorationWorld.js";
import { RoomService } from "../server/services/roomService.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function deterministicRoles(ids) {
  return new Map(ids.map((id, index) => [id, index === 0 ? "creature" : index === 1 ? "investigator" : "inhabitant"]));
}

function createExploration(options = {}, onPhaseChange) {
  const service = new RoomService({
    roleAssigner: deterministicRoles,
    explorationDurationMs: 5_000,
    explorationSearchMs: 5,
    explorationFinishedDelayMs: 0,
    ...options
  });
  const host = service.createRoom("Inti", "socket-1");
  const guest = service.joinRoom(host.room.code, "Killa", "socket-2");
  const third = service.joinRoom(host.room.code, "Amaru", "socket-3");
  const sockets = ["socket-1", "socket-2", "socket-3"];
  const sessions = [host.session, guest.session, third.session];
  service.startGame(sockets[0]);
  sockets.forEach((socket) => service.confirmStory(socket));
  sockets.forEach((socket, index) => service.confirmRole(socket, index === sockets.length - 1 ? onPhaseChange : undefined));
  return { service, roomCode: host.room.code, sockets, sessions };
}

function investigate(service, socketId, objectId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("La búsqueda no terminó.")), 250);
    try {
      service.investigateDuringExploration(socketId, objectId, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

function placeNearObject(service, socketId, objectId) {
  const { room, player } = service.getContextBySocket(socketId);
  const target = getWorldObject(objectId);
  Object.assign(room.explorationPlayers.get(player.id), { sceneId: target.sceneId, x: target.x, y: target.y + 70, direction: "up", isMoving: false, location: getExplorationObject(objectId).zoneId });
}

test("define cinco zonas, quince objetos y valida la duración configurable", () => {
  assert.deepEqual(explorationZones.map((zone) => zone.name), ["Iglesia", "Campanario", "Plaza", "Casa del cuidador", "Calle occidental"]);
  assert.equal(explorationZones.every((zone) => zone.objects.length === 3), true);
  assert.equal(new Set(explorationZones.flatMap((zone) => zone.objects.map((item) => item.id))).size, 15);
  assert.equal(createEnvironment({}).explorationDurationSeconds, 90);
  assert.equal(createEnvironment({ EXPLORATION_DURATION_SECONDS: "60" }).explorationDurationSeconds, 60);
  assert.throws(() => createEnvironment({ EXPLORATION_DURATION_SECONDS: "29" }), /EXPLORATION_DURATION_SECONDS/);
  assert.throws(() => createEnvironment({ EXPLORATION_DURATION_SECONDS: "181" }), /EXPLORATION_DURATION_SECONDS/);
});

test("sincroniza preparación, ubicación pública y rechaza zonas u objetos inválidos", () => {
  const { service, roomCode, sockets } = createExploration();
  assert.equal(service.getRoom(roomCode).state, "ready_for_exploration");
  assert.equal(service.confirmExplorationReady(sockets[0]).room.progress.explorationReady, 1);
  assert.equal(service.confirmExplorationReady(sockets[0]).duplicate, true);
  service.confirmExplorationReady(sockets[1]);
  const started = service.confirmExplorationReady(sockets[2]).room;
  assert.equal(started.state, "exploration");
  assert.equal(started.players.every((player) => player.zoneId === "square"), true);
  assert.ok(started.exploration.endsAt > started.exploration.startedAt);
  assert.throws(() => service.updateExplorationPosition(sockets[0], { sceneId: "invented", x: 1, y: 1, direction: "down", isMoving: true }), (error) => error.code === "INVALID_SCENE");
  assert.throws(() => service.investigateDuringExploration(sockets[0], "missing"), (error) => error.code === "INVALID_OBJECT");
  assert.throws(() => service.transitionExplorationScene(sockets[0], "church"), (error) => error.code === "INVALID_TRANSITION");
  assert.throws(() => service.investigateDuringExploration(sockets[0], "ash-remains"), (error) => error.code === "OBJECT_TOO_FAR");
  service.clear();
});

test("el servidor inicia al vencer la espera de preparación sin crear relojes por jugador", async () => {
  const phases = [];
  const { service, roomCode, sockets } = createExploration({ explorationReadyTimeoutMs: 20 }, (phase) => phases.push(phase));
  service.confirmExplorationReady(sockets[0]);
  await delay(35);
  const room = service.getRoom(roomCode);
  assert.equal(room.state, "exploration");
  assert.equal(room.exploration.readyCount, 1);
  assert.equal(phases.filter((phase) => phase === "started").length, 1);
  assert.ok(service.rooms.get(roomCode).explorationTimer);
  service.clear();
});

test("entrega como máximo dos pistas privadas por rol y permite un solo análisis", async () => {
  const { service, roomCode, sockets } = createExploration();
  sockets.forEach((socket) => service.confirmExplorationReady(socket));
  sockets.forEach((socket) => placeNearObject(service, socket, "mud-prints"));

  const [creature, investigator, inhabitant] = await Promise.all(sockets.map((socket) => investigate(service, socket, "mud-prints")));
  assert.match(creature.clue.text, /segunda línea tenue/);
  assert.match(investigator.clue.text, /No existen huellas que regresen/);
  assert.equal(investigator.clue.text, inhabitant.clue.text);
  assert.throws(() => service.investigateDuringExploration(sockets[2], "mud-prints"), (error) => error.code === "OBJECT_ALREADY_INVESTIGATED");

  const analyzed = service.analyzeExplorationClue(sockets[1], investigator.clue.id);
  assert.match(analyzed.clues.cards[0].analysis, /presión y la separación/);
  assert.equal(analyzed.exploration.analysisUsed, true);
  assert.throws(() => service.analyzeExplorationClue(sockets[1], investigator.clue.id), (error) => error.code === "ABILITY_ALREADY_USED");
  assert.throws(() => service.analyzeExplorationClue(sockets[2], inhabitant.clue.id), (error) => error.code === "ABILITY_NOT_AVAILABLE");

  placeNearObject(service, sockets[2], "fountain");
  await investigate(service, sockets[2], "fountain");
  placeNearObject(service, sockets[2], "old-post");
  assert.throws(() => service.investigateDuringExploration(sockets[2], "old-post"), (error) => error.code === "CLUE_LIMIT_REACHED");
  const publicJson = JSON.stringify(service.getRoom(roomCode));
  assert.doesNotMatch(publicJson, /No existen huellas|segunda línea tenue|presión y la separación|investigatedObjectIds|analysisUsed|activeSearch/);
  assert.match(JSON.stringify(service.getPrivateGameStateBySocket(sockets[1])), /presión y la separación/);
  service.clear();
});

test("reconecta con su cuaderno, cancela búsquedas pendientes y limpia al reiniciar", async () => {
  const { service, roomCode, sockets, sessions } = createExploration({ explorationSearchMs: 60 });
  sockets.forEach((socket) => service.confirmExplorationReady(socket));
  placeNearObject(service, sockets[1], "mud-prints");
  await investigate(service, sockets[1], "mud-prints");
  service.disconnectBySocket(sockets[1]);
  service.restoreSession(roomCode, sessions[1].playerId, sessions[1].reconnectToken, "socket-restored");
  const restored = service.getPrivateGameStateBySocket("socket-restored");
  assert.equal(restored.exploration.location, "square");
  assert.deepEqual(restored.exploration.investigatedObjectIds, ["mud-prints"]);
  assert.equal(restored.clues.cards.length, 1);

  let delivered = false;
  placeNearObject(service, sockets[0], "fountain");
  service.investigateDuringExploration(sockets[0], "fountain", () => { delivered = true; });
  service.finishExploration(roomCode);
  await delay(80);
  assert.equal(delivered, false);
  assert.equal(service.getRoom(roomCode).state, "ready_for_discussion");
  assert.equal(service.getPrivateGameStateBySocket(sockets[0]).clues.cards.length, 0);
  const reset = service.resetGame(sockets[0]);
  assert.equal(reset.state, "waiting");
  const internal = service.rooms.get(roomCode);
  assert.equal(internal.explorationPlayers.size, 0);
  assert.equal(internal.clueAssignments.size, 0);
  assert.equal(internal.explorationTimer, null);
  service.clear();
});

test("el temporizador de sala finaliza una sola vez y entra a ready_for_discussion", async () => {
  const phases = [];
  const { service, roomCode, sockets } = createExploration({ explorationDurationMs: 25, explorationFinishedDelayMs: 5 });
  const callback = (phase) => phases.push(phase);
  sockets.forEach((socket) => service.confirmExplorationReady(socket, callback));
  await delay(50);
  assert.equal(service.getRoom(roomCode).state, "ready_for_discussion");
  assert.equal(phases.filter((phase) => phase === "finished").length, 1);
  assert.equal(phases.filter((phase) => phase === "ready_for_discussion").length, 1);
  assert.equal(service.finishExploration(roomCode, callback), null);
  service.clear();
});

test("cada objeto conserva una versión real, una distorsionada y un análisis solo en servidor", () => {
  for (const zone of explorationZones) {
    for (const item of zone.objects) {
      const secret = getExplorationObject(item.id);
      assert.ok(secret.truth);
      assert.ok(secret.distortion);
      assert.ok(secret.analysis);
      assert.notEqual(secret.truth, secret.distortion);
    }
  }
});
