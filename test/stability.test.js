import test from "node:test";
import assert from "node:assert/strict";
import { AppError, toPublicError } from "../server/utils/errors.js";
import { requireExactObject } from "../server/utils/validators.js";
import { RoomService } from "../server/services/roomService.js";
import { createGameServer } from "../server/server.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function deterministicRoles(ids) {
  return new Map(ids.map((id, index) => [id, index === 0 ? "creature" : index === 1 ? "investigator" : "inhabitant"]));
}

function createPreparedService(options = {}) {
  const service = new RoomService({
    roleAssigner: deterministicRoles,
    explorationFinishedDelayMs: 0,
    reconnectGraceMs: 15,
    discussionFinishedDelayMs: 1,
    votingStartDelayMs: 1,
    votingDurationMs: 100,
    tiebreakerDurationMs: 50,
    resultRevealDelayMs: 1,
    voteRequestCooldownMs: 0,
    ...options
  });
  const host = service.createRoom("Inti", "socket-1");
  const guest = service.joinRoom(host.room.code, "Killa", "socket-2");
  const third = service.joinRoom(host.room.code, "Amaru", "socket-3");
  const sockets = ["socket-1", "socket-2", "socket-3"];
  service.startGame(sockets[0]);
  sockets.forEach((socket) => service.confirmStory(socket));
  sockets.forEach((socket) => service.confirmRole(socket));
  sockets.forEach((socket) => service.confirmExplorationReady(socket));
  service.finishExploration(host.room.code);
  return { service, host, sessions: [host.session, guest.session, third.session], sockets, roomCode: host.room.code };
}

async function beginVoting(setup, callback) {
  setup.service.startDiscussion(setup.sockets[0], callback);
  setup.service.finishDiscussion(setup.roomCode, callback);
  for (let attempt = 0; attempt < 50 && setup.service.getRoom(setup.roomCode).state !== "voting"; attempt += 1) await delay(2);
  assert.equal(setup.service.getRoom(setup.roomCode).state, "voting");
}

test("normaliza errores esperados e internos sin filtrar detalles", () => {
  assert.deepEqual(toPublicError(new AppError("SESSION_EXPIRED")), {
    code: "SESSION_EXPIRED",
    message: "La sesión anterior ya no está disponible.",
    recoverable: false
  });
  const internal = toPublicError(new Error("token=secreto C:\\ruta\\privada"));
  assert.deepEqual(internal, {
    code: "INTERNAL_ERROR",
    message: "Ocurrió un error inesperado. Inténtalo nuevamente.",
    recoverable: true
  });
});

test("rechaza payloads con campos ausentes o inesperados", () => {
  assert.deepEqual(requireExactObject({ text: "hola" }, ["text"]), { text: "hola" });
  assert.throws(() => requireExactObject({}, ["text"]), (error) => error.code === "INVALID_PAYLOAD");
  assert.throws(() => requireExactObject({ text: "hola", token: "secreto" }, ["text"]), (error) => error.code === "INVALID_PAYLOAD");
});

test("un socket no puede crear dos salas y la salida voluntaria transfiere anfitrión", () => {
  const service = new RoomService();
  const host = service.createRoom("Inti", "socket-1");
  const guest = service.joinRoom(host.room.code, "Killa", "socket-2");
  assert.throws(() => service.createRoom("Duplicado", "socket-1"), (error) => error.code === "ALREADY_IN_ROOM");
  assert.equal(service.getRoomCount(), 1);
  const leave = service.leaveBySocket("socket-1");
  assert.equal(leave.hostChanged, true);
  assert.equal(leave.newHostId, guest.session.playerId);
  assert.equal(leave.room.players[0].isHost, true);
  service.clear();
});

test("conserva al anfitrión durante su plazo y bloquea acciones exclusivas", () => {
  const service = new RoomService({ reconnectGraceMs: 1_000 });
  const host = service.createRoom("Inti", "socket-1");
  service.joinRoom(host.room.code, "Killa", "socket-2");
  service.joinRoom(host.room.code, "Amaru", "socket-3");
  service.disconnectBySocket("socket-1");
  const room = service.getRoom(host.room.code);
  assert.equal(room.players.find((player) => player.id === host.session.playerId).isHost, true);
  assert.ok(room.players[0].reconnectDeadline);
  assert.throws(() => service.startGame("socket-2"), (error) => error.code === "NOT_HOST");
  service.clear();
});

test("elimina una sala inactiva y cancela sus referencias de reconexión", () => {
  let now = 1_000;
  const service = new RoomService({ nowProvider: () => now, reconnectGraceMs: 10_000, roomInactivityMs: 100 });
  const host = service.createRoom("Inti", "socket-1");
  service.disconnectBySocket("socket-1");
  now += 101;
  assert.deepEqual(service.cleanupInactiveRooms(), [host.room.code]);
  assert.equal(service.getRoomCount(), 0);
  assert.equal(service.socketIndex.size, 0);
  assert.throws(
    () => service.restoreSession(host.session.roomCode, host.session.playerId, host.session.reconnectToken, "socket-2"),
    (error) => error.code === "SESSION_EXPIRED"
  );
  service.clear();
});

test("un vencimiento durante la votación cancela y limpia toda la ronda", async () => {
  const setup = createPreparedService();
  await beginVoting(setup);
  let expiration;
  setup.service.disconnectBySocket(setup.sockets[1], (result) => { expiration = result; });
  await delay(30);
  const room = setup.service.getRoom(setup.roomCode);
  assert.equal(expiration.gameCancelled, true);
  assert.equal(room.state, "waiting");
  assert.equal(room.players.length, 2);
  assert.equal(room.voting, null);
  assert.equal(room.result, null);
  assert.equal(setup.service.rooms.get(setup.roomCode).votingTimer, null);
  setup.service.clear();
});

test("reconecta durante el desempate con los mismos candidatos y sin duplicar jugador", async () => {
  const setup = createPreparedService({ reconnectGraceMs: 100 });
  await beginVoting(setup);
  const candidates = setup.service.getRoom(setup.roomCode).voting.candidates;
  setup.service.submitVote(setup.sockets[0], candidates[1].id);
  setup.service.submitVote(setup.sockets[1], candidates[0].id);
  setup.service.closeVoting(setup.roomCode);
  const before = setup.service.getRoom(setup.roomCode);
  assert.equal(before.state, "vote_tiebreaker");
  setup.service.disconnectBySocket(setup.sockets[2]);
  setup.service.restoreSession(
    setup.sessions[2].roomCode,
    setup.sessions[2].playerId,
    setup.sessions[2].reconnectToken,
    "socket-3-restored"
  );
  const restored = setup.service.getPrivateGameStateBySocket("socket-3-restored");
  assert.equal(restored.room.players.length, 3);
  assert.equal(restored.room.state, "vote_tiebreaker");
  assert.deepEqual(restored.room.voting.candidates, before.voting.candidates);
  assert.equal(restored.hasVoted, false);
  setup.service.clear();
});

test("la expulsión posterior al resultado no lo recalcula y transfiere anfitrión", async () => {
  const setup = createPreparedService({ votingDurationMs: 5, tiebreakerDurationMs: 5, reconnectGraceMs: 5 });
  await beginVoting(setup);
  for (let attempt = 0; attempt < 50 && setup.service.getRoom(setup.roomCode).state !== "game_finished"; attempt += 1) await delay(2);
  const original = setup.service.getRoom(setup.roomCode).result;
  setup.service.disconnectBySocket(setup.sockets[0]);
  await delay(15);
  const room = setup.service.getRoom(setup.roomCode);
  assert.equal(room.state, "game_finished");
  assert.deepEqual(room.result, original);
  assert.equal(room.players.length, 2);
  assert.equal(room.players[0].isHost, true);
  setup.service.clear();
});

test("expone un endpoint de salud mínimo", async (context) => {
  const server = createGameServer({
    logger: { log() {}, error() {} },
    config: {
      host: "127.0.0.1",
      port: 0,
      reconnectGraceSeconds: 30,
      roomInactivityMinutes: 60,
      roomCleanupIntervalMinutes: 5,
      rateLimitWindowMs: 1_000,
      rateLimitMaxActions: 20
    }
  });
  await server.start({ host: "127.0.0.1", port: 0 });
  context.after(() => server.stop());
  const response = await fetch(`http://127.0.0.1:${server.httpServer.address().port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", version: "0.9.0-beta.1" });
});
