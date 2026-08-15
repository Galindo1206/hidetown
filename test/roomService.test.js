import test from "node:test";
import assert from "node:assert/strict";
import { RoomService } from "../server/services/roomService.js";
import { generateRoomCode } from "../server/utils/roomCode.js";
import { validateName, validateRoomCode } from "../server/utils/validators.js";

function assertCode(error, code) {
  assert.equal(error.code, code);
  return true;
}

test("los códigos generados son válidos y evitan caracteres confusos", () => {
  const codes = Array.from({ length: 100 }, () => generateRoomCode());
  for (const code of codes) {
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(validateRoomCode(code), code);
  }
});

test("las salas activas siempre reciben códigos distintos", () => {
  const service = new RoomService();
  const codes = new Set();
  for (let number = 0; number < 200; number += 1) {
    codes.add(service.createRoom(`Jugador ${number}`, `socket-${number}`).room.code);
  }
  assert.equal(codes.size, 200);
  service.clear();
});

test("normaliza nombres y rechaza vacío, HTML y caracteres inválidos", () => {
  assert.equal(validateName("  María   Luz  "), "María Luz");
  assert.throws(() => validateName(""), (error) => assertCode(error, "INVALID_NAME"));
  assert.throws(() => validateName("<b>Inti</b>"), (error) => assertCode(error, "INVALID_NAME"));
  assert.throws(() => validateName("a"), (error) => assertCode(error, "INVALID_NAME"));
});

test("crea, une, evita duplicados y limita la sala a seis jugadores", () => {
  const service = new RoomService();
  const host = service.createRoom("Inti", "socket-1");
  assert.equal(host.room.players.length, 1);
  assert.equal(host.room.players[0].isHost, true);

  assert.throws(
    () => service.joinRoom(host.room.code, "  INTI  ", "duplicate"),
    (error) => assertCode(error, "DUPLICATE_NAME")
  );
  for (let number = 2; number <= 6; number += 1) {
    service.joinRoom(host.room.code, `Jugador ${number}`, `socket-${number}`);
  }
  assert.equal(service.getRoom(host.room.code).players.length, 6);
  assert.throws(
    () => service.joinRoom(host.room.code, "Jugador 7", "socket-7"),
    (error) => assertCode(error, "ROOM_FULL")
  );
  service.clear();
});

test("valida permisos y estado antes de iniciar o reiniciar", () => {
  const service = new RoomService();
  const host = service.createRoom("Inti", "host");
  service.joinRoom(host.room.code, "Killa", "guest-1");
  assert.throws(() => service.startRoom("host"), (error) => assertCode(error, "NOT_ENOUGH_PLAYERS"));
  service.joinRoom(host.room.code, "Amaru", "guest-2");
  assert.throws(() => service.startRoom("guest-1"), (error) => assertCode(error, "NOT_HOST"));

  const started = service.startRoom("host");
  assert.equal(started.state, "story");
  assert.throws(
    () => service.joinRoom(host.room.code, "Sumaq", "guest-3"),
    (error) => assertCode(error, "ROOM_STARTED")
  );
  assert.throws(() => service.resetRoom("guest-1"), (error) => assertCode(error, "NOT_HOST"));
  assert.equal(service.resetRoom("host").state, "waiting");
  service.clear();
});

test("impide iniciar mientras haya un jugador desconectado", () => {
  const service = new RoomService({ reconnectGraceMs: 1_000 });
  const host = service.createRoom("Inti", "host");
  service.joinRoom(host.room.code, "Killa", "guest-1");
  service.joinRoom(host.room.code, "Amaru", "guest-2");
  service.disconnectBySocket("guest-2");
  assert.throws(() => service.startRoom("host"), (error) => assertCode(error, "PLAYERS_DISCONNECTED"));
  service.clear();
});

test("restaura una identidad sin depender del Socket ID", async () => {
  const service = new RoomService({ reconnectGraceMs: 25 });
  const host = service.createRoom("Inti", "host-old");
  const guest = service.joinRoom(host.room.code, "Killa", "guest-old");
  service.disconnectBySocket("guest-old");
  assert.equal(service.getRoom(host.room.code).players[1].connected, false);

  const restored = service.restoreSession(
    guest.session.roomCode,
    guest.session.playerId,
    guest.session.reconnectToken,
    "guest-new"
  );
  assert.equal(restored.room.players[1].connected, true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(service.getRoom(host.room.code).players.length, 2);
  assert.throws(
    () => service.restoreSession(host.room.code, guest.session.playerId, "x".repeat(43), "attacker"),
    (error) => assertCode(error, "RECONNECTION_FAILED")
  );
  service.clear();
});

test("elimina al desconectado al vencer el plazo, transfiere anfitrión y borra salas vacías", async () => {
  const service = new RoomService({ reconnectGraceMs: 20 });
  const host = service.createRoom("Inti", "host");
  const guest = service.joinRoom(host.room.code, "Killa", "guest");
  let result;
  service.disconnectBySocket("host", (expired) => { result = expired; });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.ok(result);
  assert.equal(result.hostChanged, true);
  assert.equal(result.newHostId, guest.session.playerId);
  assert.equal(service.getRoom(host.room.code).players[0].isHost, true);

  const finalLeave = service.leaveBySocket("guest");
  assert.equal(finalLeave.deleted, true);
  assert.equal(service.getRoomCount(), 0);
});

test("regenera un código si encuentra una colisión activa", () => {
  const sequence = ["ABC234", "ABC234", "DEF567"];
  const service = new RoomService({ codeGenerator: () => sequence.shift() });
  assert.equal(service.createRoom("Inti", "one").room.code, "ABC234");
  assert.equal(service.createRoom("Killa", "two").room.code, "DEF567");
  service.clear();
});
