import test from "node:test";
import assert from "node:assert/strict";
import { io as createClient } from "socket.io-client";
import { RoomService } from "../server/services/roomService.js";
import { createGameServer } from "../server/server.js";
import { createFoundClue } from "../server/game/explorationDefinitions.js";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForState(service, roomCode, expected, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (service.getRoom(roomCode)?.state === expected) return service.getRoom(roomCode);
    await delay(2);
  }
  assert.fail(`La sala ${roomCode} no alcanzó el estado ${expected}.`);
}

function createPlayers(service, count) {
  const names = ["Inti", "Killa", "Amaru", "Sumaq", "Mayu", "Rumi"];
  const created = service.createRoom(names[0], "socket-1");
  const sessions = [created.session];
  for (let index = 1; index < count; index += 1) {
    sessions.push(service.joinRoom(created.room.code, names[index], `socket-${index + 1}`).session);
  }
  return { roomCode: created.room.code, sessions, sockets: sessions.map((_, index) => `socket-${index + 1}`) };
}

function confirmPrivateStages(service, sockets) {
  service.startGame(sockets[0]);
  sockets.forEach((socket) => service.confirmStory(socket));
  sockets.forEach((socket) => service.confirmRole(socket));
  sockets.forEach((socket) => service.confirmExplorationReady(socket));
  const transitionDelay = service.explorationFinishedDelayMs;
  service.explorationFinishedDelayMs = 0;
  service.finishExploration(service.getPrivateGameStateBySocket(sockets[0]).room.code);
  service.explorationFinishedDelayMs = transitionDelay;
}

async function finishWithVillageVictory(service, setup) {
  service.startDiscussion(setup.sockets[0]);
  service.sendChatMessage(setup.sockets[0], "Revisemos las pistas antes de votar.");
  const internalRoom = service.rooms.get(setup.roomCode);
  const clueObjects = ["mud-prints", "western-window", "stopped-clock", "altar"];
  const playerIds = [...internalRoom.gameParticipants.keys()];
  clueObjects.forEach((objectId, index) => {
    const ownerId = playerIds[Math.floor(index / 2) % playerIds.length];
    const clue = createFoundClue(objectId, "inhabitant");
    internalRoom.clueAssignments.get(ownerId).cards.push(clue);
    internalRoom.reconstructionBoard.set(index + 1, { clueId: clue.id, ownerId });
  });
  internalRoom.reconstructionVersion = clueObjects.length;
  service.finishDiscussion(setup.roomCode);
  const votingRoom = await waitForState(service, setup.roomCode, "voting");
  const privateStates = setup.sockets.map((socket) => service.getPrivateGameStateBySocket(socket));
  const creatureIndex = privateStates.findIndex((state) => state.role.id === "creature");
  const creatureId = setup.sessions[creatureIndex].playerId;
  const fallbackId = setup.sessions.find((session) => session.playerId !== creatureId).playerId;
  setup.sockets.forEach((socket, index) => {
    const voterId = setup.sessions[index].playerId;
    service.submitVote(socket, voterId === creatureId ? fallbackId : creatureId);
  });
  const finished = await waitForState(service, setup.roomCode, "game_finished");
  assert.equal(finished.result.winner, "village");
  assert.equal(finished.result.players.length, setup.sockets.length);
  assert.equal(finished.result.rounds[0].ballots.length, setup.sockets.length);
  assert.equal(votingRoom.result, null);
  return { creatureId, finished };
}

test("completa una partida candidata con 3, 4, 5 y 6 jugadores sin filtrar secretos", async () => {
  for (const count of [3, 4, 5, 6]) {
    const service = new RoomService({
      discussionFinishedDelayMs: 1,
      votingStartDelayMs: 1,
      resultRevealDelayMs: 1,
      voteRequestCooldownMs: 0,
      discussionDurationMs: 30_000,
      votingDurationMs: 30_000
    });
    const setup = createPlayers(service, count);
    confirmPrivateStages(service, setup.sockets);
    const publicRoom = service.getRoom(setup.roomCode);
    const serialized = JSON.stringify(publicRoom);
    assert.doesNotMatch(serialized, /roleAssignments|clueAssignments|reconnectToken|investigator-analysis|fragmented-memory/);
    const roles = setup.sockets.map((socket) => service.getPrivateGameStateBySocket(socket).role.id);
    assert.equal(roles.filter((role) => role === "creature").length, 1);
    assert.equal(roles.filter((role) => role === "investigator").length, 1);
    assert.equal(roles.filter((role) => role === "inhabitant").length, count - 2);
    await finishWithVillageVictory(service, setup);
    service.clear();
  }
});

test("completa tres partidas consecutivas en la misma sala y limpia todo entre rondas", async () => {
  let round = 0;
  const rotatingRoles = (ids) => {
    const creatureIndex = round % ids.length;
    round += 1;
    return new Map(ids.map((id, index) => [id, index === creatureIndex ? "creature" : index === (creatureIndex + 1) % ids.length ? "investigator" : "inhabitant"]));
  };
  const service = new RoomService({
    roleAssigner: rotatingRoles,
    discussionFinishedDelayMs: 1,
    votingStartDelayMs: 1,
    resultRevealDelayMs: 1,
    voteRequestCooldownMs: 0,
    discussionDurationMs: 30_000,
    votingDurationMs: 30_000
  });
  const setup = createPlayers(service, 4);
  const creatureIds = [];
  for (let game = 0; game < 3; game += 1) {
    confirmPrivateStages(service, setup.sockets);
    creatureIds.push((await finishWithVillageVictory(service, setup)).creatureId);
    if (game < 2) {
      const lobby = service.playAgain(setup.sockets[0]);
      assert.equal(lobby.code, setup.roomCode);
      assert.equal(lobby.players.length, 4);
      assert.equal(lobby.state, "waiting");
      const internal = service.rooms.get(setup.roomCode);
      assert.equal(internal.chatMessages.length, 0);
      assert.equal(internal.roleAssignments.size, 0);
      assert.equal(internal.clueAssignments.size, 0);
      assert.equal(internal.votes.size, 0);
      assert.equal(internal.voteRoundHistory.length, 0);
      assert.equal(internal.discussionTimer, null);
      assert.equal(internal.votingTimer, null);
      assert.equal(internal.resultTimer, null);
    }
  }
  assert.equal(new Set(creatureIds).size, 3);
  service.clear();
});

test("dos ingresos simultáneos a la última plaza nunca superan seis jugadores", async () => {
  const service = new RoomService();
  const setup = createPlayers(service, 5);
  const attempts = await Promise.allSettled([
    Promise.resolve().then(() => service.joinRoom(setup.roomCode, "Chaska", "socket-6")),
    Promise.resolve().then(() => service.joinRoom(setup.roomCode, "Nina", "socket-7"))
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  const rejected = attempts.find((attempt) => attempt.status === "rejected");
  assert.equal(rejected.reason.code, "ROOM_FULL");
  assert.equal(service.getRoom(setup.roomCode).players.length, 6);
  service.clear();
});

test("salas simultáneas mantienen mensajes, sesiones y candidatos aislados", () => {
  const service = new RoomService({ discussionDurationMs: 30_000, chatCooldownMs: 0, voteRequestCooldownMs: 0 });
  const first = createPlayers(service, 3);
  const secondSockets = ["other-1", "other-2", "other-3"];
  const secondCreated = service.createRoom("Nina", secondSockets[0]);
  service.joinRoom(secondCreated.room.code, "Qori", secondSockets[1]);
  service.joinRoom(secondCreated.room.code, "Luz", secondSockets[2]);
  confirmPrivateStages(service, first.sockets);
  confirmPrivateStages(service, secondSockets);
  service.startDiscussion(first.sockets[0]);
  service.startDiscussion(secondSockets[0]);
  service.sendChatMessage(first.sockets[0], "Mensaje de la primera sala");
  service.sendChatMessage(secondSockets[0], "Mensaje de la segunda sala");
  assert.deepEqual(service.getChatHistoryBySocket(first.sockets[1]).map((message) => message.text), ["Mensaje de la primera sala"]);
  assert.deepEqual(service.getChatHistoryBySocket(secondSockets[1]).map((message) => message.text), ["Mensaje de la segunda sala"]);
  assert.throws(
    () => service.restoreSession(first.roomCode, first.sessions[0].playerId, secondCreated.session.reconnectToken, "intruder"),
    (error) => error.code === "RECONNECTION_FAILED"
  );
  service.clear();
});

test("reconecta sin duplicados ni pérdida privada en cada etapa del recorrido", async () => {
  const targets = ["waiting", "story", "role_reveal", "ready_for_exploration", "exploration", "discussion", "voting", "vote_tiebreaker", "game_finished"];
  for (const target of targets) {
    const service = new RoomService({
      reconnectGraceMs: 500,
      roleAssigner: (ids) => new Map(ids.map((id, index) => [id, index === 0 ? "creature" : index === 1 ? "investigator" : "inhabitant"])),
      discussionFinishedDelayMs: 1,
      votingStartDelayMs: 1,
      resultRevealDelayMs: 1,
      voteRequestCooldownMs: 0,
      discussionDurationMs: 30_000,
      votingDurationMs: 30_000,
      tiebreakerDurationMs: 30_000
    });
    const setup = createPlayers(service, 3);
    if (target !== "waiting") service.startGame(setup.sockets[0]);
    if (!["waiting", "story"].includes(target)) setup.sockets.forEach((socket) => service.confirmStory(socket));
    if (!["waiting", "story", "role_reveal"].includes(target)) setup.sockets.forEach((socket) => service.confirmRole(socket));
    if (!["waiting", "story", "role_reveal", "ready_for_exploration"].includes(target)) setup.sockets.forEach((socket) => service.confirmExplorationReady(socket));
    if (!["waiting", "story", "role_reveal", "ready_for_exploration", "exploration"].includes(target)) {
      service.explorationFinishedDelayMs = 0;
      service.finishExploration(setup.roomCode);
      service.startDiscussion(setup.sockets[0]);
    }
    if (["voting", "vote_tiebreaker", "game_finished"].includes(target)) {
      service.finishDiscussion(setup.roomCode);
      await waitForState(service, setup.roomCode, "voting");
    }
    if (target === "voting") {
      const candidate = service.getRoom(setup.roomCode).voting.candidates.find((item) => item.id !== setup.sessions[1].playerId);
      service.submitVote(setup.sockets[1], candidate.id);
    }
    if (target === "vote_tiebreaker") {
      const candidates = service.getRoom(setup.roomCode).voting.candidates;
      service.submitVote(setup.sockets[0], candidates[1].id);
      service.submitVote(setup.sockets[1], candidates[0].id);
      service.closeVoting(setup.roomCode);
      assert.equal(service.getRoom(setup.roomCode).state, "vote_tiebreaker");
      const tiebreakerCandidate = service.getRoom(setup.roomCode).voting.candidates.find((item) => item.id !== setup.sessions[1].playerId);
      service.submitVote(setup.sockets[1], tiebreakerCandidate.id);
    }
    if (target === "game_finished") {
      const creatureId = setup.sessions[0].playerId;
      const fallbackId = setup.sessions[1].playerId;
      setup.sockets.forEach((socket, index) => service.submitVote(socket, index === 0 ? fallbackId : creatureId));
      await waitForState(service, setup.roomCode, "game_finished");
    }

    const before = service.getPrivateGameStateBySocket(setup.sockets[1]);
    service.disconnectBySocket(setup.sockets[1]);
    service.restoreSession(setup.roomCode, setup.sessions[1].playerId, setup.sessions[1].reconnectToken, `restored-${target}`);
    const restored = service.getPrivateGameStateBySocket(`restored-${target}`);
    assert.equal(restored.room.state, target);
    assert.equal(restored.room.players.length, 3);
    assert.equal(restored.room.players.find((player) => player.id === setup.sessions[1].playerId).connected, true);
    assert.deepEqual(restored.role, before.role);
    assert.deepEqual(restored.clues, before.clues);
    assert.equal(restored.hasVoted, before.hasVoted);
    assert.equal(restored.room.discussion?.endsAt, before.room.discussion?.endsAt);
    assert.equal(restored.room.voting?.endsAt, before.room.voting?.endsAt);
    assert.deepEqual(restored.room.result, before.room.result);
    service.clear();
  }
});

test("la creación y eliminación repetida no deja salas, sockets ni temporizadores", () => {
  let now = 1_000;
  const service = new RoomService({ nowProvider: () => now, roomInactivityMs: 10 });
  for (let index = 0; index < 120; index += 1) {
    const created = service.createRoom(`Jugador ${index}`, `load-${index}`);
    service.disconnectBySocket(`load-${index}`);
    now += 11;
    service.cleanupInactiveRooms();
    assert.equal(service.getRoom(created.room.code), null);
  }
  assert.equal(service.getRoomCount(), 0);
  assert.equal(service.socketIndex.size, 0);
  service.clear();
});

test("producción aplica cabeceras y rechaza conexiones Socket.IO desde otro origen", async (context) => {
  const server = createGameServer({
    logger: { log() {}, error() {} },
    config: {
      host: "127.0.0.1",
      port: 0,
      nodeEnv: "production",
      allowedOrigins: [],
      reconnectGraceSeconds: 30,
      roomInactivityMinutes: 60,
      roomCleanupIntervalMinutes: 5,
      rateLimitWindowMs: 1_000,
      rateLimitMaxActions: 20
    }
  });
  await server.start({ host: "127.0.0.1", port: 0 });
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  const clients = [];
  context.after(async () => {
    clients.forEach((client) => client.disconnect());
    await server.stop();
  });

  const response = await fetch(url);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);

  const rejected = createClient(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: { Origin: "https://intruso.example" }
  });
  clients.push(rejected);
  const rejection = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("El origen ajeno no fue rechazado.")), 2_000);
    rejected.once("connect", () => { clearTimeout(timer); reject(new Error("El origen ajeno consiguió conectarse.")); });
    rejected.once("connect_error", (error) => { clearTimeout(timer); resolve(error); });
  });
  assert.ok(rejection);

  const accepted = createClient(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: { Origin: url }
  });
  clients.push(accepted);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("El mismo origen no consiguió conectarse.")), 2_000);
    accepted.once("connect", () => { clearTimeout(timer); resolve(); });
    accepted.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
  });
  assert.equal(accepted.connected, true);
});
