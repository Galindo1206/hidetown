import test from "node:test";
import assert from "node:assert/strict";
import { io as createClient } from "socket.io-client";
import { createGameServer } from "../server/server.js";

function once(socket, eventName, timeout = 2_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No llegó ${eventName}`)), timeout);
    socket.once(eventName, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

function request(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(2_000).emit(eventName, payload, (timeoutError, response) => {
      if (timeoutError) reject(timeoutError);
      else if (!response?.ok) reject(new Error(`${eventName}: ${response?.error?.code || "ERROR"}`));
      else resolve(response.data);
    });
  });
}

test("anfitrión y cinco clientes reciben el mapa y un cliente tardío lo restaura desde game:state", async (context) => {
  const server = createGameServer({
    logger: { error() {}, log() {}, info() {} },
    config: {
      host: "127.0.0.1", port: 0, reconnectGraceMs: 1_000,
      rateLimitWindowMs: 1_000, rateLimitMaxActions: 100,
      explorationDurationSeconds: 0.5, explorationSearchMs: 20,
      explorationFinishedDelayMs: 10, discussionDurationSeconds: 0.3,
      discussionFinishedDelayMs: 10, votingStartDelayMs: 10,
      votingDurationSeconds: 3, tiebreakerDurationSeconds: 2,
      resultRevealDelayMs: 10, voteRequestCooldownMs: 0
    }
  });
  await server.start({ host: "127.0.0.1", port: 0 });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const clients = [];
  context.after(async () => {
    clients.forEach((client) => client.disconnect());
    await server.stop();
  });

  async function connect() {
    const client = createClient(origin, { transports: ["websocket"], forceNew: true, reconnection: false });
    clients.push(client);
    if (!client.connected) await once(client, "connect");
    return client;
  }

  const active = [await connect()];
  const created = await request(active[0], "room:create", { name: "Jugador 1" });
  const sessions = [created.session];
  for (let index = 2; index <= 6; index += 1) {
    const client = await connect();
    active.push(client);
    const joined = await request(client, "room:join", { code: created.room.code, name: `Jugador ${index}` });
    sessions.push(joined.session);
  }

  await request(active[0], "game:start");
  for (const client of active) await request(client, "story:confirm");
  for (const client of active) await request(client, "role:confirm");

  const startCounts = Array(6).fill(0);
  const startedForAll = active.map((client, index) => new Promise((resolve) => {
    client.on("exploration:started", (payload) => { startCounts[index] += 1; resolve(payload); });
  }));
  for (const client of active) await request(client, "exploration:ready");
  const starts = await Promise.all(startedForAll);
  assert.equal(starts.every(({ room }) => room.state === "exploration" && room.players.length === 6), true);
  assert.deepEqual(startCounts, [1, 1, 1, 1, 1, 1]);
  assert.equal(new Set(starts.map(({ room }) => room.exploration.endsAt)).size, 1);
  const readyForDiscussionPromise = once(active[0], "game:ready-for-discussion", 2_000);

  active[4].disconnect();
  const restoredClient = await connect();
  const restoredStatePromise = once(restoredClient, "game:state");
  const restored = await request(restoredClient, "room:restore", sessions[4]);
  const restoredState = await restoredStatePromise;

  assert.equal(restored.room.state, "exploration");
  assert.equal(restoredState.room.state, "exploration");
  assert.equal(restoredState.room.players.length, 6);
  assert.ok(restoredState.room.exploration.endsAt > Date.now());
  assert.equal(restoredState.exploration.sceneId, "village");
  assert.equal(Number.isFinite(restoredState.exploration.x), true);
  assert.equal(Number.isFinite(restoredState.exploration.y), true);
  assert.deepEqual(restoredState.exploration.investigatedObjectIds, []);
  assert.ok(Array.isArray(restoredState.clues.cards));
  assert.equal(typeof restoredState.clues.instructions, "string");
  assert.equal(Number.isFinite(restoredState.serverTime), true);

  assert.equal((await readyForDiscussionPromise).room.state, "ready_for_discussion");
  const readyForVotingPromise = once(active[0], "game:ready-for-voting", 2_000);
  const votingStartedPromise = once(active[0], "voting:started", 2_000);
  await request(active[0], "discussion:start");
  assert.equal((await readyForVotingPromise).room.state, "ready_for_voting");
  const votingStarted = await votingStartedPromise;
  assert.equal(votingStarted.room.state, "voting");

  const voters = [active[0], active[1], active[2], active[3], restoredClient, active[5]];
  const resultPromise = once(active[0], "game:result", 2_000);
  for (let index = 0; index < voters.length; index += 1) {
    const candidateId = index === 0 ? sessions[1].playerId : sessions[0].playerId;
    await request(voters[index], "vote:submit", { candidateId });
  }
  assert.equal((await resultPromise).room.state, "game_finished");

  const resetPromise = once(active[1], "game:reset");
  const reset = await request(active[0], "game:play-again");
  assert.equal(reset.state, "waiting");
  assert.equal(reset.exploration, null);
  assert.equal((await resetPromise).room.state, "waiting");
});
