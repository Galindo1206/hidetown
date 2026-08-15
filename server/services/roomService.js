import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { AppError } from "../utils/errors.js";
import { generateRoomCode } from "../utils/roomCode.js";
import { assignRoles } from "../game/assignRoles.js";
import { getRoleDefinition, toPrivateRole } from "../game/roleDefinitions.js";
import {
  cloneExplorationClues,
  createFoundClue,
  explorationInstructions,
  getAnalysisForObject,
  getExplorationObject,
  getExplorationZone,
  toPublicExplorationMap
} from "../game/explorationDefinitions.js";
import { validateChatMessage } from "../chat/messageValidator.js";
import { countVotes } from "../game/countVotes.js";
import { getStory, toPublicStory } from "../stories/index.js";
import {
  normalizeNameForComparison,
  validateName,
  validateRoomCode,
  validateSessionIdentifiers
} from "../utils/validators.js";

const ACTIVE_STATES = new Set([
  "story", "role_reveal", "waiting_ready", "ready_for_exploration", "exploration",
  "exploration_finished", "ready_for_discussion", "discussion",
  "discussion_finished", "ready_for_voting", "voting", "vote_tiebreaker",
  "calculating_result", "game_finished", "returning_to_lobby"
]);
const RESETTABLE_STATES = new Set([...ACTIVE_STATES].filter((state) => ![
  "discussion", "discussion_finished", "ready_for_voting", "voting", "vote_tiebreaker",
  "calculating_result", "game_finished", "returning_to_lobby"
].includes(state)));

export class RoomService {
  constructor({
    minPlayers = 3,
    maxPlayers = 6,
    reconnectGraceMs = 30_000,
    roomInactivityMs = 60 * 60_000,
    codeGenerator = generateRoomCode,
    roleAssigner = assignRoles,
    storyProvider = getStory,
    explorationDurationMs = 60_000,
    explorationReadyTimeoutMs = 30_000,
    explorationSearchMs = 3_000,
    explorationFinishedDelayMs = 1_200,
    discussionDurationMs = 240_000,
    discussionFinishedDelayMs = 900,
    chatCooldownMs = 750,
    chatBurstWindowMs = 10_000,
    chatBurstMax = 8,
    chatHistoryLimit = 100,
    votingDurationMs = 60_000,
    tiebreakerDurationMs = 30_000,
    votingStartDelayMs = 1_200,
    resultRevealDelayMs = 700,
    voteRequestCooldownMs = 250,
    nowProvider = Date.now
  } = {}) {
    this.minPlayers = minPlayers;
    this.maxPlayers = maxPlayers;
    this.reconnectGraceMs = reconnectGraceMs;
    this.roomInactivityMs = roomInactivityMs;
    this.codeGenerator = codeGenerator;
    this.roleAssigner = roleAssigner;
    this.storyProvider = storyProvider;
    this.explorationDurationMs = explorationDurationMs;
    this.explorationReadyTimeoutMs = explorationReadyTimeoutMs;
    this.explorationSearchMs = explorationSearchMs;
    this.explorationFinishedDelayMs = explorationFinishedDelayMs;
    this.discussionDurationMs = discussionDurationMs;
    this.discussionFinishedDelayMs = discussionFinishedDelayMs;
    this.chatCooldownMs = chatCooldownMs;
    this.chatBurstWindowMs = chatBurstWindowMs;
    this.chatBurstMax = chatBurstMax;
    this.chatHistoryLimit = chatHistoryLimit;
    this.votingDurationMs = votingDurationMs;
    this.tiebreakerDurationMs = tiebreakerDurationMs;
    this.votingStartDelayMs = votingStartDelayMs;
    this.resultRevealDelayMs = resultRevealDelayMs;
    this.voteRequestCooldownMs = voteRequestCooldownMs;
    this.nowProvider = nowProvider;
    this.rooms = new Map();
    this.socketIndex = new Map();
  }

  createRoom(rawName, socketId) {
    this.assertSocketAvailable(socketId);
    const name = validateName(rawName);
    const code = this.createUniqueCode();
    const player = this.createPlayer(name, socketId);
    const room = {
      code,
      state: "waiting",
      hostId: player.id,
      createdAt: this.nowProvider(),
      lastActivityAt: this.nowProvider(),
      players: new Map([[player.id, player]]),
      story: null,
      evidence: null,
      roleAssignments: new Map(),
      clueAssignments: new Map(),
      storyConfirmed: new Set(),
      roleConfirmed: new Set(),
      explorationReady: new Set(),
      explorationPlayers: new Map(),
      explorationStartedAt: null,
      explorationEndsAt: null,
      explorationReadyTimeoutAt: null,
      explorationReadyTimer: null,
      explorationTimer: null,
      explorationTransitionTimer: null,
      discussionStartedAt: null,
      discussionEndsAt: null,
      discussionTimer: null,
      discussionTransitionTimer: null,
      chatMessages: [],
      chatRate: new Map(),
      gameParticipants: new Map(),
      votingRound: null,
      votingStartedAt: null,
      votingEndsAt: null,
      votingStartTimer: null,
      votingTimer: null,
      resultTimer: null,
      voteEligibleVoterIds: [],
      voteCandidateIds: [],
      votes: new Map(),
      voteRequestAt: new Map(),
      voteRoundHistory: [],
      finalResult: null
    };
    this.rooms.set(code, room);
    this.socketIndex.set(socketId, { roomCode: code, playerId: player.id });
    return this.createJoinResult(room, player);
  }

  joinRoom(rawCode, rawName, socketId) {
    this.assertSocketAvailable(socketId);
    const code = validateRoomCode(rawCode);
    const name = validateName(rawName);
    const room = this.getRoomOrThrow(code);
    if (room.state !== "waiting") throw new AppError("ROOM_STARTED");
    if (room.players.size >= this.maxPlayers) throw new AppError("ROOM_FULL");
    const normalizedName = normalizeNameForComparison(name);
    if ([...room.players.values()].some((player) => player.normalizedName === normalizedName)) {
      throw new AppError("DUPLICATE_NAME");
    }
    const player = this.createPlayer(name, socketId);
    room.players.set(player.id, player);
    this.touchRoom(room);
    this.socketIndex.set(socketId, { roomCode: code, playerId: player.id });
    return this.createJoinResult(room, player);
  }

  restoreSession(rawCode, rawPlayerId, rawReconnectToken, socketId) {
    this.assertSocketAvailable(socketId);
    const code = validateRoomCode(rawCode);
    const { playerId, reconnectToken } = validateSessionIdentifiers(rawPlayerId, rawReconnectToken);
    const room = this.getRoomOrThrow(code, "SESSION_EXPIRED");
    const player = room.players.get(playerId);
    if (!player || !player.reconnectToken || !this.tokensMatch(player.reconnectToken, reconnectToken)) throw new AppError("RECONNECTION_FAILED");

    const previousSocketId = player.socketId;
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    if (previousSocketId) this.socketIndex.delete(previousSocketId);
    player.connected = true;
    player.socketId = socketId;
    player.disconnectedAt = null;
    player.reconnectDeadline = null;
    player.disconnectTimer = null;
    this.socketIndex.set(socketId, { roomCode: code, playerId });
    this.touchRoom(room);

    let hostChanged = false;
    if (!room.hostId) {
      room.hostId = player.id;
      hostChanged = true;
    }
    return { ...this.createJoinResult(room, player), previousSocketId, hostChanged };
  }

  leaveBySocket(socketId) {
    const reference = this.socketIndex.get(socketId);
    if (!reference) throw new AppError("INVALID_SESSION");
    return this.removePlayer(reference.roomCode, reference.playerId);
  }

  disconnectBySocket(socketId, onExpired) {
    const reference = this.socketIndex.get(socketId);
    if (!reference) return null;
    const room = this.rooms.get(reference.roomCode);
    const player = room?.players.get(reference.playerId);
    this.socketIndex.delete(socketId);
    if (!room || !player || player.socketId !== socketId) return null;

    player.connected = false;
    player.socketId = null;
    const disconnectedAt = this.nowProvider();
    const reconnectDeadline = disconnectedAt + this.reconnectGraceMs;
    player.disconnectedAt = disconnectedAt;
    player.reconnectDeadline = reconnectDeadline;
    this.touchRoom(room);
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(reference.roomCode);
      const currentPlayer = currentRoom?.players.get(reference.playerId);
      if (!currentPlayer || currentPlayer.connected || currentPlayer.reconnectDeadline !== reconnectDeadline) return;
      const result = this.removePlayer(reference.roomCode, reference.playerId);
      if (typeof onExpired === "function") onExpired(result);
    }, this.reconnectGraceMs);
    player.disconnectTimer.unref?.();
    return { room: this.toPublicRoom(room), playerId: player.id, reconnectDeadline };
  }

  startGame(socketId) {
    const { room, player } = this.getContextBySocket(socketId);
    if (room.hostId !== player.id) throw new AppError("NOT_HOST");
    if (room.state !== "waiting") throw new AppError("INVALID_STATE");
    if (room.players.size < this.minPlayers) throw new AppError("NOT_ENOUGH_PLAYERS");
    if (room.players.size > this.maxPlayers) throw new AppError("ROOM_FULL");
    if ([...room.players.values()].some((item) => !item.connected)) throw new AppError("PLAYERS_DISCONNECTED");

    const story = this.storyProvider("san-jeronimo");
    if (!story) throw new AppError("INTERNAL_ERROR");
    room.story = story;
    room.gameParticipants = new Map([...room.players.values()].map((item) => [item.id, {
      id: item.id,
      name: item.name,
      joinedAt: item.joinedAt
    }]));
    room.roleAssignments = this.roleAssigner([...room.players.keys()]);
    room.storyConfirmed.clear();
    room.roleConfirmed.clear();
    room.explorationReady.clear();
    room.evidence = null;
    room.clueAssignments.clear();
    room.state = "story";
    return this.toPublicRoom(room);
  }

  startRoom(socketId) {
    return this.startGame(socketId);
  }

  confirmStory(socketId) {
    const { room, player } = this.getContextBySocket(socketId);
    if (room.storyConfirmed.has(player.id)) {
      return { room: this.toPublicRoom(room), duplicate: true, transitioned: false };
    }
    if (room.state !== "story") throw new AppError("INVALID_STATE");
    room.storyConfirmed.add(player.id);
    const transitioned = room.storyConfirmed.size === room.players.size;
    if (transitioned) room.state = "role_reveal";
    return { room: this.toPublicRoom(room), duplicate: false, transitioned };
  }

  confirmRole(socketId, onPhaseChange) {
    const { room, player } = this.getContextBySocket(socketId);
    if (room.roleConfirmed.has(player.id)) {
      return { room: this.toPublicRoom(room), duplicate: true, readyForExploration: false };
    }
    if (!["role_reveal", "waiting_ready"].includes(room.state) || !room.roleAssignments.has(player.id)) {
      throw new AppError("INVALID_STATE");
    }
    room.roleConfirmed.add(player.id);
    const readyForExploration = room.roleConfirmed.size === room.players.size;
    room.state = readyForExploration ? "ready_for_exploration" : "waiting_ready";
    if (readyForExploration) this.prepareExploration(room, onPhaseChange);
    return { room: this.toPublicRoom(room), duplicate: false, readyForExploration };
  }

  confirmExplorationReady(socketId, onPhaseChange) {
    const { room, player } = this.getContextBySocket(socketId);
    if (room.explorationReady.has(player.id)) return { room: this.toPublicRoom(room), duplicate: true, started: false };
    if (room.state !== "ready_for_exploration") throw new AppError("INVALID_STATE");
    room.explorationReady.add(player.id);
    const started = room.explorationReady.size === room.players.size;
    const publicRoom = started ? this.startExploration(room.code, onPhaseChange) : this.toPublicRoom(room);
    return { room: publicRoom, duplicate: false, started };
  }

  moveDuringExploration(socketId, zoneId) {
    const { room, player } = this.getContextBySocket(socketId);
    this.assertExplorationActive(room);
    if (typeof zoneId !== "string" || !getExplorationZone(zoneId)) throw new AppError("INVALID_ZONE");
    const state = room.explorationPlayers.get(player.id);
    if (state.activeSearch) throw new AppError("SEARCH_IN_PROGRESS");
    state.location = zoneId;
    return { room: this.toPublicRoom(room), playerId: player.id, zoneId };
  }

  investigateDuringExploration(socketId, objectId, onResolved) {
    const { room, player } = this.getContextBySocket(socketId);
    this.assertExplorationActive(room);
    const item = typeof objectId === "string" ? getExplorationObject(objectId) : null;
    if (!item) throw new AppError("INVALID_OBJECT");
    const state = room.explorationPlayers.get(player.id);
    const assignment = room.clueAssignments.get(player.id);
    if (!state || !assignment) throw new AppError("INVALID_STATE");
    if (state.location !== item.zoneId) throw new AppError("OBJECT_NOT_IN_ZONE");
    if (state.activeSearch) throw new AppError("SEARCH_IN_PROGRESS");
    if (state.investigatedObjectIds.has(item.id)) throw new AppError("OBJECT_ALREADY_INVESTIGATED");
    if (assignment.cards.length >= 2) throw new AppError("CLUE_LIMIT_REACHED");

    const searchId = randomUUID();
    const completesAt = Math.min(this.nowProvider() + this.explorationSearchMs, room.explorationEndsAt);
    state.investigatedObjectIds.add(item.id);
    state.activeSearch = { id: searchId, objectId: item.id, completesAt, timer: null };
    const delay = Math.max(0, completesAt - this.nowProvider());
    state.activeSearch.timer = setTimeout(() => {
      const currentRoom = this.rooms.get(room.code);
      const currentState = currentRoom?.explorationPlayers.get(player.id);
      if (!currentRoom || currentRoom.state !== "exploration" || !currentState?.activeSearch || currentState.activeSearch.id !== searchId || this.nowProvider() >= currentRoom.explorationEndsAt) return;
      currentState.activeSearch = null;
      const roleId = currentRoom.roleAssignments.get(player.id);
      const clue = createFoundClue(item.id, roleId);
      currentRoom.clueAssignments.get(player.id).cards.push(clue);
      if (typeof onResolved === "function") onResolved({
        room: this.toPublicRoom(currentRoom),
        playerId: player.id,
        clue: { ...clue },
        clues: cloneExplorationClues(currentRoom.clueAssignments.get(player.id)),
        exploration: this.toPrivateExploration(currentRoom, player.id)
      });
    }, delay);
    state.activeSearch.timer.unref?.();
    return { objectId: item.id, completesAt, clueCount: assignment.cards.length };
  }

  analyzeExplorationClue(socketId, clueId) {
    const { room, player } = this.getContextBySocket(socketId);
    this.assertExplorationActive(room);
    if (room.roleAssignments.get(player.id) !== "investigator") throw new AppError("ABILITY_NOT_AVAILABLE");
    const state = room.explorationPlayers.get(player.id);
    if (state.analysisUsed) throw new AppError("ABILITY_ALREADY_USED");
    const assignment = room.clueAssignments.get(player.id);
    const clue = assignment?.cards.find((card) => card.id === clueId);
    if (!clue) throw new AppError("CLUE_NOT_FOUND");
    clue.analysis = getAnalysisForObject(clue.objectId);
    state.analysisUsed = true;
    return { clues: cloneExplorationClues(assignment), exploration: this.toPrivateExploration(room, player.id) };
  }

  prepareExploration(room, onPhaseChange) {
    this.clearExplorationTimers(room);
    room.explorationReady.clear();
    room.explorationPlayers.clear();
    room.clueAssignments.clear();
    room.explorationStartedAt = null;
    room.explorationEndsAt = null;
    room.explorationReadyTimeoutAt = this.nowProvider() + this.explorationReadyTimeoutMs;
    for (const playerId of room.players.keys()) {
      room.explorationPlayers.set(playerId, {
        location: null,
        investigatedObjectIds: new Set(),
        analysisUsed: false,
        activeSearch: null
      });
      room.clueAssignments.set(playerId, {
        cards: [],
        observation: null,
        instructions: explorationInstructions(room.roleAssignments.get(playerId))
      });
    }
    room.explorationReadyTimer = setTimeout(() => this.startExploration(room.code, onPhaseChange), this.explorationReadyTimeoutMs);
    room.explorationReadyTimer.unref?.();
    if (typeof onPhaseChange === "function") onPhaseChange("waiting", this.toPublicRoom(room));
  }

  startExploration(roomCode, onPhaseChange) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== "ready_for_exploration") return room ? this.toPublicRoom(room) : null;
    if (room.explorationReadyTimer) clearTimeout(room.explorationReadyTimer);
    room.explorationReadyTimer = null;
    const startedAt = this.nowProvider();
    room.explorationStartedAt = startedAt;
    room.explorationEndsAt = startedAt + this.explorationDurationMs;
    room.explorationReadyTimeoutAt = null;
    room.state = "exploration";
    for (const state of room.explorationPlayers.values()) state.location = "square";
    room.explorationTimer = setTimeout(() => this.finishExploration(room.code, onPhaseChange), this.explorationDurationMs);
    room.explorationTimer.unref?.();
    const publicRoom = this.toPublicRoom(room);
    if (typeof onPhaseChange === "function") onPhaseChange("started", publicRoom);
    return publicRoom;
  }

  finishExploration(roomCode, onPhaseChange) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== "exploration") return null;
    if (room.explorationTimer) clearTimeout(room.explorationTimer);
    room.explorationTimer = null;
    for (const state of room.explorationPlayers.values()) {
      if (state.activeSearch?.timer) clearTimeout(state.activeSearch.timer);
      state.activeSearch = null;
    }
    room.state = "exploration_finished";
    const finishedRoom = this.toPublicRoom(room);
    if (typeof onPhaseChange === "function") onPhaseChange("finished", finishedRoom);
    const enterDiscussionReady = () => {
      const currentRoom = this.rooms.get(roomCode);
      if (!currentRoom || currentRoom.state !== "exploration_finished") return;
      currentRoom.explorationTransitionTimer = null;
      currentRoom.state = "ready_for_discussion";
      if (typeof onPhaseChange === "function") onPhaseChange("ready_for_discussion", this.toPublicRoom(currentRoom));
    };
    if (this.explorationFinishedDelayMs <= 0) {
      enterDiscussionReady();
      return this.toPublicRoom(room);
    }
    room.explorationTransitionTimer = setTimeout(() => {
      enterDiscussionReady();
    }, this.explorationFinishedDelayMs);
    room.explorationTransitionTimer.unref?.();
    return finishedRoom;
  }

  assertExplorationActive(room) {
    if (room.state !== "exploration" || !Number.isFinite(room.explorationEndsAt) || this.nowProvider() >= room.explorationEndsAt) {
      throw new AppError("EXPLORATION_CLOSED");
    }
  }

  startDiscussion(socketId, onPhaseChange) {
    const { room, player } = this.getContextBySocket(socketId);
    if (room.hostId !== player.id) throw new AppError("NOT_HOST");
    if (room.state === "discussion") return { room: this.toPublicRoom(room), duplicate: true };
    if (room.state !== "ready_for_discussion") throw new AppError("INVALID_STATE");
    if ([...room.players.values()].some((item) => !item.connected)) throw new AppError("PLAYERS_DISCONNECTED");
    const startedAt = this.nowProvider();
    room.discussionStartedAt = startedAt;
    room.discussionEndsAt = startedAt + this.discussionDurationMs;
    room.state = "discussion";
    this.clearDiscussionTimers(room);
    room.discussionTimer = setTimeout(() => this.finishDiscussion(room.code, onPhaseChange), this.discussionDurationMs);
    room.discussionTimer.unref?.();
    return { room: this.toPublicRoom(room), duplicate: false };
  }

  finishDiscussion(roomCode, onPhaseChange) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== "discussion") return null;
    if (room.discussionTimer) clearTimeout(room.discussionTimer);
    room.discussionTimer = null;
    room.state = "discussion_finished";
    const finishedRoom = this.toPublicRoom(room);
    if (typeof onPhaseChange === "function") onPhaseChange("discussion_finished", finishedRoom);
    room.discussionTransitionTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(roomCode);
      if (!currentRoom || currentRoom.state !== "discussion_finished") return;
      currentRoom.discussionTransitionTimer = null;
      currentRoom.state = "ready_for_voting";
      if (typeof onPhaseChange === "function") onPhaseChange("ready_for_voting", this.toPublicRoom(currentRoom));
      currentRoom.votingStartTimer = setTimeout(() => this.startVotingRound(roomCode, "main", null, onPhaseChange), this.votingStartDelayMs);
      currentRoom.votingStartTimer.unref?.();
    }, this.discussionFinishedDelayMs);
    room.discussionTransitionTimer.unref?.();
    return finishedRoom;
  }

  startVotingRound(roomCode, round = "main", candidateIds = null, onPhaseChange) {
    const room = this.rooms.get(roomCode);
    const expectedState = round === "main" ? "ready_for_voting" : "voting";
    if (!room || (round === "main" ? room.state !== expectedState : !["voting", "vote_tiebreaker"].includes(room.state))) return null;
    if (room.votingStartTimer) clearTimeout(room.votingStartTimer);
    room.votingStartTimer = null;
    room.votingRound = round;
    room.voteEligibleVoterIds = [...room.gameParticipants.keys()];
    room.voteCandidateIds = candidateIds ? [...candidateIds] : [...room.gameParticipants.keys()];
    room.votes = new Map();
    room.voteRequestAt.clear();
    const durationMs = round === "main" ? this.votingDurationMs : this.tiebreakerDurationMs;
    room.votingStartedAt = this.nowProvider();
    room.votingEndsAt = room.votingStartedAt + durationMs;
    room.state = round === "main" ? "voting" : "vote_tiebreaker";
    room.votingTimer = setTimeout(() => this.closeVoting(room.code, onPhaseChange), durationMs);
    room.votingTimer.unref?.();
    const publicRoom = this.toPublicRoom(room);
    if (typeof onPhaseChange === "function") onPhaseChange(round === "main" ? "voting" : "vote_tiebreaker", publicRoom);
    return publicRoom;
  }

  submitVote(socketId, rawCandidateId, onPhaseChange) {
    const { room, player } = this.getContextBySocket(socketId);
    if (!["voting", "vote_tiebreaker"].includes(room.state) || this.nowProvider() >= room.votingEndsAt) {
      throw new AppError("VOTE_CLOSED");
    }
    if (!room.voteEligibleVoterIds.includes(player.id)) throw new AppError("INVALID_SESSION");
    if (room.votes.has(player.id)) throw new AppError("VOTE_ALREADY_SUBMITTED");
    const now = this.nowProvider();
    const previousAttempt = room.voteRequestAt.get(player.id);
    if (previousAttempt !== undefined && now - previousAttempt < this.voteRequestCooldownMs) throw new AppError("RATE_LIMITED");
    room.voteRequestAt.set(player.id, now);
    if (typeof rawCandidateId !== "string" || !room.voteCandidateIds.includes(rawCandidateId)) throw new AppError("INVALID_CANDIDATE");
    if (rawCandidateId === player.id) throw new AppError("SELF_VOTE");
    room.votes.set(player.id, rawCandidateId);
    const allVoted = room.votes.size === room.voteEligibleVoterIds.length;
    const progress = this.toPublicVotingProgress(room);
    if (allVoted) this.closeVoting(room.code, onPhaseChange);
    return { room: this.toPublicRoom(room), progress, hasVoted: true, closed: allVoted };
  }

  closeVoting(roomCode, onPhaseChange) {
    const room = this.rooms.get(roomCode);
    if (!room || !["voting", "vote_tiebreaker"].includes(room.state)) return null;
    if (room.votingTimer) clearTimeout(room.votingTimer);
    room.votingTimer = null;
    const round = room.votingRound;
    const count = countVotes({
      eligibleVoterIds: room.voteEligibleVoterIds,
      eligibleCandidateIds: room.voteCandidateIds,
      votes: room.votes
    });
    room.voteRoundHistory.push({
      round,
      eligibleVoterIds: [...room.voteEligibleVoterIds],
      eligibleCandidateIds: [...room.voteCandidateIds],
      votes: new Map(room.votes),
      count
    });
    if (typeof onPhaseChange === "function") {
      onPhaseChange("voting_closed", this.toPublicRoom(room), {
        round,
        validVotes: count.validVotes,
        abstentions: count.abstentions,
        tied: count.tied
      });
    }
    if (round === "main" && count.tied) {
      return this.startVotingRound(roomCode, "tiebreaker", count.topCandidateIds, onPhaseChange);
    }
    room.finalResult = this.buildFinalResult(room, count, round === "tiebreaker" && count.tied);
    room.state = "calculating_result";
    const calculatingRoom = this.toPublicRoom(room);
    if (typeof onPhaseChange === "function") onPhaseChange("calculating_result", calculatingRoom);
    room.resultTimer = setTimeout(() => {
      const currentRoom = this.rooms.get(roomCode);
      if (!currentRoom || currentRoom.state !== "calculating_result") return;
      currentRoom.resultTimer = null;
      currentRoom.state = "game_finished";
      if (typeof onPhaseChange === "function") onPhaseChange("game_finished", this.toPublicRoom(currentRoom));
    }, this.resultRevealDelayMs);
    room.resultTimer.unref?.();
    return calculatingRoom;
  }

  playAgain(socketId) {
    const { room, player } = this.getContextBySocket(socketId);
    if (room.hostId !== player.id) throw new AppError("NOT_HOST");
    if (room.state !== "game_finished") throw new AppError("INVALID_STATE");
    room.state = "returning_to_lobby";
    this.clearGameData(room);
    return this.toPublicRoom(room);
  }

  sendChatMessage(socketId, rawText) {
    const { room, player } = this.getContextBySocket(socketId);
    if (room.state !== "discussion" || this.nowProvider() >= room.discussionEndsAt) throw new AppError("CHAT_CLOSED");
    const text = validateChatMessage(rawText);
    const now = this.nowProvider();
    const rate = room.chatRate.get(player.id) || { lastAt: null, recent: [] };
    rate.recent = rate.recent.filter((timestamp) => now - timestamp < this.chatBurstWindowMs);
    if ((rate.lastAt !== null && now - rate.lastAt < this.chatCooldownMs) || rate.recent.length >= this.chatBurstMax) {
      throw new AppError("CHAT_RATE_LIMITED");
    }
    rate.lastAt = now;
    rate.recent.push(now);
    room.chatRate.set(player.id, rate);
    const message = {
      id: randomUUID(),
      senderId: player.id,
      senderName: player.name,
      text,
      sentAt: now,
      roomCode: room.code
    };
    room.chatMessages.push(message);
    if (room.chatMessages.length > this.chatHistoryLimit) room.chatMessages.splice(0, room.chatMessages.length - this.chatHistoryLimit);
    return this.toPublicChatMessage(message);
  }

  getChatHistoryBySocket(socketId) {
    const { room } = this.getContextBySocket(socketId);
    if (!["discussion", "discussion_finished", "ready_for_voting", "voting", "vote_tiebreaker", "calculating_result", "game_finished"].includes(room.state)) throw new AppError("CHAT_CLOSED");
    return room.chatMessages.map((message) => this.toPublicChatMessage(message));
  }

  resetGame(socketId) {
    const { room, player } = this.getContextBySocket(socketId);
    if (room.hostId !== player.id) throw new AppError("NOT_HOST");
    if (!RESETTABLE_STATES.has(room.state)) throw new AppError("INVALID_STATE");
    this.clearGameData(room);
    return this.toPublicRoom(room);
  }

  resetRoom(socketId) {
    return this.resetGame(socketId);
  }

  getPrivateGameStateBySocket(socketId) {
    const { room, player } = this.getContextBySocket(socketId);
    const canReceiveRole = ACTIVE_STATES.has(room.state) && room.state !== "story";
    const canReceiveClues = ["ready_for_exploration", "exploration", "exploration_finished", "ready_for_discussion", "discussion", "discussion_finished", "ready_for_voting", "voting", "vote_tiebreaker", "calculating_result", "game_finished"].includes(room.state);
    const canReceiveHistory = ["discussion", "discussion_finished", "ready_for_voting", "voting", "vote_tiebreaker", "calculating_result", "game_finished"].includes(room.state);
    return {
      room: this.toPublicRoom(room),
      storyConfirmed: room.storyConfirmed.has(player.id),
      roleConfirmed: room.roleConfirmed.has(player.id),
      explorationReady: room.explorationReady.has(player.id),
      role: canReceiveRole ? toPrivateRole(room.roleAssignments.get(player.id)) : null,
      clues: canReceiveClues ? cloneExplorationClues(room.clueAssignments.get(player.id)) : null,
      exploration: canReceiveClues ? this.toPrivateExploration(room, player.id) : null,
      chatHistory: canReceiveHistory ? room.chatMessages.map((message) => this.toPublicChatMessage(message)) : null,
      hasVoted: ["voting", "vote_tiebreaker"].includes(room.state) ? room.votes.has(player.id) : false,
      serverTime: this.nowProvider()
    };
  }

  getRoom(code) {
    const room = this.rooms.get(code);
    return room ? this.toPublicRoom(room) : null;
  }

  getRoomCount() {
    return this.rooms.size;
  }

  cleanupInactiveRooms(onRemoved) {
    const cutoff = this.nowProvider() - this.roomInactivityMs;
    const removedCodes = [];
    for (const room of this.rooms.values()) {
      const hasConnectedPlayer = [...room.players.values()].some((player) => player.connected);
      if (hasConnectedPlayer || room.lastActivityAt > cutoff) continue;
      this.deleteRoom(room);
      removedCodes.push(room.code);
      if (typeof onRemoved === "function") onRemoved(room.code);
    }
    return removedCodes;
  }

  clear() {
    for (const room of [...this.rooms.values()]) this.deleteRoom(room);
    this.socketIndex.clear();
  }

  createPlayer(name, socketId) {
    return {
      id: randomUUID(),
      name,
      normalizedName: normalizeNameForComparison(name),
      connected: true,
      reconnectToken: randomBytes(32).toString("base64url"),
      joinedAt: this.nowProvider(),
      socketId,
      disconnectedAt: null,
      reconnectDeadline: null,
      disconnectTimer: null
    };
  }

  createJoinResult(room, player) {
    return {
      room: this.toPublicRoom(room),
      session: { roomCode: room.code, playerId: player.id, reconnectToken: player.reconnectToken }
    };
  }

  toPublicRoom(room) {
    return {
      code: room.code,
      state: room.state,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      discussionDurationSeconds: Math.round(this.discussionDurationMs / 1_000),
      story: toPublicStory(room.story),
      evidence: room.evidence ? { ...room.evidence } : null,
      explorationDurationSeconds: Math.round(this.explorationDurationMs / 1_000),
      exploration: ["ready_for_exploration", "exploration", "exploration_finished"].includes(room.state) ? {
        startedAt: room.explorationStartedAt,
        endsAt: room.explorationEndsAt,
        readyTimeoutAt: room.explorationReadyTimeoutAt,
        readyCount: room.explorationReady.size,
        total: room.players.size,
        activePlayers: [...room.players.values()].filter((player) => player.connected).length,
        zones: toPublicExplorationMap()
      } : null,
      discussion: room.discussionStartedAt === null ? null : {
        startedAt: room.discussionStartedAt,
        endsAt: room.discussionEndsAt,
        durationSeconds: Math.round(this.discussionDurationMs / 1_000)
      },
      votingDurationSeconds: Math.round(this.votingDurationMs / 1_000),
      tiebreakerDurationSeconds: Math.round(this.tiebreakerDurationMs / 1_000),
      voting: this.toPublicVoting(room),
      result: room.state === "game_finished" ? room.finalResult : null,
      progress: {
        storyConfirmed: room.storyConfirmed.size,
        roleConfirmed: room.roleConfirmed.size,
        explorationReady: room.explorationReady.size,
        total: room.players.size
      },
      players: [...room.players.values()]
        .sort((first, second) => first.joinedAt - second.joinedAt)
        .map((player) => ({
          id: player.id,
          name: player.name,
          connected: player.connected,
          reconnectDeadline: player.connected ? null : player.reconnectDeadline,
          isHost: room.hostId === player.id,
          zoneId: ["exploration", "exploration_finished"].includes(room.state) ? room.explorationPlayers.get(player.id)?.location || null : null
        }))
    };
  }

  removePlayer(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player) throw new AppError("INVALID_SESSION");
    const wasActive = ACTIVE_STATES.has(room.state);
    const stateBeforeRemoval = room.state;
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    if (player.socketId) this.socketIndex.delete(player.socketId);
    player.disconnectTimer = null;
    player.reconnectDeadline = null;
    player.reconnectToken = null;

    const previousHostId = room.hostId;
    room.players.delete(playerId);
    if (previousHostId === playerId) room.hostId = this.findNextHost(room);
    const canKeepFinishedResult = stateBeforeRemoval === "game_finished";
    const gameCancelled = wasActive && !canKeepFinishedResult;
    if (gameCancelled) this.clearGameData(room);
    else this.touchRoom(room);

    if (room.players.size === 0) {
      this.deleteRoom(room);
      return { roomCode, playerId, room: null, deleted: true, hostChanged: false, newHostId: null, gameCancelled };
    }

    return {
      roomCode,
      playerId,
      room: this.toPublicRoom(room),
      deleted: false,
      hostChanged: previousHostId !== room.hostId,
      newHostId: room.hostId,
      gameCancelled
    };
  }

  clearGameData(room) {
    this.clearExplorationTimers(room);
    this.clearDiscussionTimers(room);
    this.clearVotingTimers(room);
    room.state = "waiting";
    room.story = null;
    room.evidence = null;
    room.roleAssignments.clear();
    room.clueAssignments.clear();
    room.storyConfirmed.clear();
    room.roleConfirmed.clear();
    room.explorationReady.clear();
    room.explorationPlayers.clear();
    room.explorationStartedAt = null;
    room.explorationEndsAt = null;
    room.explorationReadyTimeoutAt = null;
    room.discussionStartedAt = null;
    room.discussionEndsAt = null;
    room.chatMessages.length = 0;
    room.chatRate.clear();
    room.gameParticipants.clear();
    room.votingRound = null;
    room.votingStartedAt = null;
    room.votingEndsAt = null;
    room.voteEligibleVoterIds = [];
    room.voteCandidateIds = [];
    room.votes.clear();
    room.voteRequestAt.clear();
    room.voteRoundHistory.length = 0;
    room.finalResult = null;
  }

  clearDiscussionTimers(room) {
    if (room.discussionTimer) clearTimeout(room.discussionTimer);
    if (room.discussionTransitionTimer) clearTimeout(room.discussionTransitionTimer);
    room.discussionTimer = null;
    room.discussionTransitionTimer = null;
  }

  clearVotingTimers(room) {
    if (room.votingStartTimer) clearTimeout(room.votingStartTimer);
    if (room.votingTimer) clearTimeout(room.votingTimer);
    if (room.resultTimer) clearTimeout(room.resultTimer);
    room.votingStartTimer = null;
    room.votingTimer = null;
    room.resultTimer = null;
  }

  clearExplorationTimers(room) {
    if (room.explorationReadyTimer) clearTimeout(room.explorationReadyTimer);
    if (room.explorationTimer) clearTimeout(room.explorationTimer);
    if (room.explorationTransitionTimer) clearTimeout(room.explorationTransitionTimer);
    for (const state of room.explorationPlayers?.values?.() || []) {
      if (state.activeSearch?.timer) clearTimeout(state.activeSearch.timer);
      state.activeSearch = null;
    }
    room.explorationReadyTimer = null;
    room.explorationTimer = null;
    room.explorationTransitionTimer = null;
  }

  deleteRoom(room) {
    this.clearExplorationTimers(room);
    this.clearDiscussionTimers(room);
    this.clearVotingTimers(room);
    for (const player of room.players.values()) {
      if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
      if (player.socketId) this.socketIndex.delete(player.socketId);
      player.disconnectTimer = null;
      player.reconnectDeadline = null;
      player.reconnectToken = null;
    }
    this.rooms.delete(room.code);
  }

  touchRoom(room) {
    room.lastActivityAt = this.nowProvider();
  }

  toPublicChatMessage(message) {
    return {
      id: message.id,
      senderId: message.senderId,
      senderName: message.senderName,
      text: message.text,
      sentAt: message.sentAt
    };
  }

  toPrivateExploration(room, playerId) {
    const state = room.explorationPlayers.get(playerId);
    if (!state) return null;
    return {
      location: state.location,
      investigatedObjectIds: [...state.investigatedObjectIds],
      clueCount: room.clueAssignments.get(playerId)?.cards.length || 0,
      analysisUsed: state.analysisUsed,
      activeSearch: state.activeSearch ? { objectId: state.activeSearch.objectId, completesAt: state.activeSearch.completesAt } : null
    };
  }

  toPublicVotingProgress(room) {
    return { confirmed: room.votes.size, total: room.voteEligibleVoterIds.length };
  }

  toPublicVoting(room) {
    if (!["voting", "vote_tiebreaker", "calculating_result"].includes(room.state)) return null;
    const durationMs = room.votingRound === "tiebreaker" ? this.tiebreakerDurationMs : this.votingDurationMs;
    return {
      round: room.votingRound,
      startedAt: room.votingStartedAt,
      endsAt: room.votingEndsAt,
      durationSeconds: Math.round(durationMs / 1_000),
      progress: this.toPublicVotingProgress(room),
      candidates: room.voteCandidateIds.map((candidateId) => {
        const participant = room.gameParticipants.get(candidateId);
        return {
          id: candidateId,
          name: participant?.name || "Jugador",
          connected: room.players.get(candidateId)?.connected === true
        };
      })
    };
  }

  buildFinalResult(room, finalCount, persistentTie) {
    const participants = [...room.gameParticipants.values()].sort((first, second) => first.joinedAt - second.joinedAt);
    const creatureId = [...room.roleAssignments.entries()].find(([, roleId]) => roleId === "creature")?.[0] || null;
    const selectedPlayerId = persistentTie ? null : finalCount.selectedCandidateId;
    const winner = !persistentTie && selectedPlayerId === creatureId ? "village" : "creature";
    const message = persistentTie
      ? "El pueblo no consiguió llegar a una decisión. La criatura aprovechó la confusión y permaneció oculta."
      : winner === "village"
        ? "El pueblo descubrió a la criatura antes de que volviera a caer la noche."
        : "El pueblo acusó a un inocente. La criatura continúa oculta entre la neblina.";
    const rounds = room.voteRoundHistory.map((round) => ({
      round: round.round,
      validVotes: round.count.validVotes,
      abstentions: round.count.abstentions,
      tied: round.count.tied,
      totals: round.eligibleCandidateIds.map((candidateId) => ({
        candidateName: room.gameParticipants.get(candidateId)?.name || "Jugador",
        votes: round.count.totals.get(candidateId) || 0
      })),
      ballots: round.eligibleVoterIds.map((voterId) => {
        const candidateId = round.votes.get(voterId);
        return {
          voterName: room.gameParticipants.get(voterId)?.name || "Jugador",
          candidateName: candidateId ? room.gameParticipants.get(candidateId)?.name || "Jugador" : null
        };
      })
    }));
    return {
      winner,
      title: winner === "village" ? "Victoria del pueblo" : "Victoria de la criatura",
      message,
      creatureName: room.gameParticipants.get(creatureId)?.name || "Jugador",
      selectedPlayerName: selectedPlayerId ? room.gameParticipants.get(selectedPlayerId)?.name || "Jugador" : null,
      tiedPlayerNames: persistentTie ? finalCount.topCandidateIds.map((id) => room.gameParticipants.get(id)?.name || "Jugador") : [],
      tiebreakerUsed: room.voteRoundHistory.some((round) => round.round === "tiebreaker"),
      persistentTie,
      totalAbstentions: rounds.reduce((sum, round) => sum + round.abstentions, 0),
      players: participants.map((participant) => {
        const roleId = room.roleAssignments.get(participant.id);
        const role = getRoleDefinition(roleId);
        const mainRound = room.voteRoundHistory.find((round) => round.round === "main");
        const tiebreakerRound = room.voteRoundHistory.find((round) => round.round === "tiebreaker");
        return {
          name: participant.name,
          role: { id: role?.id || roleId, name: role?.name || "Desconocido" },
          votesReceived: {
            main: mainRound?.count.totals.get(participant.id) || 0,
            tiebreaker: tiebreakerRound?.count.totals.get(participant.id) || 0
          }
        };
      }),
      rounds,
      storyConclusion: room.story?.conclusion || "El misterio de San Jerónimo ha llegado a su fin."
    };
  }

  findNextHost(room) {
    const players = [...room.players.values()].sort((first, second) => first.joinedAt - second.joinedAt);
    return players.find((player) => player.connected)?.id || players[0]?.id || null;
  }

  getContextBySocket(socketId) {
    const reference = this.socketIndex.get(socketId);
    const room = reference && this.rooms.get(reference.roomCode);
    const player = reference && room?.players.get(reference.playerId);
    if (!room || !player || !player.connected) throw new AppError("INVALID_SESSION");
    this.touchRoom(room);
    return { room, player };
  }

  getRoomOrThrow(code, errorCode = "ROOM_NOT_FOUND") {
    const room = this.rooms.get(code);
    if (!room) throw new AppError(errorCode);
    return room;
  }

  assertSocketAvailable(socketId) {
    if (typeof socketId !== "string" || !socketId || this.socketIndex.has(socketId)) {
      throw new AppError(this.socketIndex.has(socketId) ? "ALREADY_IN_ROOM" : "INVALID_SESSION");
    }
  }

  createUniqueCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = this.codeGenerator();
      if (!this.rooms.has(code)) return code;
    }
    throw new AppError("INTERNAL_ERROR");
  }

  tokensMatch(expected, received) {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  }
}
