(function () {
  "use strict";

  const SESSION_KEY = "el-pueblo-oculto:room-session";

  class MultiplayerError extends Error {
    constructor(code, message, recoverable = true) {
      super(message);
      this.name = "MultiplayerError";
      this.code = code;
      this.recoverable = recoverable;
    }
  }

  class MultiplayerClient {
    constructor() {
      this.events = new EventTarget();
      this.session = this.readSession();
      this.currentRoom = null;
      this.privateRole = null;
      this.privateClues = null;
      this.privateExploration = null;
      this.chatMessages = [];
      this.chatMessageIds = new Set();
      this.serverTimeOffset = 0;
      this.hasVoted = false;
      this.reconstructionConfirmedVersion = null;
      this.confirmations = { story: false, role: false, exploration: false };
      this.restoreInProgress = false;
      this.pendingRequests = new Map();
      this.connectionState = "connecting";
      this.socket = window.io({
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 5_000,
        randomizationFactor: 0.5,
        timeout: 8_000
      });
      this.registerSocketEvents();
    }

    on(eventName, listener) {
      const wrapped = (event) => listener(event.detail);
      this.events.addEventListener(eventName, wrapped);
      return () => this.events.removeEventListener(eventName, wrapped);
    }

    retryConnection() {
      if (this.socket.connected) return;
      this.connectionState = "connecting";
      this.emitLocal("connection", { connected: false, status: "connecting" });
      this.socket.io.reconnection(true);
      this.socket.io.reconnectionAttempts(8);
      this.socket.connect();
    }

    emitLocal(eventName, detail) {
      this.events.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    registerSocketEvents() {
      this.socket.on("connect", () => {
        const recovered = ["disconnected", "reconnecting"].includes(this.connectionState);
        this.connectionState = "connected";
        this.emitLocal("connection", { connected: true, status: recovered ? "recovered" : "connected" });
        if (this.session) this.restoreSession();
      });

      this.socket.on("disconnect", () => {
        this.connectionState = "reconnecting";
        this.emitLocal("connection", { connected: false, status: "reconnecting" });
      });

      this.socket.on("connect_error", () => {
        this.connectionState = "reconnecting";
        this.emitLocal("connection", { connected: false, status: "reconnecting" });
      });
      this.socket.io.on("reconnect_attempt", () => {
        this.connectionState = "reconnecting";
        this.emitLocal("connection", { connected: false, status: "reconnecting" });
      });
      this.socket.io.on("reconnect_failed", () => {
        this.connectionState = "disconnected";
        this.emitLocal("connection", { connected: false, status: "failed" });
      });

      this.socket.on("room:joined", (result) => this.acceptJoinedRoom(result));
      this.socket.on("room:updated", (room) => this.acceptRoomUpdate(room));
      this.socket.on("room:reset", (room) => {
        this.clearPrivateGameData();
        this.acceptRoomUpdate(room);
        this.emitLocal("reset", room);
      });
      this.socket.on("game:started", ({ room }) => {
        this.clearPrivateGameData();
        this.acceptRoomUpdate(room);
        this.emitLocal("game-started", room);
      });
      this.socket.on("story:presented", (payload) => this.emitLocal("story-presented", payload));
      this.socket.on("game:state", ({ room, confirmations, voting, exploration, reconstruction, clues, serverTime }) => {
        this.syncServerTime(serverTime);
        if (confirmations) this.confirmations = { ...this.confirmations, ...confirmations };
        if (voting) this.hasVoted = Boolean(voting.hasVoted);
        if (exploration) this.privateExploration = { ...exploration, investigatedObjectIds: [...(exploration.investigatedObjectIds || [])] };
        if (Array.isArray(clues?.cards) && typeof clues?.instructions === "string") {
          this.privateClues = {
            cards: clues.cards.map((card) => ({ ...card })),
            observation: clues.observation ? { ...clues.observation } : null,
            instructions: clues.instructions
          };
        }
        if (reconstruction) this.reconstructionConfirmedVersion = reconstruction.confirmedVersion ?? null;
        this.acceptRoomUpdate(room);
        this.emitLocal("game-state", { room, confirmations: { ...this.confirmations }, exploration: this.privateExploration, clues: this.privateClues });
      });
      this.socket.on("story:progress", (payload) => this.emitLocal("story-progress", payload));
      this.socket.on("role:assigned", (role) => {
        if (!role?.id || !role?.name || !role?.objective) return;
        this.privateRole = { ...role };
        this.emitLocal("role-assigned", this.privateRole);
      });
      this.socket.on("role:progress", (payload) => this.emitLocal("role-progress", payload));
      this.socket.on("clues:assigned", (clues) => {
        if (!Array.isArray(clues?.cards) || typeof clues?.instructions !== "string") return;
        this.privateClues = {
          cards: clues.cards.map((card) => ({ ...card })),
          observation: clues.observation ? { ...clues.observation } : null,
          instructions: clues.instructions
        };
        this.emitLocal("clues-assigned", this.privateClues);
      });
      this.socket.on("exploration:waiting", (payload) => {
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("exploration-waiting", payload);
      });
      this.socket.on("exploration:started", (payload) => {
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("exploration-started", payload);
      });
      this.socket.on("exploration:state", ({ exploration, room, serverTime }) => {
        this.syncServerTime(serverTime);
        this.privateExploration = exploration ? { ...exploration, investigatedObjectIds: [...(exploration.investigatedObjectIds || [])] } : null;
        if (room) this.acceptRoomUpdate(room);
        this.emitLocal("exploration-state", this.privateExploration);
      });
      this.socket.on("exploration:location-updated", (payload) => {
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("exploration-location", payload);
      });
      this.socket.on("exploration:player-state", ({ playerId, position }) => {
        const player = this.currentRoom?.players?.find((item) => item.id === playerId);
        if (player && position) player.explorationState = { ...position };
        this.emitLocal("exploration-player-state", { playerId, position: position ? { ...position } : null });
      });
      this.socket.on("exploration:scene-changed", (payload) => {
        this.acceptRoomUpdate(payload.room);
        if (payload.playerId === this.session?.playerId && this.privateExploration) {
          this.privateExploration = { ...this.privateExploration, ...payload.position, location: payload.room.players.find((item) => item.id === payload.playerId)?.zoneId };
        }
        this.emitLocal("exploration-scene-changed", payload);
      });
      this.socket.on("exploration:search-started", (search) => {
        this.privateExploration = { ...(this.privateExploration || {}), activeSearch: { ...search } };
        this.emitLocal("exploration-search-started", search);
      });
      this.socket.on("exploration:clue-found", ({ clue, clues, exploration }) => {
        this.privateClues = {
          cards: (clues?.cards || []).map((card) => ({ ...card })),
          observation: clues?.observation ? { ...clues.observation } : null,
          instructions: clues?.instructions || ""
        };
        this.privateExploration = exploration ? { ...exploration, investigatedObjectIds: [...(exploration.investigatedObjectIds || [])] } : null;
        this.emitLocal("exploration-clue-found", { clue: { ...clue }, clues: this.privateClues, exploration: this.privateExploration });
      });
      this.socket.on("exploration:finished", (payload) => {
        this.syncServerTime(payload.serverTime);
        if (this.privateExploration) this.privateExploration = { ...this.privateExploration, activeSearch: null };
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("exploration-finished", payload);
      });
      this.socket.on("exploration:error", (error) => this.emitLocal("exploration-error", error));
      this.socket.on("game:ready-for-discussion", ({ room }) => {
        this.acceptRoomUpdate(room);
        this.emitLocal("ready-for-discussion", room);
      });
      this.socket.on("discussion:started", (payload) => {
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("discussion-started", payload);
      });
      this.socket.on("discussion:state", (payload) => {
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("discussion-state", payload);
      });
      this.socket.on("discussion:finished", (payload) => {
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("discussion-finished", payload);
      });
      ["reconstruction:started", "reconstruction:board-updated", "reconstruction:progress", "reconstruction:locked", "reconstruction:result"].forEach((eventName) => {
        this.socket.on(eventName, (payload) => {
          this.syncServerTime(payload.serverTime);
          if (payload.room) this.acceptRoomUpdate(payload.room);
          this.emitLocal(eventName.replace(":", "-"), payload);
        });
      });
      this.socket.on("reconstruction:error", (error) => this.emitLocal("reconstruction-error", error));
      this.socket.on("game:ready-for-voting", (payload) => {
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("ready-for-voting", payload.room);
      });
      this.socket.on("voting:started", (payload) => {
        this.hasVoted = false;
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("voting-started", payload);
      });
      this.socket.on("voting:progress", (payload) => this.emitLocal("voting-progress", payload));
      this.socket.on("voting:closed", (payload) => {
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("voting-closed", payload);
      });
      this.socket.on("voting:tiebreaker", (payload) => {
        this.hasVoted = false;
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("voting-tiebreaker", payload);
      });
      this.socket.on("game:result", (payload) => {
        this.syncServerTime(payload.serverTime);
        this.acceptRoomUpdate(payload.room);
        this.emitLocal("game-result", payload);
      });
      this.socket.on("vote:error", (error) => this.emitLocal("vote-error", error));
      this.socket.on("chat:history", ({ messages }) => this.acceptChatHistory(messages));
      this.socket.on("chat:message", (message) => this.acceptChatMessage(message));
      this.socket.on("chat:error", (error) => this.emitLocal("chat-error", error));
      this.socket.on("game:reset", ({ room, message }) => {
        this.clearPrivateGameData();
        this.acceptRoomUpdate(room);
        this.emitLocal("game-reset", { room, message });
      });
      this.socket.on("game:cancelled", ({ message, room }) => {
        this.clearPrivateGameData();
        this.acceptRoomUpdate(room);
        this.emitLocal("game-cancelled", { message, room });
      });
      this.socket.on("game:error", (error) => this.emitLocal("error", error));
      this.socket.on("room:left", () => this.clearRoom());
      this.socket.on("room:closed", () => {
        this.clearRoom();
        this.emitLocal("closed");
      });
      this.socket.on("room:error", (error) => this.emitLocal("error", error));
      this.socket.on("player:disconnected", ({ playerId, room }) => {
        this.acceptRoomUpdate(room);
        this.emitLocal("player-disconnected", { playerId });
      });
      this.socket.on("player:reconnected", ({ playerId, room }) => {
        this.acceptRoomUpdate(room);
        this.emitLocal("player-reconnected", { playerId });
      });
      this.socket.on("player:removed", ({ playerId }) => this.emitLocal("player-removed", { playerId }));
      this.socket.on("host:changed", ({ room }) => {
        this.acceptRoomUpdate(room);
        this.emitLocal("host-changed", room);
      });
    }

    async createRoom(name) {
      const result = await this.request("room:create", { name });
      this.acceptJoinedRoom(result);
      return result;
    }

    async joinRoom(name, code) {
      const result = await this.request("room:join", { name, code });
      this.acceptJoinedRoom(result);
      return result;
    }

    async restoreSession() {
      if (!this.session || this.restoreInProgress || !this.socket.connected) return null;
      this.restoreInProgress = true;
      try {
        const result = await this.request("room:restore", this.session);
        this.acceptJoinedRoom(result);
        this.emitLocal("restored", result.room);
        return result;
      } catch (error) {
        if (["INVALID_SESSION", "ROOM_NOT_FOUND", "SESSION_EXPIRED", "RECONNECTION_FAILED"].includes(error.code)) {
          this.clearRoom();
          this.emitLocal("restore-failed", error);
        }
        return null;
      } finally {
        this.restoreInProgress = false;
      }
    }

    async leaveRoom() {
      if (!this.socket.connected) {
        this.clearRoom();
        return { offline: true };
      }
      const result = await this.request("room:leave");
      this.clearRoom();
      return result;
    }

    startRoom() {
      return this.request("game:start");
    }

    resetRoom() {
      return this.request("game:reset");
    }

    confirmStory() {
      return this.request("story:confirm");
    }

    confirmRole() {
      return this.request("role:confirm");
    }

    confirmExplorationReady() {
      return this.request("exploration:ready");
    }

    async sendExplorationPosition(position) {
      const result = await this.request("exploration:position", position);
      this.privateExploration = { ...(this.privateExploration || {}), ...result.position };
      return result;
    }

    async transitionExplorationScene(targetSceneId) {
      const result = await this.request("exploration:transition", { targetSceneId });
      this.privateExploration = { ...(this.privateExploration || {}), ...result.position };
      return result;
    }

    investigateObject(objectId) {
      return this.request("exploration:investigate", { objectId });
    }

    analyzeClue(clueId) {
      return this.request("exploration:analyze", { clueId });
    }

    startDiscussion() {
      return this.request("discussion:start");
    }

    placeReconstructionClue(clueId, slot, boardVersion) {
      return this.request("reconstruction:place", { clueId, slot, boardVersion });
    }

    moveReconstructionClue(clueId, slot, boardVersion) {
      return this.request("reconstruction:move", { clueId, slot, boardVersion });
    }

    removeReconstructionClue(clueId, boardVersion) {
      return this.request("reconstruction:remove", { clueId, boardVersion });
    }

    async confirmReconstruction(boardVersion) {
      const result = await this.request("reconstruction:confirm", { boardVersion });
      this.reconstructionConfirmedVersion = boardVersion;
      return result;
    }

    sendChatMessage(text) {
      return this.request("chat:send", { text });
    }

    submitVote(candidateId) {
      return this.request("vote:submit", { candidateId });
    }

    playAgain() {
      return this.request("game:play-again");
    }

    returnToMenu() {
      return this.request("game:return-to-menu");
    }

    request(eventName, payload) {
      if (!this.socket.connected) {
        return Promise.reject(new MultiplayerError("SERVER_DISCONNECTED", "No hay conexión con el servidor."));
      }

      const deduplicate = !["chat:send", "exploration:position"].includes(eventName);
      if (deduplicate && this.pendingRequests.has(eventName)) return this.pendingRequests.get(eventName);
      const operation = new Promise((resolve, reject) => {
        this.socket.timeout(5000).emit(eventName, payload, (timeoutError, response) => {
          if (timeoutError) {
            reject(new MultiplayerError("SERVER_TIMEOUT", "El servidor tardó demasiado en responder."));
            return;
          }
          if (!response?.ok) {
            reject(new MultiplayerError(
              response?.error?.code || "INTERNAL_ERROR",
              response?.error?.message || "Ocurrió un error inesperado.",
              response?.error?.recoverable !== false
            ));
            return;
          }
          resolve(response.data);
        });
      });
      if (deduplicate) {
        this.pendingRequests.set(eventName, operation);
        operation.finally(() => this.pendingRequests.delete(eventName)).catch(() => {});
      }
      return operation;
    }

    acceptJoinedRoom(result) {
      if (!result?.room || !result?.session) return;
      const hadActiveRoom = Boolean(this.currentRoom);
      this.currentRoom = result.room;
      this.session = result.session;
      this.saveSession(result.session);
      this.emitLocal(hadActiveRoom ? "room-updated" : "joined", result.room);
    }

    acceptRoomUpdate(room) {
      if (!room || !this.session || room.code !== this.session.roomCode) return;
      if (this.currentRoom?.reconstruction?.version !== room.reconstruction?.version) this.reconstructionConfirmedVersion = null;
      this.currentRoom = room;
      if (room.state === "waiting") this.clearPrivateGameData();
      this.emitLocal("room-updated", room);
    }

    syncServerTime(serverTime) {
      if (Number.isFinite(serverTime)) this.serverTimeOffset = serverTime - Date.now();
    }

    acceptChatHistory(messages) {
      if (!Array.isArray(messages)) return;
      this.chatMessages = [];
      this.chatMessageIds.clear();
      messages.forEach((message) => this.addChatMessage(message));
      this.emitLocal("chat-history", { messages: [...this.chatMessages] });
    }

    acceptChatMessage(message) {
      if (!this.addChatMessage(message)) return;
      this.emitLocal("chat-message", message);
    }

    addChatMessage(message) {
      if (!message?.id || this.chatMessageIds.has(message.id) || typeof message.text !== "string") return false;
      const safeMessage = { id: message.id, senderId: message.senderId, senderName: message.senderName, text: message.text, sentAt: message.sentAt };
      this.chatMessageIds.add(safeMessage.id);
      this.chatMessages.push(safeMessage);
      if (this.chatMessages.length > 100) {
        const removed = this.chatMessages.splice(0, this.chatMessages.length - 100);
        removed.forEach((item) => this.chatMessageIds.delete(item.id));
      }
      return true;
    }

    clearRoom() {
      this.currentRoom = null;
      this.session = null;
      this.pendingRequests.clear();
      this.clearPrivateGameData();
      try { window.sessionStorage.removeItem(SESSION_KEY); } catch (error) { /* La sesión caducará en el servidor. */ }
    }

    abandonSession() {
      this.clearRoom();
    }

    readSession() {
      try {
        const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY));
        if (!value?.roomCode || !value?.playerId || !value?.reconnectToken) {
          window.sessionStorage.removeItem(SESSION_KEY);
          return null;
        }
        return value;
      } catch (error) {
        try { window.sessionStorage.removeItem(SESSION_KEY); } catch (storageError) { /* Sin almacenamiento disponible. */ }
        return null;
      }
    }

    saveSession(session) {
      try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (error) {
        this.emitLocal("storage-error", { message: "La sesión no podrá recuperarse si cierras esta pestaña." });
      }
    }

    clearPrivateGameData() {
      this.privateRole = null;
      this.privateClues = null;
      this.privateExploration = null;
      this.chatMessages = [];
      this.chatMessageIds.clear();
      this.serverTimeOffset = 0;
      this.hasVoted = false;
      this.reconstructionConfirmedVersion = null;
      this.confirmations = { story: false, role: false, exploration: false };
    }
  }

  window.MultiplayerClient = MultiplayerClient;
})();
