import test from "node:test";
import assert from "node:assert/strict";
import { countVotes } from "../server/game/countVotes.js";
import { RoomService } from "../server/services/roomService.js";

function assertCode(error, code) { assert.equal(error.code, code); return true; }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function deterministicRoles(ids) {
  return new Map(ids.map((id, index) => [id, index === 0 ? "creature" : index === 1 ? "investigator" : "inhabitant"]));
}

function createReadyService(options = {}, count = 3) {
  const service = new RoomService({ roleAssigner: deterministicRoles, explorationFinishedDelayMs: 0, discussionFinishedDelayMs: 1, votingStartDelayMs: 1, resultRevealDelayMs: 1, ...options });
  const host = service.createRoom("Inti", "socket-1");
  const names = ["Killa", "Amaru", "Sumaq", "Mayu", "Rumi"];
  const sessions = [host.session];
  for (let index = 2; index <= count; index += 1) sessions.push(service.joinRoom(host.room.code, names[index - 2], `socket-${index}`).session);
  const sockets = Array.from({ length: count }, (_, index) => `socket-${index + 1}`);
  service.startGame(sockets[0]);
  sockets.forEach((id) => service.confirmStory(id));
  sockets.forEach((id) => service.confirmRole(id));
  sockets.forEach((id) => service.confirmExplorationReady(id));
  service.finishExploration(host.room.code);
  return { service, sockets, sessions, roomCode: host.room.code };
}

async function beginVoting(setup, phases = []) {
  const callback = (phase, room, details) => phases.push({ phase, room, details });
  setup.service.startDiscussion(setup.sockets[0], callback);
  setup.service.finishDiscussion(setup.roomCode, callback);
  for (let attempt = 0; attempt < 80 && setup.service.getRoom(setup.roomCode).state !== "voting"; attempt += 1) await delay(1);
  assert.equal(setup.service.getRoom(setup.roomCode).state, "voting");
  return callback;
}

test("cuenta votos, abstenciones y empates sin admitir papeletas inválidas", () => {
  const result = countVotes({
    eligibleVoterIds: ["a", "b", "c", "d"],
    eligibleCandidateIds: ["a", "b", "c", "d"],
    votes: [["a", "b"], ["b", "a"], ["c", "b"]]
  });
  assert.equal(result.validVotes, 3);
  assert.equal(result.abstentions, 1);
  assert.equal(result.totals.get("b"), 2);
  assert.equal(result.selectedCandidateId, "b");
  const tie = countVotes({ eligibleVoterIds: ["a", "b", "c"], eligibleCandidateIds: ["a", "b", "c"], votes: [["a", "b"], ["b", "c"], ["c", "a"]] });
  assert.equal(tie.tied, true);
  assert.deepEqual(tie.topCandidateIds, ["a", "b", "c"]);
  assert.throws(() => countVotes({ eligibleVoterIds: ["a", "b"], eligibleCandidateIds: ["a", "b"], votes: [["a", "b"], ["a", "b"]] }), TypeError);
  assert.throws(() => countVotes({ eligibleVoterIds: ["a", "b"], eligibleCandidateIds: ["a", "b"], votes: [["a", "a"]] }), TypeError);
});

test("inicia automáticamente con un mismo endsAt y sin resultados parciales", async () => {
  const setup = createReadyService({ votingDurationMs: 60_000 });
  const phases = [];
  await beginVoting(setup, phases);
  const room = setup.service.getRoom(setup.roomCode);
  assert.equal(room.voting.durationSeconds, 60);
  assert.equal(room.voting.progress.confirmed, 0);
  assert.equal(room.voting.progress.total, 3);
  assert.equal(room.voting.candidates.length, 3);
  assert.equal(room.result, null);
  assert.deepEqual(phases.map((item) => item.phase), ["discussion_finished", "ready_for_voting", "voting"]);
  assert.doesNotMatch(JSON.stringify(room), /roleAssignments|votesReceived|ballots|Criatura/);
  setup.service.clear();
});

test("rechaza voto propio, candidato inexistente, voto duplicado y socket ajeno", async () => {
  let now = 1_000;
  const setup = createReadyService({ nowProvider: () => now, voteRequestCooldownMs: 0 });
  await beginVoting(setup);
  const candidates = setup.service.getRoom(setup.roomCode).voting.candidates;
  const selfId = candidates.find((item) => item.name === "Inti").id;
  const guestId = candidates.find((item) => item.name === "Killa").id;
  assert.throws(() => setup.service.submitVote(setup.sockets[0], selfId), (error) => assertCode(error, "SELF_VOTE"));
  assert.throws(() => setup.service.submitVote(setup.sockets[0], "inexistente"), (error) => assertCode(error, "INVALID_CANDIDATE"));
  setup.service.submitVote(setup.sockets[0], guestId);
  assert.throws(() => setup.service.submitVote(setup.sockets[0], guestId), (error) => assertCode(error, "VOTE_ALREADY_SUBMITTED"));
  assert.throws(() => setup.service.submitVote("socket-ajeno", guestId), (error) => assertCode(error, "INVALID_SESSION"));
  setup.service.clear();
});

test("rechaza votos tardíos o fuera de estado", async () => {
  let now = 2_000;
  const setup = createReadyService({ nowProvider: () => now, votingDurationMs: 100, voteRequestCooldownMs: 0 });
  const candidateBeforeVoting = setup.service.getRoom(setup.roomCode).players[1].id;
  assert.throws(() => setup.service.submitVote(setup.sockets[0], candidateBeforeVoting), (error) => assertCode(error, "VOTE_CLOSED"));
  await beginVoting(setup);
  const room = setup.service.getRoom(setup.roomCode);
  now = room.voting.endsAt;
  assert.throws(() => setup.service.submitVote(setup.sockets[0], room.voting.candidates[1].id), (error) => assertCode(error, "VOTE_CLOSED"));
  setup.service.clear();
});

test("el último voto y el temporizador no pueden cerrar la misma ronda dos veces", async () => {
  const setup = createReadyService({ votingDurationMs: 100, voteRequestCooldownMs: 0 });
  const callback = await beginVoting(setup);
  const [first, second, third] = setup.service.getRoom(setup.roomCode).voting.candidates;
  setup.service.submitVote(setup.sockets[0], second.id, callback);
  setup.service.submitVote(setup.sockets[1], first.id, callback);
  setup.service.submitVote(setup.sockets[2], first.id, callback);
  assert.equal(setup.service.rooms.get(setup.roomCode).voteRoundHistory.length, 1);
  assert.equal(setup.service.closeVoting(setup.roomCode, callback), null);
  await delay(110);
  assert.equal(setup.service.rooms.get(setup.roomCode).voteRoundHistory.length, 1);
  setup.service.clear();
});

test("mantiene serialización segura antes del resultado y revela solo el DTO final", async () => {
  const setup = createReadyService({ voteRequestCooldownMs: 0 });
  const callback = await beginVoting(setup);
  const votingJson = JSON.stringify(setup.service.getRoom(setup.roomCode));
  assert.doesNotMatch(votingJson, /roleAssignments|reconnectToken|socketId|ballots|votesReceived|creatureName/);
  const [creature, investigator] = setup.service.getRoom(setup.roomCode).voting.candidates;
  setup.service.submitVote(setup.sockets[0], investigator.id, callback);
  setup.service.submitVote(setup.sockets[1], creature.id, callback);
  setup.service.submitVote(setup.sockets[2], creature.id, callback);
  await delay(5);
  const finished = setup.service.getRoom(setup.roomCode);
  assert.equal(finished.state, "game_finished");
  const resultJson = JSON.stringify(finished.result);
  assert.match(resultJson, /creatureName|ballots|votesReceived/);
  assert.doesNotMatch(resultJson, /reconnectToken|socketId|playerId|candidateId|voterId/);
  assert.deepEqual(setup.service.getRoom(setup.roomCode).result, finished.result);
  setup.service.clear();
});

test("da victoria al pueblo al identificar a la criatura y revela roles solo al final", async () => {
  const setup = createReadyService({ voteRequestCooldownMs: 0 });
  const callback = await beginVoting(setup);
  const candidates = setup.service.getRoom(setup.roomCode).voting.candidates;
  const [creature, investigator, inhabitant] = candidates;
  setup.service.submitVote(setup.sockets[0], investigator.id, callback);
  setup.service.submitVote(setup.sockets[1], creature.id, callback);
  setup.service.submitVote(setup.sockets[2], creature.id, callback);
  assert.equal(setup.service.getRoom(setup.roomCode).state, "calculating_result");
  assert.equal(setup.service.getRoom(setup.roomCode).result, null);
  await delay(5);
  const room = setup.service.getRoom(setup.roomCode);
  assert.equal(room.state, "game_finished");
  assert.equal(room.result.winner, "village");
  assert.equal(room.result.creatureName, "Inti");
  assert.equal(room.result.selectedPlayerName, "Inti");
  assert.deepEqual(room.result.players.map((player) => player.role.name).sort(), ["Criatura", "Habitante", "Investigador"].sort());
  assert.match(room.result.storyConclusion, /ventana occidental/);
  setup.service.clear();
});

test("da victoria a la criatura cuando el pueblo acusa a un inocente", async () => {
  const setup = createReadyService({ voteRequestCooldownMs: 0 });
  const callback = await beginVoting(setup);
  const [creature, investigator, inhabitant] = setup.service.getRoom(setup.roomCode).voting.candidates;
  setup.service.submitVote(setup.sockets[0], investigator.id, callback);
  setup.service.submitVote(setup.sockets[1], inhabitant.id, callback);
  setup.service.submitVote(setup.sockets[2], investigator.id, callback);
  await delay(5);
  const result = setup.service.getRoom(setup.roomCode).result;
  assert.equal(result.winner, "creature");
  assert.equal(result.selectedPlayerName, "Killa");
  assert.equal(result.persistentTie, false);
  setup.service.clear();
});

test("ejecuta un desempate, restringe candidatos y puede resolverlo", async () => {
  const setup = createReadyService({ voteRequestCooldownMs: 0 });
  const callback = await beginVoting(setup);
  const [creature, investigator] = setup.service.getRoom(setup.roomCode).voting.candidates;
  setup.service.submitVote(setup.sockets[0], investigator.id, callback);
  setup.service.submitVote(setup.sockets[1], creature.id, callback);
  setup.service.closeVoting(setup.roomCode, callback);
  let room = setup.service.getRoom(setup.roomCode);
  assert.equal(room.state, "vote_tiebreaker");
  assert.deepEqual(room.voting.candidates.map((item) => item.name), ["Inti", "Killa"]);
  assert.throws(() => setup.service.submitVote(setup.sockets[2], room.players[2].id, callback), (error) => assertCode(error, "INVALID_CANDIDATE"));
  setup.service.submitVote(setup.sockets[0], investigator.id, callback);
  setup.service.submitVote(setup.sockets[1], creature.id, callback);
  setup.service.submitVote(setup.sockets[2], creature.id, callback);
  await delay(5);
  room = setup.service.getRoom(setup.roomCode);
  assert.equal(room.result.winner, "village");
  assert.equal(room.result.tiebreakerUsed, true);
  assert.equal(room.result.rounds.length, 2);
  setup.service.clear();
});

test("un empate persistente y las abstenciones dan la victoria a la criatura", async () => {
  const setup = createReadyService({ votingDurationMs: 15, tiebreakerDurationMs: 15, resultRevealDelayMs: 1 });
  await beginVoting(setup);
  await delay(80);
  const room = setup.service.getRoom(setup.roomCode);
  assert.equal(room.state, "game_finished");
  assert.equal(room.result.winner, "creature");
  assert.equal(room.result.persistentTie, true);
  assert.equal(room.result.rounds[0].abstentions, 3);
  assert.equal(room.result.rounds[1].abstentions, 3);
  setup.service.clear();
});

test("reconecta conservando el voto y no permite votar otra vez", async () => {
  const setup = createReadyService({ reconnectGraceMs: 1_000, voteRequestCooldownMs: 0 });
  const callback = await beginVoting(setup);
  const candidate = setup.service.getRoom(setup.roomCode).voting.candidates[0];
  setup.service.submitVote(setup.sockets[1], candidate.id, callback);
  setup.service.disconnectBySocket(setup.sockets[1]);
  setup.service.restoreSession(setup.sessions[1].roomCode, setup.sessions[1].playerId, setup.sessions[1].reconnectToken, "socket-2-restored");
  assert.equal(setup.service.getPrivateGameStateBySocket("socket-2-restored").hasVoted, true);
  assert.throws(() => setup.service.submitVote("socket-2-restored", candidate.id, callback), (error) => assertCode(error, "VOTE_ALREADY_SUBMITTED"));
  setup.service.clear();
});

test("volver a jugar requiere anfitrión y limpia por completo la partida", async () => {
  const setup = createReadyService({ votingDurationMs: 10, tiebreakerDurationMs: 10, resultRevealDelayMs: 1 });
  await beginVoting(setup);
  for (let attempt = 0; attempt < 80 && setup.service.getRoom(setup.roomCode).state !== "game_finished"; attempt += 1) await delay(1);
  assert.equal(setup.service.getRoom(setup.roomCode).state, "game_finished");
  assert.throws(() => setup.service.playAgain(setup.sockets[1]), (error) => assertCode(error, "NOT_HOST"));
  const reset = setup.service.playAgain(setup.sockets[0]);
  assert.equal(reset.state, "waiting");
  assert.equal(reset.story, null);
  assert.equal(reset.voting, null);
  assert.equal(reset.result, null);
  assert.equal(reset.players.length, 3);
  setup.service.startGame(setup.sockets[0]);
  assert.equal(setup.service.getRoom(setup.roomCode).state, "story");
  setup.service.clear();
});
