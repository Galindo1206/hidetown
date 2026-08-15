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
      else resolve(response);
    });
  });
}

test("flujo real de historia, roles, exploración privada, reconexión, reinicio y cancelación", async (context) => {
  const server = createGameServer({
    logger: { error() {}, log() {} },
    config: {
      host: "127.0.0.1",
      port: 0,
      reconnectGraceMs: 500,
      rateLimitWindowMs: 1_000,
      rateLimitMaxActions: 50,
      explorationDurationSeconds: 0.8,
      explorationSearchMs: 20,
      explorationFinishedDelayMs: 10,
      discussionDurationSeconds: 0.7,
      discussionFinishedDelayMs: 10,
      votingStartDelayMs: 30,
      votingDurationSeconds: 1,
      tiebreakerDurationSeconds: 0.5,
      resultRevealDelayMs: 10,
      voteRequestCooldownMs: 0
    }
  });
  await server.start({ port: 0, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  const clients = [];
  context.after(async () => {
    clients.forEach((client) => client.disconnect());
    await server.stop();
  });

  async function connect() {
    const client = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });
    clients.push(client);
    if (!client.connected) await once(client, "connect");
    return client;
  }

  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}/package.json`)).status, 404);

  const host = await connect();
  const created = await request(host, "room:create", { name: "Inti" });
  const roomCode = created.data.room.code;
  const hostSession = created.data.session;
  const guest = await connect();
  const joinedGuest = await request(guest, "room:join", { code: roomCode, name: "Killa" });
  const guestSession = joinedGuest.data.session;
  const third = await connect();
  const joinedThird = await request(third, "room:join", { code: roomCode, name: "Amaru" });

  const duplicate = await connect();
  assert.equal((await request(duplicate, "room:join", { code: roomCode, name: " kIlLa " })).error.code, "DUPLICATE_NAME");
  assert.equal((await request(duplicate, "room:join", { code: "ZZZ999", name: "Sumaq" })).error.code, "ROOM_NOT_FOUND");
  assert.equal((await request(guest, "game:start")).error.code, "NOT_HOST");

  const publicPayloads = [];
  host.on("room:updated", (room) => publicPayloads.push(room));
  const storyEvents = [once(host, "story:presented"), once(guest, "story:presented"), once(third, "story:presented")];
  const started = await request(host, "game:start");
  assert.equal(started.ok, true);
  assert.equal(started.data.state, "story");
  for (const event of await Promise.all(storyEvents)) {
    assert.equal(event.story.id, "san-jeronimo");
    assert.equal(event.progress.storyConfirmed, 0);
  }
  assert.equal((await request(host, "game:start")).error.code, "INVALID_STATE");
  assert.equal((await request(duplicate, "room:join", { code: roomCode, name: "Sumaq" })).error.code, "ROOM_STARTED");

  const disconnectedDuringStory = once(host, "player:disconnected");
  guest.disconnect();
  await disconnectedDuringStory;
  const guestDuringStory = await connect();
  const restoredStory = await request(guestDuringStory, "room:restore", guestSession);
  assert.equal(restoredStory.data.room.state, "story");

  const firstStory = await request(host, "story:confirm");
  assert.equal(firstStory.data.progress.storyConfirmed, 1);
  const duplicateStory = await request(host, "story:confirm");
  assert.equal(duplicateStory.data.duplicate, true);
  assert.equal(duplicateStory.data.progress.storyConfirmed, 1);
  await request(guestDuringStory, "story:confirm");

  const hostRolePromise = once(host, "role:assigned");
  const guestRolePromise = once(guestDuringStory, "role:assigned");
  const thirdRolePromise = once(third, "role:assigned");
  const finalStory = await request(third, "story:confirm");
  assert.equal(finalStory.data.state, "role_reveal");
  const assignedRoles = await Promise.all([hostRolePromise, guestRolePromise, thirdRolePromise]);
  const roleIds = assignedRoles.map((role) => role.id);
  assert.deepEqual([...roleIds].sort(), ["creature", "inhabitant", "investigator"]);
  for (const role of assignedRoles) {
    assert.deepEqual(Object.keys(role).sort(), ["description", "icon", "id", "name", "objective", "theme"]);
    assert.equal(Array.isArray(role), false);
  }

  const guestOriginalRole = assignedRoles[1];
  const disconnectedDuringRole = once(host, "player:disconnected");
  guestDuringStory.disconnect();
  await disconnectedDuringRole;
  const guestDuringRole = await connect();
  const restoredRolePromise = once(guestDuringRole, "role:assigned");
  const restoredRoleState = await request(guestDuringRole, "room:restore", guestSession);
  assert.equal(restoredRoleState.data.room.state, "role_reveal");
  assert.deepEqual(await restoredRolePromise, guestOriginalRole);

  const firstRole = await request(host, "role:confirm");
  assert.equal(firstRole.data.state, "waiting_ready");
  const duplicateRole = await request(host, "role:confirm");
  assert.equal(duplicateRole.data.duplicate, true);
  assert.equal(duplicateRole.data.progress.roleConfirmed, 1);
  await request(guestDuringRole, "role:confirm");
  const waitingExploration = once(host, "exploration:waiting");
  const finalRole = await request(third, "role:confirm");
  assert.equal(finalRole.data.state, "ready_for_exploration");
  assert.equal((await waitingExploration).room.state, "ready_for_exploration");
  assert.equal((await request(host, "exploration:position", { sceneId: "village", x: 800, y: 690, direction: "down", isMoving: false })).error.code, "EXPLORATION_CLOSED");
  const firstReady = await request(host, "exploration:ready");
  assert.equal(firstReady.data.progress.explorationReady, 1);
  assert.equal((await request(host, "exploration:ready")).data.duplicate, true);
  await request(guestDuringRole, "exploration:ready");
  const explorationStarted = once(host, "exploration:started");
  await request(third, "exploration:ready");
  const startedExploration = await explorationStarted;
  assert.equal(startedExploration.room.state, "exploration");
  assert.ok(startedExploration.room.exploration.endsAt > startedExploration.room.exploration.startedAt);
  assert.equal(startedExploration.room.players.every((player) => player.zoneId === "square"), true);
  assert.equal((await request(host, "exploration:position", { sceneId: "invented", x: 800, y: 690, direction: "down", isMoving: false })).error.code, "INVALID_SCENE");
  assert.equal((await request(guestDuringRole, "exploration:investigate", { objectId: "ash-remains" })).error.code, "OBJECT_TOO_FAR");
  await new Promise((resolve) => setTimeout(resolve, 400));
  for (const client of [host, guestDuringRole, third]) {
    assert.equal((await request(client, "exploration:position", { sceneId: "village", x: 770, y: 680, direction: "up", isMoving: false })).ok, true);
  }

  const activeClients = [host, guestDuringRole, third];
  const cluePromises = activeClients.map((client) => once(client, "exploration:clue-found"));
  for (const client of activeClients) assert.equal((await request(client, "exploration:investigate", { objectId: "mud-prints" })).ok, true);
  const found = await Promise.all(cluePromises);
  found.forEach((payload, index) => {
    assert.equal(payload.clues.cards.length, 1);
    assert.equal(payload.clue.objectId, "mud-prints");
    if (roleIds[index] === "creature") assert.match(payload.clue.text, /segunda línea tenue/);
    else assert.match(payload.clue.text, /No existen huellas que regresen/);
  });
  const guestOriginalClues = found[1].clues;
  guestDuringRole.disconnect();
  const guestDuringClues = await connect();
  const restoredCluesPromise = once(guestDuringClues, "clues:assigned");
  const restoredClueStatePromise = once(guestDuringClues, "game:state");
  const restoredClues = await request(guestDuringClues, "room:restore", guestSession);
  assert.equal(restoredClues.data.room.state, "exploration");
  assert.deepEqual(await restoredCluesPromise, guestOriginalClues);
  const restoredPrivateState = await restoredClueStatePromise;
  assert.equal(restoredPrivateState.exploration.location, "square");
  assert.deepEqual(restoredPrivateState.exploration.investigatedObjectIds, ["mud-prints"]);

  const explorationFinished = once(host, "exploration:finished");
  const discussionEvent = once(host, "game:ready-for-discussion");
  assert.equal((await explorationFinished).room.state, "exploration_finished");
  assert.equal((await discussionEvent).room.state, "ready_for_discussion");

  assert.equal((await request(guestDuringClues, "discussion:start")).error.code, "NOT_HOST");
  const discussionStarts = [once(host, "discussion:started"), once(guestDuringClues, "discussion:started"), once(third, "discussion:started")];
  const discussionStart = await request(host, "discussion:start");
  assert.equal(discussionStart.ok, true);
  assert.equal(discussionStart.data.room.state, "discussion");
  const startedForAll = await Promise.all(discussionStarts);
  assert.equal(new Set(startedForAll.map((payload) => payload.room.discussion.endsAt)).size, 1);
  assert.equal((await request(host, "discussion:start")).data.duplicate, true);
  const boardUpdates = [once(host, "reconstruction:board-updated"), once(guestDuringClues, "reconstruction:board-updated"), once(third, "reconstruction:board-updated")];
  const placed = await request(host, "reconstruction:place", { clueId: "exploration:mud-prints", slot: 1, boardVersion: 0 });
  assert.equal(placed.ok, true);
  const sharedBoard = await Promise.all(boardUpdates);
  assert.equal(sharedBoard.every((payload) => payload.reconstruction.version === 1), true);
  assert.equal(sharedBoard[0].reconstruction.slots[0].clue.ownerName, "Inti");
  assert.doesNotMatch(JSON.stringify(sharedBoard), /isAuthentic|canonicalStep|suggestedStep/);
  assert.equal((await request(guestDuringClues, "reconstruction:remove", { clueId: "exploration:mud-prints", boardVersion: 1 })).error.code, "NOT_CLUE_OWNER");
  assert.equal((await request(host, "reconstruction:place", { clueId: "exploration:mud-prints", slot: 2, boardVersion: 0 })).error.code, "STALE_BOARD_VERSION");

  const unexpectedPayload = await request(host, "chat:send", { text: "mensaje", senderName: "Intruso", roomCode: "OTRA" });
  assert.equal(unexpectedPayload.error.code, "INVALID_PAYLOAD");
  const chatEvents = [once(host, "chat:message"), once(guestDuringClues, "chat:message"), once(third, "chat:message")];
  const sent = await request(host, "chat:send", { text: "<img src=x onerror=alert(1)>" });
  assert.equal(sent.ok, true);
  assert.equal(sent.data.senderName, "Inti");
  assert.equal(sent.data.text, "<img src=x onerror=alert(1)>");
  assert.equal(Object.hasOwn(sent.data, "roomCode"), false);
  const delivered = await Promise.all(chatEvents);
  assert.equal(new Set(delivered.map((message) => message.id)).size, 1);
  assert.equal((await request(third, "chat:send", { text: "   " })).error.code, "CHAT_EMPTY");
  assert.equal((await request(third, "chat:send", { text: "x".repeat(301) })).error.code, "CHAT_TOO_LONG");
  assert.equal((await request(host, "chat:send", { text: "spam inmediato" })).error.code, "CHAT_RATE_LIMITED");

  guestDuringClues.disconnect();
  const guestDuringDiscussion = await connect();
  const restoredDiscussionState = once(guestDuringDiscussion, "discussion:state");
  const restoredHistory = once(guestDuringDiscussion, "chat:history");
  const restoredDiscussionClues = once(guestDuringDiscussion, "clues:assigned");
  const restoredDiscussion = await request(guestDuringDiscussion, "room:restore", guestSession);
  assert.equal(restoredDiscussion.data.room.state, "discussion");
  const recoveredState = await restoredDiscussionState;
  assert.equal(recoveredState.room.discussion.endsAt, discussionStart.data.room.discussion.endsAt);
  assert.equal(recoveredState.room.reconstruction.slots[0].clue.ownerName, "Inti");
  assert.deepEqual(await restoredDiscussionClues, guestOriginalClues);
  assert.equal((await restoredHistory).messages[0].id, sent.data.id);

  const finishedEvent = once(host, "discussion:finished", 2_000);
  const reconstructionLocked = once(host, "reconstruction:locked", 2_000);
  const reconstructionResult = once(host, "reconstruction:result", 2_000);
  const finished = await finishedEvent;
  assert.equal(finished.room.state, "discussion_finished");
  assert.equal((await reconstructionLocked).reconstruction.locked, true);
  const reconstructionOutcome = await reconstructionResult;
  assert.equal(reconstructionOutcome.result.score >= 0 && reconstructionOutcome.result.score <= 5, true);
  assert.equal(Object.hasOwn(reconstructionOutcome.result, "correctSlots"), false);
  assert.equal((await request(host, "chat:send", { text: "fuera de tiempo" })).error.code, "CHAT_CLOSED");
  const votingEvent = await once(host, "game:ready-for-voting", 2_000);
  assert.equal(votingEvent.room.state, "ready_for_voting");
  const votingStarted = await once(host, "voting:started", 2_000);
  assert.equal(votingStarted.room.state, "voting");
  assert.equal(votingStarted.room.voting.progress.confirmed, 0);
  assert.equal(votingStarted.room.result, null);
  const candidateIds = [hostSession.playerId, guestSession.playerId, joinedThird.data.session.playerId];
  const creaturePlayerId = candidateIds[roleIds.indexOf("creature")];
  const voters = [host, guestDuringDiscussion, third];
  assert.equal((await request(host, "vote:submit", { candidateId: hostSession.playerId })).error.code, "SELF_VOTE");
  assert.equal((await request(host, "vote:submit", { candidateId: "inexistente" })).error.code, "INVALID_CANDIDATE");
  const resultPromise = once(host, "game:result", 2_000);
  for (let index = 0; index < voters.length; index += 1) {
    const candidateId = candidateIds[index] === creaturePlayerId ? candidateIds.find((id) => id !== creaturePlayerId) : creaturePlayerId;
    const response = await request(voters[index], "vote:submit", { candidateId });
    assert.equal(response.ok, true);
    assert.equal(Object.hasOwn(response.data.progress, "candidateId"), false);
    if (index === 0) assert.equal((await request(voters[index], "vote:submit", { candidateId })).error.code, "VOTE_ALREADY_SUBMITTED");
  }
  const gameResult = await resultPromise;
  assert.equal(gameResult.room.state, "game_finished");
  assert.equal(gameResult.result.winner, "creature");
  assert.equal(gameResult.result.outcomeCode, "CREATURE_SABOTAGED_STORY");
  assert.equal(gameResult.result.accusation.creatureIdentified, true);
  assert.equal(gameResult.result.reconstruction.passed, false);
  assert.equal(gameResult.result.players.length, 3);
  assert.equal(gameResult.result.rounds[0].ballots.length, 3);
  assert.doesNotMatch(JSON.stringify(gameResult.result), /socket-|reconnectToken|objective/);

  guestDuringDiscussion.disconnect();
  const guestAfterResult = await connect();
  const recoveredResultPromise = once(guestAfterResult, "game:result");
  const recoveredResult = await request(guestAfterResult, "room:restore", guestSession);
  assert.equal(recoveredResult.data.room.state, "game_finished");
  assert.deepEqual((await recoveredResultPromise).result, gameResult.result);

  const publicJson = JSON.stringify(publicPayloads);
  assert.doesNotMatch(publicJson, /roleAssignments|clueAssignments|reconnectToken|socketId|Permanece oculta entre|isAuthentic|suggestedStep|correctSlots|incorrectSlots|usedClues/);
  assert.equal((await request(guestAfterResult, "game:play-again")).error.code, "NOT_HOST");
  const resetEvent = once(third, "game:reset");
  const reset = await request(host, "game:play-again");
  assert.equal(reset.data.state, "waiting");
  assert.equal(reset.data.story, null);
  assert.equal(reset.data.evidence, null);
  assert.deepEqual(reset.data.progress, { storyConfirmed: 0, roleConfirmed: 0, explorationReady: 0, total: 3 });
  assert.equal((await resetEvent).room.state, "waiting");

  await request(host, "game:start");
  const cancellationEvent = once(host, "game:cancelled");
  third.disconnect();
  const cancellation = await cancellationEvent;
  assert.equal(cancellation.room.state, "waiting");
  assert.equal(cancellation.room.story, null);
  assert.match(cancellation.message, /cancelada/);
  assert.equal(cancellation.room.players.length, 2);

  assert.equal((await request(host, "room:leave")).ok, true);
  assert.equal((await request(guestAfterResult, "room:leave")).ok, true);
  assert.equal(server.roomService.getRoomCount(), 0);
  assert.ok(hostSession.playerId);
  assert.ok(joinedThird.data.session.playerId);
});
