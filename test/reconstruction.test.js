import test from "node:test";
import assert from "node:assert/strict";
import { createFoundClue } from "../server/game/explorationDefinitions.js";
import { evaluateReconstruction } from "../server/game/reconstructionDefinitions.js";
import { RoomService } from "../server/services/roomService.js";

function assertCode(error, code) {
  assert.equal(error.code, code);
  return true;
}

function createDiscussion(count = 3, options = {}) {
  const service = new RoomService({ explorationFinishedDelayMs: 0, discussionFinishedDelayMs: 1, ...options });
  const created = service.createRoom("Inti", "socket-1");
  const names = ["Killa", "Amaru", "Sumaq", "Mayu", "Rumi"];
  const sessions = [created.session];
  for (let index = 2; index <= count; index += 1) {
    sessions.push(service.joinRoom(created.room.code, names[index - 2], `socket-${index}`).session);
  }
  const sockets = sessions.map((_, index) => `socket-${index + 1}`);
  service.startGame(sockets[0]);
  sockets.forEach((socket) => service.confirmStory(socket));
  sockets.forEach((socket) => service.confirmRole(socket));
  sockets.forEach((socket) => service.confirmExplorationReady(socket));
  service.finishExploration(created.room.code);
  const room = service.rooms.get(created.room.code);
  const clueSpecs = [
    [["mud-prints", "inhabitant"], ["altar", "inhabitant"]],
    [["western-window", "inhabitant"], ["caretaker-diary", "creature"]],
    [["stopped-clock", "investigator"]]
  ];
  sessions.forEach((session, index) => room.clueAssignments.set(session.playerId, {
    cards: (clueSpecs[index] || [["fountain", "inhabitant"]]).map(([objectId, role]) => createFoundClue(objectId, role)),
    instructions: "Prueba"
  }));
  service.startDiscussion(sockets[0]);
  return { service, room, roomCode: room.code, sockets, sessions };
}

test("inicia una mesa de cinco etapas para salas de 3 a 6 jugadores", () => {
  for (let count = 3; count <= 6; count += 1) {
    const setup = createDiscussion(count);
    assert.deepEqual(setup.service.getRoom(setup.roomCode).reconstruction.slots.map((slot) => slot.title), [
      "Llegada", "Entrada", "Campanas", "Advertencia", "Suplantación"
    ]);
    assert.deepEqual(setup.service.getRoom(setup.roomCode).reconstruction.progress, { confirmed: 0, total: count });
    setup.service.clear();
  }
});

test("solo el dueño coloca, mueve o retira y cada cambio incrementa versión", () => {
  const { service, sockets, roomCode } = createDiscussion();
  let room = service.getRoom(roomCode);
  service.placeReconstructionClue(sockets[0], "exploration:mud-prints", 1, room.reconstruction.version);
  room = service.getRoom(roomCode);
  assert.equal(room.reconstruction.version, 1);
  assert.equal(room.reconstruction.slots[0].clue.ownerName, "Inti");
  assert.throws(() => service.removeReconstructionClue(sockets[1], "exploration:mud-prints", 1), (error) => assertCode(error, "NOT_CLUE_OWNER"));
  assert.throws(() => service.placeReconstructionClue(sockets[1], "exploration:western-window", 6, 1), (error) => assertCode(error, "INVALID_RECONSTRUCTION_SLOT"));
  assert.throws(() => service.placeReconstructionClue(sockets[1], "exploration:missing", 2, 1), (error) => assertCode(error, "CLUE_NOT_FOUND"));
  assert.throws(() => service.placeReconstructionClue(sockets[1], "exploration:western-window", 1, 0), (error) => assertCode(error, "STALE_BOARD_VERSION"));
  assert.throws(() => service.placeReconstructionClue(sockets[1], "exploration:western-window", 1, 1), (error) => assertCode(error, "SLOT_OCCUPIED"));
  service.moveReconstructionClue(sockets[0], "exploration:mud-prints", 2, 1);
  room = service.getRoom(roomCode);
  assert.equal(room.reconstruction.version, 2);
  assert.equal(room.reconstruction.slots[0].clue, null);
  service.removeReconstructionClue(sockets[0], "exploration:mud-prints", 2);
  assert.equal(service.getRoom(roomCode).reconstruction.version, 3);
  service.clear();
});

test("un cambio invalida confirmaciones y la unanimidad bloquea y evalúa una sola vez", () => {
  const phases = [];
  const { service, sockets, room, roomCode } = createDiscussion(3, { discussionFinishedDelayMs: 10_000 });
  const operations = [
    [sockets[0], "exploration:mud-prints", 1],
    [sockets[1], "exploration:western-window", 2],
    [sockets[2], "exploration:stopped-clock", 3],
    [sockets[0], "exploration:altar", 4]
  ];
  for (const [socket, clueId, slot] of operations) {
    service.placeReconstructionClue(socket, clueId, slot, service.getRoom(roomCode).reconstruction.version);
  }
  const version = service.getRoom(roomCode).reconstruction.version;
  service.confirmReconstruction(sockets[0], version);
  assert.deepEqual(service.getRoom(roomCode).reconstruction.progress, { confirmed: 1, total: 3 });
  service.removeReconstructionClue(sockets[0], "exploration:altar", version);
  assert.equal(service.getRoom(roomCode).reconstruction.progress.confirmed, 0);
  service.placeReconstructionClue(sockets[0], "exploration:altar", 4, version + 1);
  const finalVersion = version + 2;
  service.confirmReconstruction(sockets[0], finalVersion, (phase) => phases.push(phase));
  service.confirmReconstruction(sockets[1], finalVersion, (phase) => phases.push(phase));
  const locked = service.confirmReconstruction(sockets[2], finalVersion, (phase) => phases.push(phase));
  assert.equal(locked.locked, true);
  assert.equal(locked.room.state, "discussion_finished");
  assert.deepEqual(locked.room.reconstruction.result, {
    score: 4,
    required: 4,
    passed: true,
    finalVersion,
    reason: "unanimity",
    message: "La historia comienza a tomar forma, pero todavía deben descubrir quién intentó alterarla."
  });
  assert.deepEqual(phases, ["discussion_finished"]);
  assert.deepEqual(room.reconstructionResult.correctSlots, [1, 2, 3, 4]);
  assert.throws(() => service.removeReconstructionClue(sockets[0], "exploration:altar", finalVersion), (error) => assertCode(error, "RECONSTRUCTION_CLOSED"));
  service.clear();
});

test("una pista distorsionada nunca puntúa aunque coincida con su paso canónico", () => {
  const authentic = createFoundClue("mud-prints", "inhabitant");
  const distorted = createFoundClue("caretaker-diary", "creature");
  const clues = new Map([[authentic.id, authentic], [distorted.id, distorted]]);
  const board = new Map([
    [1, { clueId: authentic.id, ownerId: "p1" }],
    [5, { clueId: distorted.id, ownerId: "p1" }]
  ]);
  const result = evaluateReconstruction(board, (_ownerId, clueId) => clues.get(clueId), "timeout", 2);
  assert.equal(result.score, 1);
  assert.equal(result.passed, false);
  assert.deepEqual(result.correctSlots, [1]);
  assert.equal(result.usedClues.find((item) => item.clueId === distorted.id).isAuthentic, false);
});

test("calcula todo el rango de 0 a 5 y aprueba únicamente desde cuatro", () => {
  const authentic = ["mud-prints", "western-window", "stopped-clock", "altar", "caretaker-diary"]
    .map((objectId) => createFoundClue(objectId, "inhabitant"));
  const clues = new Map(authentic.map((clue) => [clue.id, clue]));
  for (let expected = 0; expected <= 5; expected += 1) {
    const board = new Map(authentic.slice(0, expected).map((clue, index) => [index + 1, { clueId: clue.id, ownerId: "p1" }]));
    const result = evaluateReconstruction(board, (_ownerId, clueId) => clues.get(clueId), "timeout", expected);
    assert.equal(result.score, expected);
    assert.equal(result.passed, expected >= 4);
  }
});

test("reconecta con tablero y confirmación propios sin serializar metadatos de evaluación", () => {
  const { service, sockets, sessions, roomCode } = createDiscussion(3, { reconnectGraceMs: 1_000 });
  service.placeReconstructionClue(sockets[0], "exploration:mud-prints", 1, 0);
  service.confirmReconstruction(sockets[1], 1);
  service.disconnectBySocket(sockets[1]);
  service.restoreSession(roomCode, sessions[1].playerId, sessions[1].reconnectToken, "socket-2-restored");
  const restored = service.getPrivateGameStateBySocket("socket-2-restored");
  assert.equal(restored.reconstructionConfirmationVersion, 1);
  assert.equal(restored.room.reconstruction.version, 1);
  assert.equal(restored.room.reconstruction.slots[0].clue.title, "Huellas sin regreso");
  const serializedPrivate = JSON.stringify(restored);
  assert.doesNotMatch(serializedPrivate, /isAuthentic|canonicalStep|suggestedStep|correctSlots|incorrectSlots|usedClues/);
  const cancelled = service.leaveBySocket(sockets[2]);
  assert.equal(cancelled.room.reconstruction, null);
  assert.equal(cancelled.room.state, "waiting");
  service.clear();
});
