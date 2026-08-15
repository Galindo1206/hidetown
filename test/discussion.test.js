import test from "node:test";
import assert from "node:assert/strict";
import { RoomService } from "../server/services/roomService.js";
import { validateChatMessage } from "../server/chat/messageValidator.js";

function assertCode(error, code) {
  assert.equal(error.code, code);
  return true;
}

async function waitUntil(predicate, timeoutMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(predicate(), true, "La transición esperada no ocurrió dentro del plazo de prueba.");
}

function createReadyService(options = {}, count = 3) {
  const service = new RoomService({ explorationFinishedDelayMs: 0, ...options });
  const host = service.createRoom("Inti", "socket-1");
  const names = ["Killa", "Amaru", "Sumaq", "Mayu", "Rumi"];
  const joined = [];
  for (let index = 2; index <= count; index += 1) joined.push(service.joinRoom(host.room.code, names[index - 2], `socket-${index}`));
  const sockets = Array.from({ length: count }, (_, index) => `socket-${index + 1}`);
  service.startGame(sockets[0]);
  sockets.forEach((socketId) => service.confirmStory(socketId));
  sockets.forEach((socketId) => service.confirmRole(socketId));
  sockets.forEach((socketId) => service.confirmExplorationReady(socketId));
  service.finishExploration(host.room.code);
  return { service, sockets, roomCode: host.room.code, sessions: [host.session, ...joined.map((result) => result.session)] };
}

test("valida y normaliza mensajes sin interpretar HTML", () => {
  assert.equal(validateChatMessage("  una pista  "), "una pista");
  assert.equal(validateChatMessage("<script>alert(1)</script>"), "<script>alert(1)</script>");
  assert.throws(() => validateChatMessage("   \n "), (error) => assertCode(error, "CHAT_EMPTY"));
  assert.throws(() => validateChatMessage("x".repeat(301)), (error) => assertCode(error, "CHAT_TOO_LONG"));
  assert.throws(() => validateChatMessage({ text: "hola" }), (error) => assertCode(error, "INVALID_PAYLOAD"));
});

test("solo el anfitrión inicia una vez y el servidor fija el mismo tiempo final", () => {
  let now = 10_000;
  const preliminary = new RoomService({ nowProvider: () => now });
  const room = preliminary.createRoom("Inti", "pre-1");
  preliminary.joinRoom(room.room.code, "Killa", "pre-2");
  preliminary.joinRoom(room.room.code, "Amaru", "pre-3");
  assert.throws(() => preliminary.startDiscussion("pre-1"), (error) => assertCode(error, "INVALID_STATE"));
  preliminary.clear();

  const { service, sockets } = createReadyService({ discussionDurationMs: 240_000, nowProvider: () => now });
  assert.throws(() => service.startDiscussion(sockets[1]), (error) => assertCode(error, "NOT_HOST"));
  const started = service.startDiscussion(sockets[0]);
  assert.equal(started.room.state, "discussion");
  assert.equal(started.room.discussion.startedAt, 10_000);
  assert.equal(started.room.discussion.endsAt, 250_000);
  assert.equal(started.room.discussion.durationSeconds, 240);
  now += 5_000;
  const duplicate = service.startDiscussion(sockets[0]);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.room.discussion.endsAt, 250_000);
  service.clear();
});

test("deriva identidad del servidor, limita frecuencia y rechaza fuera de discussion", () => {
  let now = 1_000;
  const { service, sockets } = createReadyService({ nowProvider: () => now, chatCooldownMs: 750 });
  assert.throws(() => service.sendChatMessage(sockets[0], "antes"), (error) => assertCode(error, "CHAT_CLOSED"));
  service.startDiscussion(sockets[0]);
  const first = service.sendChatMessage(sockets[1], "  <b>Encontré barro</b>  ");
  assert.equal(first.senderName, "Killa");
  assert.equal(first.text, "<b>Encontré barro</b>");
  assert.equal(Object.hasOwn(first, "roomCode"), false);
  assert.throws(() => service.sendChatMessage(sockets[1], "muy rápido"), (error) => assertCode(error, "CHAT_RATE_LIMITED"));
  now += 750;
  assert.equal(service.sendChatMessage(sockets[1], "segundo").senderId, first.senderId);
  assert.throws(() => service.sendChatMessage("socket-ajeno", "intrusión"), (error) => assertCode(error, "INVALID_SESSION"));
  service.clear();
});

test("acepta mensajes de todos los participantes entre 3 y 6 jugadores", () => {
  for (let count = 3; count <= 6; count += 1) {
    let now = 1_000;
    const { service, sockets } = createReadyService({ nowProvider: () => now, chatCooldownMs: 0, chatBurstMax: 20 }, count);
    service.startDiscussion(sockets[0]);
    sockets.forEach((socketId, index) => {
      now += 1;
      service.sendChatMessage(socketId, `aporte ${index + 1}`);
    });
    assert.equal(service.getChatHistoryBySocket(sockets[0]).length, count);
    service.clear();
  }
});

test("aplica límite de ráfaga y conserva solamente los últimos 100 mensajes", () => {
  let now = 1_000;
  const burst = createReadyService({ nowProvider: () => now, chatCooldownMs: 0, chatBurstMax: 3 });
  burst.service.startDiscussion(burst.sockets[0]);
  for (let index = 0; index < 3; index += 1) burst.service.sendChatMessage(burst.sockets[0], `mensaje ${index}`);
  assert.throws(() => burst.service.sendChatMessage(burst.sockets[0], "spam"), (error) => assertCode(error, "CHAT_RATE_LIMITED"));
  burst.service.clear();

  const history = createReadyService({ nowProvider: () => now, chatCooldownMs: 0, chatBurstMax: 200, chatHistoryLimit: 100 });
  history.service.startDiscussion(history.sockets[0]);
  for (let index = 0; index < 105; index += 1) {
    now += 1;
    history.service.sendChatMessage(history.sockets[0], `mensaje ${index}`);
  }
  const messages = history.service.getChatHistoryBySocket(history.sockets[1]);
  assert.equal(messages.length, 100);
  assert.equal(messages[0].text, "mensaje 5");
  assert.equal(new Set(messages.map((message) => message.id)).size, 100);
  history.service.clear();
});

test("finaliza automáticamente una sola vez y bloquea chat y reinicio durante la transición", async () => {
  const phases = [];
  const { service, sockets, roomCode } = createReadyService({ discussionDurationMs: 25, discussionFinishedDelayMs: 10, chatCooldownMs: 0 });
  service.startDiscussion(sockets[0], (phase) => phases.push(phase));
  service.sendChatMessage(sockets[0], "mensaje temporal");
  assert.throws(() => service.resetGame(sockets[0]), (error) => assertCode(error, "INVALID_STATE"));
  await waitUntil(() => phases.includes("ready_for_voting"));
  assert.deepEqual(phases, ["discussion_finished", "ready_for_voting"]);
  assert.equal(service.getRoom(roomCode).state, "ready_for_voting");
  assert.throws(() => service.sendChatMessage(sockets[0], "demasiado tarde"), (error) => assertCode(error, "CHAT_CLOSED"));
  assert.equal(service.getChatHistoryBySocket(sockets[0]).length, 1);
  assert.throws(() => service.resetGame(sockets[0]), (error) => assertCode(error, "INVALID_STATE"));
  service.clear();
});

test("reconecta durante la conversación con el mismo final, historial y pistas propias", () => {
  let now = 50_000;
  const { service, sockets, sessions } = createReadyService({ reconnectGraceMs: 1_000, discussionDurationMs: 240_000, nowProvider: () => now, chatCooldownMs: 0 });
  service.startDiscussion(sockets[0]);
  service.sendChatMessage(sockets[0], "La cuerda estaba quieta");
  const original = service.getPrivateGameStateBySocket(sockets[1]);
  service.disconnectBySocket(sockets[1]);
  now += 30_000;
  service.restoreSession(sessions[1].roomCode, sessions[1].playerId, sessions[1].reconnectToken, "socket-2-restored");
  const restored = service.getPrivateGameStateBySocket("socket-2-restored");
  assert.equal(restored.room.discussion.endsAt, original.room.discussion.endsAt);
  assert.deepEqual(restored.clues, original.clues);
  assert.deepEqual(restored.chatHistory, original.chatHistory);
  assert.equal(restored.room.state, "discussion");
  service.clear();
});

test("el estado público omite historial y secretos, y cancelar limpia el temporizador", async () => {
  const phases = [];
  const { service, sockets, roomCode } = createReadyService({ discussionDurationMs: 25, discussionFinishedDelayMs: 5, chatCooldownMs: 0 });
  service.startDiscussion(sockets[0], (phase) => phases.push(phase));
  service.sendChatMessage(sockets[0], "SECRETO_DEL_CHAT");
  const serialized = JSON.stringify(service.getRoom(roomCode));
  assert.doesNotMatch(serialized, /SECRETO_DEL_CHAT|chatMessages|clueAssignments|roleAssignments|Recuerdo fragmentado/);
  const cancellation = service.leaveBySocket(sockets[2]);
  assert.equal(cancellation.gameCancelled, true);
  assert.equal(cancellation.room.state, "waiting");
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.deepEqual(phases, []);
  service.clear();
});
