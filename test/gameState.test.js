import test from "node:test";
import assert from "node:assert/strict";
import { assignRoles } from "../server/game/assignRoles.js";
import { RoomService } from "../server/services/roomService.js";

function assertCode(error, code) {
  assert.equal(error.code, code);
  return true;
}

function createServiceWithPlayers(count, options = {}) {
  const service = new RoomService({ explorationFinishedDelayMs: 0, explorationSearchMs: 1, ...options });
  const host = service.createRoom("Jugador 1", "socket-1");
  const sessions = [host.session];
  for (let number = 2; number <= count; number += 1) {
    sessions.push(service.joinRoom(host.room.code, `Jugador ${number}`, `socket-${number}`).session);
  }
  return { service, roomCode: host.room.code, sessions, sockets: sessions.map((item, index) => `socket-${index + 1}`) };
}

test("distribuye exactamente una criatura, un investigador y los habitantes restantes", () => {
  for (let count = 3; count <= 6; count += 1) {
    const ids = Array.from({ length: count }, (_, index) => `player-${index}`);
    const assignment = assignRoles(ids, () => 0);
    const roles = [...assignment.values()];
    assert.equal(roles.filter((role) => role === "creature").length, 1);
    assert.equal(roles.filter((role) => role === "investigator").length, 1);
    assert.equal(roles.filter((role) => role === "inhabitant").length, count - 2);
  }
});

test("el barajado permite distribuciones diferentes sin depender del orden de ingreso", () => {
  const ids = ["a", "b", "c", "d"];
  const first = [...assignRoles(ids, () => 0).entries()];
  const second = [...assignRoles(ids, (min, max) => max - 1).entries()];
  assert.notDeepEqual(first, second);
});

test("inicia correctamente con 3, 4, 5 y 6 jugadores", () => {
  for (let count = 3; count <= 6; count += 1) {
    const { service, sockets } = createServiceWithPlayers(count);
    const room = service.startGame(sockets[0]);
    assert.equal(room.state, "story");
    assert.equal(room.players.length, count);
    assert.equal(room.story.id, "san-jeronimo");
    assert.throws(() => service.startGame(sockets[0]), (error) => assertCode(error, "INVALID_STATE"));
    service.clear();
  }
});

test("aplica transiciones, ignora confirmaciones repetidas y sincroniza el progreso", () => {
  const { service, sockets } = createServiceWithPlayers(3);
  service.startGame(sockets[0]);
  assert.equal(service.confirmStory(sockets[0]).room.progress.storyConfirmed, 1);
  const duplicateStory = service.confirmStory(sockets[0]);
  assert.equal(duplicateStory.duplicate, true);
  assert.equal(duplicateStory.room.progress.storyConfirmed, 1);
  service.confirmStory(sockets[1]);
  assert.equal(service.confirmStory(sockets[2]).room.state, "role_reveal");

  const roles = sockets.map((socketId) => service.getPrivateGameStateBySocket(socketId).role.id);
  assert.equal(roles.filter((role) => role === "creature").length, 1);
  assert.equal(roles.filter((role) => role === "investigator").length, 1);

  assert.equal(service.confirmRole(sockets[0]).room.state, "waiting_ready");
  const duplicateRole = service.confirmRole(sockets[0]);
  assert.equal(duplicateRole.duplicate, true);
  assert.equal(duplicateRole.room.progress.roleConfirmed, 1);
  service.confirmRole(sockets[1]);
  assert.equal(service.confirmRole(sockets[2]).room.state, "ready_for_exploration");
  assert.equal(service.confirmExplorationReady(sockets[0]).room.progress.explorationReady, 1);
  const duplicateReady = service.confirmExplorationReady(sockets[0]);
  assert.equal(duplicateReady.duplicate, true);
  assert.equal(duplicateReady.room.state, "ready_for_exploration");
  service.confirmExplorationReady(sockets[1]);
  assert.equal(service.confirmExplorationReady(sockets[2]).room.state, "exploration");
  assert.equal(service.finishExploration(service.getPrivateGameStateBySocket(sockets[0]).room.code).state, "ready_for_discussion");
  service.clear();
});

test("rechaza transiciones fuera de orden y acciones sin permisos", () => {
  const { service, sockets } = createServiceWithPlayers(3);
  assert.throws(() => service.confirmStory(sockets[0]), (error) => assertCode(error, "INVALID_STATE"));
  assert.throws(() => service.startGame(sockets[1]), (error) => assertCode(error, "NOT_HOST"));
  service.startGame(sockets[0]);
  assert.throws(() => service.confirmRole(sockets[0]), (error) => assertCode(error, "INVALID_STATE"));
  assert.throws(() => service.confirmExplorationReady(sockets[0]), (error) => assertCode(error, "INVALID_STATE"));
  assert.throws(() => service.moveDuringExploration(sockets[0], "square"), (error) => assertCode(error, "EXPLORATION_CLOSED"));
  assert.throws(() => service.resetGame(sockets[1]), (error) => assertCode(error, "NOT_HOST"));
  service.clear();
});

test("el estado público nunca serializa asignaciones, objetivos, pistas privadas ni tokens", () => {
  const { service, sockets, roomCode } = createServiceWithPlayers(3);
  service.startGame(sockets[0]);
  sockets.forEach((socketId) => service.confirmStory(socketId));
  sockets.forEach((socketId) => service.confirmRole(socketId));
  const serialized = JSON.stringify(service.getRoom(roomCode));
  assert.doesNotMatch(serialized, /roleAssignments|clueAssignments|reconnectToken|socketId|Permanece oculta|Analiza la información|El polvo acumulado|franja limpia/);
  assert.equal(Object.hasOwn(service.getRoom(roomCode), "roleAssignments"), false);
  service.clear();
});

test("reiniciar limpia historia, roles, pistas y confirmaciones, y permite una nueva distribución", () => {
  const { service, sockets, roomCode } = createServiceWithPlayers(3);
  service.startGame(sockets[0]);
  sockets.forEach((socketId) => service.confirmStory(socketId));
  assert.ok(service.getPrivateGameStateBySocket(sockets[0]).role);
  sockets.forEach((socketId) => service.confirmRole(socketId));
  assert.ok(service.getPrivateGameStateBySocket(sockets[0]).clues);
  service.confirmExplorationReady(sockets[0]);
  const reset = service.resetGame(sockets[0]);
  assert.equal(reset.state, "waiting");
  assert.equal(reset.story, null);
  assert.deepEqual(reset.progress, { storyConfirmed: 0, roleConfirmed: 0, explorationReady: 0, total: 3 });
  assert.equal(service.getPrivateGameStateBySocket(sockets[0]).role, null);
  assert.equal(service.getPrivateGameStateBySocket(sockets[0]).clues, null);
  assert.equal(service.getRoom(roomCode).players.length, 3);
  service.startGame(sockets[0]);
  sockets.forEach((socketId) => service.confirmStory(socketId));
  sockets.forEach((socketId) => service.confirmRole(socketId));
  assert.ok(service.getPrivateGameStateBySocket(sockets[0]).clues);
  service.clear();
});

test("reconecta durante historia y revelación conservando exactamente el mismo rol", () => {
  const { service, sockets, sessions } = createServiceWithPlayers(3, { reconnectGraceMs: 1_000 });
  service.startGame(sockets[0]);
  service.disconnectBySocket(sockets[1]);
  service.restoreSession(sessions[1].roomCode, sessions[1].playerId, sessions[1].reconnectToken, "guest-story-restored");
  assert.equal(service.getPrivateGameStateBySocket("guest-story-restored").room.state, "story");

  service.confirmStory(sockets[0]);
  service.confirmStory("guest-story-restored");
  service.confirmStory(sockets[2]);
  const originalRole = service.getPrivateGameStateBySocket("guest-story-restored").role;
  service.disconnectBySocket("guest-story-restored");
  service.restoreSession(sessions[1].roomCode, sessions[1].playerId, sessions[1].reconnectToken, "guest-role-restored");
  assert.deepEqual(service.getPrivateGameStateBySocket("guest-role-restored").role, originalRole);
  service.clear();
});

test("la expiración de un jugador cancela y limpia una partida activa", async () => {
  const { service, sockets, roomCode } = createServiceWithPlayers(3, { reconnectGraceMs: 20 });
  service.startGame(sockets[0]);
  sockets.forEach((socketId) => service.confirmStory(socketId));
  sockets.forEach((socketId) => service.confirmRole(socketId));
  sockets.forEach((socketId) => service.confirmExplorationReady(socketId));
  assert.equal(service.getRoom(roomCode).state, "exploration");
  let expiration;
  service.disconnectBySocket(sockets[2], (result) => { expiration = result; });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(expiration.gameCancelled, true);
  assert.equal(expiration.room.state, "waiting");
  assert.equal(expiration.room.story, null);
  assert.equal(expiration.room.players.length, 2);
  assert.equal(service.getPrivateGameStateBySocket(sockets[0]).role, null);
  assert.equal(service.getRoom(roomCode).progress.total, 2);
  service.clear();
});
