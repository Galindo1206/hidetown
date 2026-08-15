import { AppError, toPublicError } from "../utils/errors.js";
import { requireExactObject, requireObject } from "../utils/validators.js";

const CANCELLATION_MESSAGE = "La partida fue cancelada porque un jugador abandonó la sala. Pueden comenzar nuevamente cuando estén listos.";

export function registerRoomHandlers({ io, socket, roomService, rateLimiter, actionRateLimiter, logger = console }) {
  const attemptKey = socket.handshake.address || socket.id;

  function acknowledge(ack, payload) {
    if (typeof ack === "function") ack(payload);
  }

  function reportError(error, ack, errorEvent) {
    if (!(error instanceof AppError)) logger.error?.("socket_action_failed", {
      eventName: error?.eventName || "unknown",
      errorName: error?.name || "Error"
    });
    const publicError = toPublicError(error);
    acknowledge(ack, { ok: false, error: publicError });
    if (typeof ack !== "function") socket.emit(errorEvent, publicError);
  }

  function broadcastRoom(room) {
    if (room) io.to(room.code).emit("room:updated", room);
  }

  function broadcastHostChange(result) {
    if (result?.hostChanged && result.room) {
      io.to(result.room.code).emit("host:changed", { hostId: result.newHostId, room: result.room });
    }
  }

  function broadcastCancellation(result) {
    if (result?.gameCancelled && result.room) {
      io.to(result.room.code).emit("game:cancelled", { message: CANCELLATION_MESSAGE, room: result.room });
    }
  }

  function emitPrivateGameState(targetSocket) {
    const privateState = roomService.getPrivateGameStateBySocket(targetSocket.id);
    targetSocket.emit("game:state", {
      room: privateState.room,
      confirmations: {
        story: privateState.storyConfirmed,
        role: privateState.roleConfirmed,
        exploration: privateState.explorationReady
      },
      voting: { hasVoted: privateState.hasVoted },
      exploration: privateState.exploration
    });
    if (privateState.role) targetSocket.emit("role:assigned", privateState.role);
    if (privateState.clues) targetSocket.emit("clues:assigned", privateState.clues);
    if (privateState.room.discussion) {
      targetSocket.emit("discussion:state", { room: privateState.room, serverTime: privateState.serverTime });
      targetSocket.emit("chat:history", { messages: privateState.chatHistory || [] });
    }
    if (privateState.room.state === "game_finished" && privateState.room.result) {
      targetSocket.emit("game:result", { room: privateState.room, result: privateState.room.result });
    }
  }

  async function emitPrivateGameStateToRoom(roomCode) {
    const sockets = await io.in(roomCode).fetchSockets();
    for (const targetSocket of sockets) emitPrivateGameState(targetSocket);
  }

  async function socketsForPlayer(roomCode, playerId) {
    const sockets = await io.in(roomCode).fetchSockets();
    return sockets.filter((targetSocket) => targetSocket.data.playerId === playerId);
  }

  function broadcastExplorationPhase(phase, room) {
    if (!room) return;
    if (phase === "waiting") io.to(room.code).emit("exploration:waiting", { room, serverTime: Date.now() });
    if (phase === "started") {
      io.to(room.code).emit("exploration:started", { room, serverTime: Date.now() });
      emitPrivateGameStateToRoom(room.code);
    }
    if (phase === "finished") io.to(room.code).emit("exploration:finished", { room, serverTime: Date.now() });
    if (phase === "ready_for_discussion") io.to(room.code).emit("game:ready-for-discussion", { room, serverTime: Date.now() });
    io.to(room.code).emit("game:state", { room });
    broadcastRoom(room);
  }

  function bind(eventName, action, { limited = false, payloadRequired = true, allowedKeys = null, requiredKeys = allowedKeys, errorEvent = "room:error" } = {}) {
    socket.on(eventName, async (payload, ack) => {
      try {
        actionRateLimiter.consume(socket.id);
        if (limited) rateLimiter.consume(attemptKey);
        const safePayload = allowedKeys
          ? requireExactObject(payload ?? {}, allowedKeys, requiredKeys)
          : payloadRequired ? requireObject(payload) : payload;
        const data = await action(safePayload);
        acknowledge(ack, { ok: true, data });
      } catch (error) {
        if (error && typeof error === "object") error.eventName = eventName;
        reportError(error, ack, errorEvent);
      }
    });
  }

  bind("room:create", ({ name }) => {
    const result = roomService.createRoom(name, socket.id);
    socket.join(result.room.code);
    socket.data.roomCode = result.room.code;
    socket.data.playerId = result.session.playerId;
    socket.emit("room:joined", result);
    broadcastRoom(result.room);
    logger.info?.("room_created", { players: result.room.players.length });
    return result;
  }, { limited: true, allowedKeys: ["name"] });

  bind("room:join", ({ code, name }) => {
    const result = roomService.joinRoom(code, name, socket.id);
    socket.join(result.room.code);
    socket.data.roomCode = result.room.code;
    socket.data.playerId = result.session.playerId;
    socket.emit("room:joined", result);
    broadcastRoom(result.room);
    logger.info?.("room_joined", { players: result.room.players.length });
    return result;
  }, { limited: true, allowedKeys: ["code", "name"] });

  bind("room:restore", async ({ roomCode, playerId, reconnectToken }) => {
    const result = roomService.restoreSession(roomCode, playerId, reconnectToken, socket.id);
    const publicResult = { room: result.room, session: result.session };
    socket.join(result.room.code);
    socket.data.roomCode = result.room.code;
    socket.data.playerId = result.session.playerId;
    if (result.previousSocketId && result.previousSocketId !== socket.id) {
      io.sockets.sockets.get(result.previousSocketId)?.disconnect(true);
    }
    socket.emit("room:joined", publicResult);
    emitPrivateGameState(socket);
    io.to(result.room.code).emit("player:reconnected", { playerId, room: result.room });
    if (result.hostChanged) {
      io.to(result.room.code).emit("host:changed", { hostId: playerId, room: result.room });
    }
    broadcastRoom(result.room);
    return publicResult;
  }, { limited: true, allowedKeys: ["roomCode", "playerId", "reconnectToken"] });

  bind("room:leave", () => {
    const roomCode = socket.data.roomCode;
    const result = roomService.leaveBySocket(socket.id);
    socket.leave(roomCode);
    socket.data.roomCode = null;
    socket.data.playerId = null;
    socket.emit("room:left");
    broadcastCancellation(result);
    broadcastRoom(result.room);
    broadcastHostChange(result);
    logger.info?.("room_left", { roomRemoved: result.deleted, players: result.room?.players.length ?? 0 });
    return { roomClosed: result.deleted, gameCancelled: result.gameCancelled };
  }, { payloadRequired: false, allowedKeys: [] });

  async function startGame() {
    const room = roomService.startGame(socket.id);
    io.to(room.code).emit("game:started", { room });
    io.to(room.code).emit("story:presented", { story: room.story, progress: room.progress });
    io.to(room.code).emit("game:state", { room });
    broadcastRoom(room);
    return room;
  }

  bind("game:start", startGame, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });
  bind("room:start", startGame, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });

  bind("story:confirm", async () => {
    const result = roomService.confirmStory(socket.id);
    io.to(result.room.code).emit("story:progress", { progress: result.room.progress, state: result.room.state });
    io.to(result.room.code).emit("game:state", { room: result.room });
    broadcastRoom(result.room);
    if (result.transitioned) await emitPrivateGameStateToRoom(result.room.code);
    return { progress: result.room.progress, state: result.room.state, duplicate: result.duplicate };
  }, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });

  bind("role:confirm", async () => {
    const result = roomService.confirmRole(socket.id, broadcastExplorationPhase);
    io.to(result.room.code).emit("role:progress", { progress: result.room.progress, state: result.room.state });
    io.to(result.room.code).emit("game:state", { room: result.room });
    broadcastRoom(result.room);
    if (result.readyForExploration) await emitPrivateGameStateToRoom(result.room.code);
    return { progress: result.room.progress, state: result.room.state, duplicate: result.duplicate };
  }, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });

  bind("exploration:ready", () => {
    const result = roomService.confirmExplorationReady(socket.id, broadcastExplorationPhase);
    if (result.room.state === "ready_for_exploration") io.to(result.room.code).emit("exploration:waiting", { room: result.room, serverTime: Date.now() });
    io.to(result.room.code).emit("game:state", { room: result.room });
    broadcastRoom(result.room);
    return { progress: result.room.progress, state: result.room.state, duplicate: result.duplicate };
  }, { payloadRequired: false, allowedKeys: [], errorEvent: "exploration:error" });

  bind("exploration:move", ({ zoneId }) => {
    const result = roomService.moveDuringExploration(socket.id, zoneId);
    io.to(result.room.code).emit("exploration:location-updated", { playerId: result.playerId, zoneId: result.zoneId, room: result.room });
    broadcastRoom(result.room);
    return { room: result.room, zoneId: result.zoneId };
  }, { allowedKeys: ["zoneId"], errorEvent: "exploration:error" });

  bind("exploration:investigate", async ({ objectId }) => {
    const search = roomService.investigateDuringExploration(socket.id, objectId, async (result) => {
      const targets = await socketsForPlayer(result.room.code, result.playerId);
      for (const target of targets) {
        target.emit("exploration:clue-found", { clue: result.clue, clues: result.clues, exploration: result.exploration });
        emitPrivateGameState(target);
      }
    });
    socket.emit("exploration:search-started", search);
    return search;
  }, { allowedKeys: ["objectId"], errorEvent: "exploration:error" });

  bind("exploration:analyze", ({ clueId }) => {
    const result = roomService.analyzeExplorationClue(socket.id, clueId);
    socket.emit("clues:assigned", result.clues);
    socket.emit("exploration:state", { exploration: result.exploration });
    return result;
  }, { allowedKeys: ["clueId"], errorEvent: "exploration:error" });

  function broadcastDiscussionPhase(phase, room, details) {
    if (!room) return;
    if (phase === "discussion_finished") {
      io.to(room.code).emit("discussion:finished", { room, serverTime: Date.now() });
    } else if (phase === "ready_for_voting") {
      io.to(room.code).emit("game:ready-for-voting", { room, serverTime: Date.now() });
    } else if (phase === "voting") {
      io.to(room.code).emit("voting:started", { room, serverTime: Date.now() });
    } else if (phase === "vote_tiebreaker") {
      io.to(room.code).emit("voting:tiebreaker", { room, serverTime: Date.now() });
    } else if (phase === "voting_closed") {
      io.to(room.code).emit("voting:closed", { room, summary: details, serverTime: Date.now() });
    } else if (phase === "game_finished") {
      io.to(room.code).emit("game:result", { room, result: room.result, serverTime: Date.now() });
    }
    io.to(room.code).emit("game:state", { room });
    broadcastRoom(room);
  }

  bind("discussion:start", () => {
    const result = roomService.startDiscussion(socket.id, broadcastDiscussionPhase);
    if (!result.duplicate) {
      io.to(result.room.code).emit("discussion:started", { room: result.room, serverTime: Date.now() });
      io.to(result.room.code).emit("game:state", { room: result.room });
      broadcastRoom(result.room);
    }
    return { room: result.room, duplicate: result.duplicate, serverTime: Date.now() };
  }, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });

  bind("chat:send", ({ text }) => {
    const message = roomService.sendChatMessage(socket.id, text);
    io.to(socket.data.roomCode).emit("chat:message", message);
    return message;
  }, { allowedKeys: ["text"], errorEvent: "chat:error" });

  bind("vote:submit", ({ candidateId }) => {
    const result = roomService.submitVote(socket.id, candidateId, broadcastDiscussionPhase);
    io.to(result.room.code).emit("voting:progress", { progress: result.progress, state: result.room.state });
    return { progress: result.progress, state: result.room.state, hasVoted: result.hasVoted, closed: result.closed };
  }, { allowedKeys: ["candidateId"], errorEvent: "vote:error" });

  bind("game:play-again", () => {
    const room = roomService.playAgain(socket.id);
    io.to(room.code).emit("game:reset", { room, message: "El anfitrión está preparando una nueva partida." });
    io.to(room.code).emit("room:reset", room);
    io.to(room.code).emit("game:state", { room });
    broadcastRoom(room);
    return room;
  }, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });

  bind("game:return-to-menu", () => {
    const roomCode = socket.data.roomCode;
    const result = roomService.leaveBySocket(socket.id);
    socket.leave(roomCode);
    socket.data.roomCode = null;
    socket.data.playerId = null;
    socket.emit("room:left");
    broadcastRoom(result.room);
    broadcastHostChange(result);
    return { roomClosed: result.deleted };
  }, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });

  function resetGame() {
    const room = roomService.resetGame(socket.id);
    io.to(room.code).emit("game:reset", { room });
    io.to(room.code).emit("room:reset", room);
    io.to(room.code).emit("game:state", { room });
    broadcastRoom(room);
    return room;
  }

  bind("game:reset", resetGame, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });
  bind("room:reset", resetGame, { payloadRequired: false, allowedKeys: [], errorEvent: "game:error" });

  socket.on("disconnect", () => {
    const result = roomService.disconnectBySocket(socket.id, (expired) => {
      if (!expired.room) {
        logger.info?.("room_removed", { reason: "reconnection_timeout" });
        return;
      }
      io.to(expired.room.code).emit("player:removed", { playerId: expired.playerId, reason: "timeout" });
      broadcastCancellation(expired);
      broadcastRoom(expired.room);
      broadcastHostChange(expired);
    });
    if (!result) return;
    logger.info?.("player_disconnected", { players: result.room.players.length });
    io.to(result.room.code).emit("player:disconnected", { playerId: result.playerId, reconnectDeadline: result.reconnectDeadline, room: result.room });
    broadcastRoom(result.room);
  });
}
