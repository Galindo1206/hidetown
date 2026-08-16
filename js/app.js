(function () {
  "use strict";

  const NAME_PATTERN = /^[\p{L}\p{N} ._'’-]+$/u;
  const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5,6}$/;
  const announcer = document.querySelector("#app-announcer");
  const soundButton = document.querySelector("#sound-toggle");
  const multiplayer = new window.MultiplayerClient();
  const audio = new window.AudioManager();
  const explorationGame = new window.ExplorationGame({
    multiplayer,
    audio,
    onError(error) { showNotice(document.querySelector("#exploration-notice"), error.message, "error"); },
    onRetry() {
      explorationGame.destroy({ preserveFailures: true });
      void mountExplorationGame(multiplayer.currentRoom);
    },
    async onExit() {
      try { await multiplayer.leaveRoom(); }
      catch (error) { multiplayer.abandonSession(); }
      navigation.goTo("menu");
    }
  });
  let copyFeedbackTimer;
  let roleWasRevealed = false;
  let explorationClockInterval;
  let discussionClockInterval;
  let votingClockInterval;
  let pendingVoteCandidate = null;
  let selectedReconstructionClue = null;
  let pendingReconstructionChange = null;
  let reviewReturnScreen = "voting-ready";
  let connectionAlertTimer;
  let connectionWakeTimer;
  let explorationMountPromise = null;
  let latestExplorationState = null;
  let lastPublicErrorCode = "NINGUNO";
  let lastReportableStage = "menu";
  const timerWarningsPlayed = new Set();

  function missingExplorationResource(room) {
    if (!document.querySelector("#exploration-canvas")?.isConnected) return "#exploration-canvas";
    if (!window.Phaser) return "/vendor/phaser.js";
    const scripts = [
      ["PreloadScene", "/js/game/scenes/PreloadScene.js"], ["VillageScene", "/js/game/scenes/VillageScene.js"],
      ["ChurchScene", "/js/game/scenes/ChurchScene.js"], ["CaretakerHouseScene", "/js/game/scenes/CaretakerHouseScene.js"],
      ["BellTowerScene", "/js/game/scenes/BellTowerScene.js"], ["ExplorationAudio", "/js/game/systems/ExplorationAudio.js"]
    ];
    const missingScript = scripts.find(([name]) => !window.HideTownGame?.[name]);
    if (missingScript) return missingScript[1];
    if (!room?.exploration?.world) return "game:state.exploration.world";
    if (!multiplayer.privateExploration) return "game:state.exploration";
    return null;
  }

  function mountExplorationGame(state) {
    if (state?.state === "exploration") latestExplorationState = state;
    const room = latestExplorationState || multiplayer.currentRoom;
    if (room?.state !== "exploration") return Promise.resolve(false);
    if (explorationGame.mounted) return Promise.resolve(explorationGame.sync(room));
    if (explorationMountPromise) return explorationMountPromise;

    explorationGame.showLoading();
    explorationMountPromise = new Promise((resolve) => {
      const startedAt = Date.now();
      const attempt = async () => {
        const currentRoom = latestExplorationState || multiplayer.currentRoom;
        if (currentRoom?.state !== "exploration") { resolve(false); return; }
        const missing = missingExplorationResource(currentRoom);
        if (!missing) {
          const explorationScreen = document.querySelector("#exploration-screen");
          if (explorationScreen?.hidden && !navigation.isTransitioning && navigation.currentId !== "exploration-screen") {
            navigation.goTo("exploration-screen", { focus: false });
          }
          const remaining = Math.max(0, 12_000 - (Date.now() - startedAt));
          const size = await window.HideTownGame.waitForVisibleContainer(
            document.querySelector("#exploration-canvas"),
            Math.min(1_000, remaining)
          );
          const authoritativeRoom = multiplayer.currentRoom?.state === "exploration" ? multiplayer.currentRoom : currentRoom;
          if (size && explorationGame.mount(authoritativeRoom, size)) { resolve(true); return; }
        }
        if (explorationGame.failed) { resolve(false); return; }
        if (Date.now() - startedAt >= 12_000) {
          const code = missing ? "MAP_RESOURCE_UNAVAILABLE" : "MAP_CONTAINER_UNAVAILABLE";
          explorationGame.showError(`Tu navegador no pudo iniciar el mapa. Intenta nuevamente. Código: ${code}.`);
          console.error("Phaser mount failed", { code, renderer: "canvas", resource: missing || "#exploration-canvas" });
          resolve(false);
          return;
        }
        window.setTimeout(attempt, 50);
      };
      window.requestAnimationFrame(attempt);
    }).finally(() => { explorationMountPromise = null; });
    return explorationMountPromise;
  }

  const screenNames = {
    menu: "Menú principal",
    "create-room": "Crear una sala",
    "join-room": "Unirse a una sala",
    "waiting-room": "Sala de espera",
    "story-screen": "Historia de San Jerónimo",
    "role-screen": "Revelación privada del rol",
    "exploration-ready": "Preparación para explorar",
    "exploration-screen": "Mapa de San Jerónimo",
    "exploration-finished": "Fin de la exploración",
    "discussion-ready": "Preparados para conversar",
    "discussion-screen": "Conversación del pueblo",
    "voting-ready": "Preparados para decidir",
    "voting-screen": "Votación secreta",
    "calculating-result": "Conteo de votos",
    "game-result": "Resultado final",
    "how-to-play": "Cómo jugar",
    "about-prototype": "Acerca del prototipo"
  };

  const stateScreens = {
    waiting: "waiting-room",
    story: "story-screen",
    role_reveal: "role-screen",
    waiting_ready: "role-screen",
    ready_for_exploration: "exploration-ready",
    exploration: "exploration-screen",
    exploration_finished: "exploration-finished",
    ready_for_discussion: "discussion-ready",
    discussion: "discussion-screen",
    discussion_finished: "discussion-screen",
    ready_for_voting: "voting-ready",
    voting: "voting-screen",
    vote_tiebreaker: "voting-screen",
    calculating_result: "calculating-result",
    game_finished: "game-result"
  };

  const navigation = new window.ScreenNavigation({
    onChange(screenId) {
      clearScreenFeedback(screenId);
      if (screenId !== "about-prototype") lastReportableStage = screenId;
      announce(screenNames[screenId] || "Pantalla cambiada");
    }
  });

  function announce(message) {
    announcer.textContent = "";
    window.setTimeout(() => { announcer.textContent = message; }, 20);
  }

  function renderSoundState(isMuted) {
    soundButton.setAttribute("aria-pressed", String(isMuted));
    soundButton.setAttribute("aria-label", isMuted ? "Activar sonido" : "Silenciar sonido");
    soundButton.querySelector(".sound-toggle__text").textContent = isMuted ? "Silenciado" : "Sonido";
  }

  function setFieldError(input, errorElement, message) {
    input.setAttribute("aria-invalid", String(Boolean(message)));
    errorElement.textContent = message;
  }

  function validatePlayerName(input, errorElement) {
    const value = input.value.normalize("NFKC").replace(/\s+/g, " ").trim();
    let message = "";
    if (!value) message = "Ingresa tu nombre.";
    else if (value.length < 2 || value.length > 20 || !NAME_PATTERN.test(value) || /[<>]/.test(value)) {
      message = "Usa entre 2 y 20 letras, números o separadores sencillos.";
    }
    setFieldError(input, errorElement, message);
    if (!message) input.value = value;
    return !message;
  }

  function validateCode(input, errorElement) {
    const value = input.value.trim().toUpperCase();
    const message = !value ? "Ingresa el código de sala." : CODE_PATTERN.test(value) ? "" : "El código debe tener 5 o 6 caracteres válidos.";
    setFieldError(input, errorElement, message);
    return !message;
  }

  function setFormBusy(form, isBusy) {
    form.setAttribute("aria-busy", String(isBusy));
    form.querySelectorAll("button, input").forEach((control) => { control.disabled = isBusy; });
  }

  function showNotice(element, message, type = "info") {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("notice--error", type === "error");
    element.classList.toggle("notice--success", type === "success");
    element.hidden = false;
  }

  function showToast(message, type = "info") {
    const now = Date.now();
    if (showToast.lastMessage === message && now - (showToast.lastAt || 0) < 1_000) return;
    showToast.lastMessage = message;
    showToast.lastAt = now;
    const toast = document.querySelector("#app-toast");
    showNotice(toast, message, type);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 5000);
    announce(message);
  }

  function showConnectionAlert(message, state = "info", { persistent = false, showHome = false, showRetry = false } = {}) {
    const alert = document.querySelector("#connection-alert");
    window.clearTimeout(connectionAlertTimer);
    alert.dataset.state = state;
    alert.dataset.persistent = String(persistent);
    document.querySelector("#connection-alert-message").textContent = message;
    document.querySelector("#connection-alert-close").hidden = persistent;
    document.querySelector("#connection-alert-retry").hidden = !showRetry;
    document.querySelector("#connection-alert-home").hidden = !showHome;
    alert.hidden = false;
    announce(message);
    if (!persistent) connectionAlertTimer = window.setTimeout(() => { alert.hidden = true; }, 4_000);
  }

  function recordPublicError(error) {
    if (typeof error?.code === "string" && /^[A-Z0-9_]{2,64}$/.test(error.code)) lastPublicErrorCode = error.code;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.setAttribute("readonly", "");
    temporary.className = "sr-only";
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand("copy");
    temporary.remove();
    if (!copied) throw new Error("copy failed");
  }

  function browserLabel() {
    const userAgent = navigator.userAgent;
    const match = ["Edg", "Firefox", "Chrome", "Version"]
      .map((name) => userAgent.match(new RegExp(`${name}/(\\d+(?:\\.\\d+)?)`)))
      .find(Boolean);
    if (!match) return "Navegador no identificado";
    const product = match[0].split("/")[0];
    const name = product === "Edg" ? "Microsoft Edge" : product === "Version" ? "Safari" : product;
    return `${name} ${match[1]}`;
  }

  async function copySafeReport() {
    const version = document.querySelector('meta[name="application-version"]')?.content || "desconocida";
    const report = [
      "Reporte técnico — El Pueblo Oculto",
      `Versión: ${version}`,
      `Etapa: ${lastReportableStage}`,
      `Navegador: ${browserLabel()}`,
      `Fecha: ${new Date().toISOString()}`,
      `Código de error público: ${lastPublicErrorCode}`,
      "Descripción: añade aquí qué estabas intentando hacer, sin incluir datos privados de la partida."
    ].join("\n");
    const notice = document.querySelector("#report-notice");
    try {
      await copyText(report);
      showNotice(notice, "Reporte seguro copiado. Revisa y completa la descripción antes de enviarlo.", "success");
    } catch {
      showNotice(notice, "No se pudo copiar automáticamente. Revisa los permisos del portapapeles.", "error");
    }
  }

  function hideConnectionAlert({ force = false } = {}) {
    const alert = document.querySelector("#connection-alert");
    if (!force && alert.dataset.persistent === "true") return;
    window.clearTimeout(connectionAlertTimer);
    alert.hidden = true;
  }

  function clearScreenFeedback(screenId) {
    if (["create-room", "join-room"].includes(screenId)) {
      document.querySelectorAll(`#${screenId} .notice`).forEach((notice) => {
        notice.hidden = true;
        notice.textContent = "";
      });
    }
    if (screenId === "menu") {
      document.querySelectorAll("input[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
      document.querySelectorAll(".field__error").forEach((error) => { error.textContent = ""; });
    }
  }

  async function handleCreateSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const nameInput = document.querySelector("#create-name");
    const notice = document.querySelector("#create-notice");
    notice.hidden = true;
    if (!validatePlayerName(nameInput, document.querySelector("#create-name-error"))) {
      nameInput.focus();
      return;
    }
    setFormBusy(form, true);
    try { await multiplayer.createRoom(nameInput.value); }
    catch (error) { showNotice(notice, error.message, "error"); }
    finally { setFormBusy(form, false); }
  }

  async function handleJoinSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const nameInput = document.querySelector("#join-name");
    const codeInput = document.querySelector("#room-code");
    const notice = document.querySelector("#join-notice");
    const nameValid = validatePlayerName(nameInput, document.querySelector("#join-name-error"));
    const codeValid = validateCode(codeInput, document.querySelector("#room-code-error"));
    notice.hidden = true;
    if (!nameValid || !codeValid) {
      (nameValid ? codeInput : nameInput).focus();
      return;
    }
    setFormBusy(form, true);
    try { await multiplayer.joinRoom(nameInput.value, codeInput.value); }
    catch (error) { showNotice(notice, error.message, "error"); }
    finally { setFormBusy(form, false); }
  }

  function createBadge(text, className) {
    const badge = document.createElement("span");
    badge.className = `player-badge ${className}`;
    badge.textContent = text;
    return badge;
  }

  function renderPlayerList(list, players) {
    const fragment = document.createDocumentFragment();
    players.forEach((player) => {
      const item = document.createElement("li");
      item.className = "player-item";
      if (!player.connected) item.classList.add("is-disconnected");
      const avatar = document.createElement("span");
      avatar.className = "player-avatar";
      avatar.textContent = player.name.charAt(0).toLocaleUpperCase("es");
      avatar.setAttribute("aria-hidden", "true");
      const identity = document.createElement("div");
      identity.className = "player-identity";
      const name = document.createElement("strong");
      name.textContent = player.id === multiplayer.session?.playerId ? `${player.name} (tú)` : player.name;
      const badges = document.createElement("div");
      badges.className = "player-badges";
      if (player.isHost) badges.append(createBadge("Anfitrión", "player-badge--host"));
      if (!player.connected) badges.append(createBadge("Desconectado", "player-badge--offline"));
      identity.append(name, badges);
      const status = document.createElement("span");
      status.className = "player-status";
      status.setAttribute("aria-label", player.connected ? "Conectado" : "Desconectado temporalmente");
      item.append(avatar, identity, status);
      fragment.append(item);
    });
    list.replaceChildren(fragment);
  }

  function renderWaitingRoom(room) {
    const currentPlayer = room.players.find((player) => player.id === multiplayer.session?.playerId);
    const disconnectedPlayers = room.players.filter((player) => !player.connected);
    renderPlayerList(document.querySelector("#player-list"), room.players);
    document.querySelector("#waiting-room-code").textContent = room.code;
    document.querySelector("#player-count").textContent = `${room.players.length}/${room.maxPlayers}`;
    const startButton = document.querySelector("#start-room");
    const canStart = room.players.length >= room.minPlayers && disconnectedPlayers.length === 0 && room.state === "waiting";
    startButton.hidden = !currentPlayer?.isHost;
    startButton.disabled = !canStart;
    const requirement = document.querySelector("#start-requirement");
    if (room.players.length < room.minPlayers) {
      const missing = room.minPlayers - room.players.length;
      requirement.textContent = `Faltan ${missing} jugador${missing === 1 ? "" : "es"} para iniciar.`;
    } else if (disconnectedPlayers.length) {
      requirement.textContent = "Espera a que todos los jugadores vuelvan a conectarse.";
    } else if (currentPlayer?.isHost) {
      requirement.textContent = "El pueblo está listo. Puedes iniciar cuando quieras.";
    } else {
      requirement.textContent = "Esperando a que el anfitrión inicie la partida.";
    }
    showNotice(document.querySelector("#room-notice"), disconnectedPlayers.length ? "Hay jugadores desconectados temporalmente." : "Esperando jugadores…");
  }

  function renderStory(room) {
    const story = room.story;
    if (!story) return;
    document.querySelector("#story-location").textContent = story.location;
    document.querySelector("#story-title").textContent = story.title;
    document.querySelector("#story-atmosphere").textContent = story.atmosphere;
    document.querySelector("#story-transition").textContent = story.transitionText;
    const fragment = document.createDocumentFragment();
    story.introduction.forEach((paragraph) => {
      const element = document.createElement("p");
      element.textContent = paragraph;
      fragment.append(element);
    });
    document.querySelector("#story-introduction").replaceChildren(fragment);
    document.querySelector("#story-player-count").textContent = `${room.players.length} jugadores`;
    document.querySelector("#story-progress").textContent = `${room.progress.storyConfirmed} de ${room.progress.total} jugadores preparados`;
    const confirmed = multiplayer.confirmations.story;
    document.querySelector("#confirm-story").hidden = confirmed;
    document.querySelector("#story-waiting").hidden = !confirmed;
  }

  function renderRoleStage(room) {
    document.querySelector("#role-progress").textContent = `${room.progress.roleConfirmed} de ${room.progress.total} jugadores preparados`;
    renderRoleConfirmationState();
  }

  function createClueCard(card, label = "Pista privada") {
    const article = document.createElement("article");
    article.className = "clue-card";
    article.dataset.clueType = card.type || "private";
    const meta = document.createElement("div");
    meta.className = "clue-card__meta";
    const type = document.createElement("span");
    const clueTypes = {
      physical: ["Huella", "◇"], trace: ["Rastro", "⌁"], object: ["Objeto", "◆"],
      testimony: ["Testimonio", "◌"], document: ["Documento", "▤"], analysis: ["Análisis", "⌕"],
      fragment: ["Fragmento", "◒"], private: [label, "✦"]
    };
    const [typeName, symbol] = clueTypes[card.type] || clueTypes.private;
    type.className = "clue-card__type";
    const icon = document.createElement("span");
    icon.className = "clue-card__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = symbol;
    type.append(icon, document.createTextNode(label === "Pista privada" ? typeName : label));
    const reliability = document.createElement("span");
    reliability.className = "clue-card__reliability";
    reliability.textContent = card.reliability;
    meta.append(type, reliability);
    const title = document.createElement("h3");
    title.textContent = card.title;
    const text = document.createElement("p");
    text.textContent = card.text;
    article.append(meta, title, text);
    if (card.zoneName || card.objectName) {
      const location = document.createElement("p");
      location.className = "clue-card__location";
      location.textContent = [card.zoneName, card.objectName].filter(Boolean).join(" · ");
      article.append(location);
    }
    if (card.analysis) {
      const analysis = document.createElement("p");
      analysis.className = "clue-card__analysis";
      analysis.textContent = `Análisis: ${card.analysis}`;
      article.append(analysis);
    } else if (multiplayer.privateRole?.id === "investigator" && multiplayer.currentRoom?.state === "exploration" && !multiplayer.privateExploration?.analysisUsed) {
      const analyze = document.createElement("button");
      analyze.className = "button button--secondary button--full analyze-clue";
      analyze.type = "button";
      analyze.dataset.clueId = card.id;
      analyze.textContent = "Analizar evidencia";
      article.append(analyze);
    }
    return article;
  }

  function renderExplorationReady(room) {
    const exploration = room.exploration;
    if (!exploration) return;
    document.querySelector("#exploration-duration").textContent = `${room.explorationDurationSeconds || 90} segundos`;
    document.querySelector("#exploration-ready-progress").textContent = `${exploration.readyCount} de ${exploration.total} jugadores preparados`;
    document.querySelector("#exploration-zone-summary").replaceChildren(...exploration.zones.map((zone) => {
      const item = document.createElement("li");
      item.textContent = `${zone.symbol} ${zone.name}`;
      return item;
    }));
    const confirmed = multiplayer.confirmations.exploration;
    document.querySelector("#confirm-exploration-ready").hidden = confirmed;
    document.querySelector("#exploration-ready-waiting").hidden = !confirmed;
  }


  function updateExplorationClock(room) {
    const endsAt = room.exploration?.endsAt;
    const remaining = Number.isFinite(endsAt) ? Math.max(0, Math.ceil((endsAt - (Date.now() + multiplayer.serverTimeOffset)) / 1_000)) : 0;
    document.querySelector("#exploration-timer-value").textContent = formatClock(remaining);
    const timer = document.querySelector("#exploration-timer");
    timer.dataset.warning = remaining <= 5 ? "final" : remaining <= 15 ? "thirty" : remaining <= 30 ? "minute" : "normal";
    const threshold = remaining <= 5 ? 5 : remaining <= 10 ? 10 : remaining <= 15 ? 15 : remaining <= 30 ? 30 : null;
    const warningKey = threshold ? `exploration:${endsAt}:${threshold}` : null;
    if (warningKey && remaining > 0 && !timerWarningsPlayed.has(warningKey)) {
      timerWarningsPlayed.add(warningKey);
      audio.play("warning");
      announce(threshold === 5 ? "Últimos cinco segundos de exploración" : `Quedan ${threshold} segundos para explorar`);
    }
    document.querySelector("#exploration-timer-status").textContent = remaining === 0 ? "Exploración finalizada" : remaining <= 5 ? `Últimos ${remaining} segundos` : remaining <= 15 ? "Quedan 15 segundos" : remaining <= 30 ? "Quedan 30 segundos" : "Tiempo restante";
  }

  function renderExploration(room) {
    const exploration = room.exploration;
    if (!exploration) return;
    const privateState = multiplayer.privateExploration || {};
    document.querySelector("#exploration-clue-count").textContent = `${privateState.clueCount || 0}/2 pistas`;
    window.clearInterval(explorationClockInterval);
    updateExplorationClock(room);
    explorationClockInterval = window.setInterval(() => updateExplorationClock(multiplayer.currentRoom || room), 250);
  }

  function renderDiscussionStage(room) {
    const list = document.querySelector("#discussion-player-list");
    const fragment = document.createDocumentFragment();
    room.players.forEach((player) => {
      const item = document.createElement("li");
      const marker = document.createElement("span");
      marker.textContent = "✓";
      marker.setAttribute("aria-hidden", "true");
      const name = document.createElement("strong");
      name.textContent = player.name;
      item.append(marker, name);
      fragment.append(item);
    });
    list.replaceChildren(fragment);
    const currentPlayer = room.players.find((player) => player.id === multiplayer.session?.playerId);
    const duration = room.discussionDurationSeconds || 240;
    document.querySelector("#discussion-duration").textContent = duration % 60 === 0 ? `${duration / 60} minutos` : `${duration} segundos`;
    document.querySelector("#start-discussion").hidden = !currentPlayer?.isHost;
    document.querySelector("#discussion-host-waiting").hidden = Boolean(currentPlayer?.isHost);
    document.querySelector("#reset-before-discussion").hidden = !currentPlayer?.isHost;
  }

  function renderCompactPlayers(room) {
    const fragment = document.createDocumentFragment();
    room.players.forEach((player) => {
      const item = document.createElement("li");
      if (!player.connected) item.classList.add("is-disconnected");
      const name = document.createElement("span");
      name.textContent = player.name;
      item.append(name);
      item.title = player.connected ? `${player.name}: conectado` : `${player.name}: desconectado temporalmente`;
      fragment.append(item);
    });
    document.querySelector("#chat-player-list").replaceChildren(fragment);
  }

  function formatClock(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function updateDiscussionClock(room) {
    const timer = document.querySelector("#discussion-timer");
    const value = document.querySelector("#timer-value");
    const status = document.querySelector("#timer-status");
    const endsAt = room.discussion?.endsAt;
    const remaining = Number.isFinite(endsAt) ? Math.max(0, Math.ceil((endsAt - (Date.now() + multiplayer.serverTimeOffset)) / 1_000)) : 0;
    value.textContent = formatClock(remaining);
    timer.dataset.warning = remaining <= 10 ? "final" : remaining <= 30 ? "thirty" : remaining <= 60 ? "minute" : "normal";
    const warningKey = `discussion:${endsAt}`;
    if (remaining > 0 && remaining <= 10 && !timerWarningsPlayed.has(warningKey)) {
      timerWarningsPlayed.add(warningKey);
      audio.play("warning");
    }
    status.textContent = remaining === 0 ? "Tiempo finalizado" : remaining <= 10 ? `Últimos ${remaining} segundos` : remaining <= 30 ? "Menos de 30 segundos" : remaining <= 60 ? "Menos de un minuto" : "Tiempo restante";
  }

  function startDiscussionClock(room) {
    window.clearInterval(discussionClockInterval);
    updateDiscussionClock(room);
    if (room.state !== "discussion") return;
    discussionClockInterval = window.setInterval(() => updateDiscussionClock(multiplayer.currentRoom || room), 250);
  }

  function isChatNearBottom() {
    const messages = document.querySelector("#chat-messages");
    return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 90;
  }

  function createChatMessage(message) {
    const article = document.createElement("article");
    article.className = "chat-message";
    article.dataset.messageId = message.id;
    if (message.senderId === multiplayer.session?.playerId) article.classList.add("is-own");
    const meta = document.createElement("div");
    meta.className = "chat-message__meta";
    const sender = document.createElement("strong");
    sender.textContent = message.senderId === multiplayer.session?.playerId ? `${message.senderName} (tú)` : message.senderName;
    const time = document.createElement("time");
    time.dateTime = new Date(message.sentAt).toISOString();
    time.textContent = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(message.sentAt);
    const text = document.createElement("p");
    text.textContent = message.text;
    meta.append(sender, time);
    article.append(meta, text);
    return article;
  }

  function appendChatMessage(message, { forceScroll = false } = {}) {
    const messages = document.querySelector("#chat-messages");
    if (messages.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)) return;
    const shouldScroll = forceScroll || isChatNearBottom() || message.senderId === multiplayer.session?.playerId;
    document.querySelector("#chat-empty").hidden = true;
    messages.append(createChatMessage(message));
    if (shouldScroll) {
      messages.scrollTop = messages.scrollHeight;
      document.querySelector("#new-messages").hidden = true;
    } else document.querySelector("#new-messages").hidden = false;
  }

  function renderChatHistory() {
    const messages = document.querySelector("#chat-messages");
    messages.querySelectorAll(".chat-message").forEach((item) => item.remove());
    document.querySelector("#chat-empty").hidden = multiplayer.chatMessages.length > 0;
    multiplayer.chatMessages.forEach((message) => messages.append(createChatMessage(message)));
    messages.scrollTop = messages.scrollHeight;
    document.querySelector("#new-messages").hidden = true;
  }

  function setChatLocked(locked) {
    const form = document.querySelector("#chat-form");
    form.hidden = locked;
    document.querySelector("#discussion-ended").hidden = !locked;
    document.querySelector("#chat-input").disabled = locked;
    document.querySelector("#send-chat").disabled = locked;
  }

  function createReconstructionClue(clue, locked) {
    const card = document.createElement("div");
    card.className = "reconstruction-clue";
    const title = document.createElement("strong");
    title.textContent = clue.title;
    const text = document.createElement("p");
    text.textContent = clue.text;
    const meta = document.createElement("span");
    meta.textContent = `${clue.zoneName} · ${clue.objectName} · de ${clue.ownerName}`;
    card.append(title, text, meta);
    if (!locked && clue.ownerId === multiplayer.session?.playerId) {
      const move = document.createElement("button");
      move.type = "button";
      move.className = "button button--secondary reconstruction-select-placed";
      move.dataset.clueId = clue.id;
      move.textContent = "Mover mi pista";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button--danger reconstruction-remove";
      remove.dataset.clueId = clue.id;
      remove.textContent = "Retirar";
      card.append(move, remove);
    }
    return card;
  }

  function renderReconstruction(room) {
    const reconstruction = room.reconstruction;
    if (!reconstruction) return;
    const ownId = multiplayer.session?.playerId;
    const placedIds = new Set(reconstruction.slots.flatMap((slot) => slot.clue ? [slot.clue.id] : []));
    if (selectedReconstructionClue && !multiplayer.privateClues?.cards.some((clue) => clue.id === selectedReconstructionClue)) selectedReconstructionClue = null;
    document.querySelector("#reconstruction-version").textContent = `Versión ${reconstruction.version}`;
    document.querySelector("#reconstruction-progress").textContent = `${reconstruction.progress.confirmed} de ${reconstruction.progress.total} jugadores confirmaron esta versión`;
    const confirm = document.querySelector("#confirm-reconstruction");
    confirm.hidden = reconstruction.locked;
    confirm.disabled = multiplayer.reconstructionConfirmedVersion === reconstruction.version;
    confirm.textContent = confirm.disabled ? "Estás de acuerdo con esta versión" : "Estoy de acuerdo con este orden";

    const board = reconstruction.slots.map((slot) => {
      const item = document.createElement("li");
      item.className = "reconstruction-slot";
      item.dataset.slot = String(slot.id);
      const number = document.createElement("span");
      number.className = "reconstruction-slot__number";
      number.textContent = String(slot.id);
      number.setAttribute("aria-hidden", "true");
      const body = document.createElement("div");
      body.className = "reconstruction-slot__body";
      const title = document.createElement("strong");
      title.textContent = slot.title;
      body.append(title);
      if (slot.clue) body.append(createReconstructionClue(slot.clue, reconstruction.locked));
      else {
        const empty = document.createElement("span");
        empty.textContent = selectedReconstructionClue ? "Seleccionar esta etapa" : "Sin pista";
        body.append(empty);
      }
      if (!reconstruction.locked && selectedReconstructionClue && (!slot.clue || slot.clue.id === selectedReconstructionClue)) {
        item.classList.add("is-target");
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", `Colocar la pista seleccionada en ${slot.title}`);
      }
      item.append(number, body);
      return item;
    });
    document.querySelector("#reconstruction-board").replaceChildren(...board);

    const available = (multiplayer.privateClues?.cards || []).filter((clue) => !placedIds.has(clue.id));
    const tray = available.map((clue) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tray-clue";
      button.dataset.clueId = clue.id;
      button.setAttribute("aria-pressed", String(selectedReconstructionClue === clue.id));
      button.disabled = reconstruction.locked;
      const title = document.createElement("strong");
      title.textContent = clue.title;
      const meta = document.createElement("span");
      meta.textContent = `${clue.zoneName} · ${clue.objectName}`;
      button.append(title, meta);
      return button;
    });
    if (!tray.length) {
      const empty = document.createElement("p");
      empty.className = "notebook-empty";
      empty.textContent = "No tienes pistas sin colocar.";
      tray.push(empty);
    }
    document.querySelector("#reconstruction-tray-list").replaceChildren(...tray);

    const resultPanel = document.querySelector("#reconstruction-result");
    resultPanel.hidden = !reconstruction.result;
    if (reconstruction.result) {
      document.querySelector("#reconstruction-result-title").textContent = `${reconstruction.result.passed ? "Reconstrucción aprobada" : "Reconstrucción incompleta"} · ${reconstruction.result.score}/5`;
      document.querySelector("#reconstruction-result-message").textContent = reconstruction.result.message;
    }
  }

  function renderLiveDiscussion(room) {
    document.querySelector("#live-discussion-title").textContent = room.story?.title || "Conversación del pueblo";
    renderCompactPlayers(room);
    renderChatHistory();
    const locked = room.state !== "discussion";
    setChatLocked(locked);
    renderReconstruction(room);
    document.querySelector("#back-to-decision").hidden = !["ready_for_voting", "voting", "vote_tiebreaker", "calculating_result", "game_finished"].includes(room.state);
    startDiscussionClock(room);
  }

  function renderVotingReady(room) {
    window.clearInterval(discussionClockInterval);
    const fragment = document.createDocumentFragment();
    room.players.forEach((player) => {
      const item = document.createElement("li");
      const marker = document.createElement("span");
      marker.textContent = "✓";
      marker.setAttribute("aria-hidden", "true");
      const name = document.createElement("strong");
      name.textContent = player.name;
      item.append(marker, name);
      fragment.append(item);
    });
    document.querySelector("#voting-player-list").replaceChildren(fragment);
  }

  function updateVotingClock(room) {
    const remaining = Number.isFinite(room.voting?.endsAt) ? Math.max(0, Math.ceil((room.voting.endsAt - (Date.now() + multiplayer.serverTimeOffset)) / 1_000)) : 0;
    const timer = document.querySelector("#voting-timer");
    document.querySelector("#voting-timer-value").textContent = formatClock(remaining);
    timer.dataset.warning = remaining <= 10 ? "final" : remaining <= 30 ? "thirty" : "normal";
    const warningKey = `voting:${room.voting?.endsAt}`;
    if (remaining > 0 && remaining <= 10 && !timerWarningsPlayed.has(warningKey)) {
      timerWarningsPlayed.add(warningKey);
      audio.play("warning");
    }
    document.querySelector("#voting-timer-status").textContent = remaining === 0 ? "Votación cerrada" : remaining <= 10 ? `Últimos ${remaining} segundos` : "Tiempo restante";
  }

  function startVotingClock(room) {
    window.clearInterval(votingClockInterval);
    updateVotingClock(room);
    if (["voting", "vote_tiebreaker"].includes(room.state)) votingClockInterval = window.setInterval(() => updateVotingClock(multiplayer.currentRoom || room), 250);
  }

  function createCandidateOption(candidate) {
    const wrapper = document.createElement("div");
    wrapper.className = "candidate-option";
    const isSelf = candidate.id === multiplayer.session?.playerId;
    if (isSelf) wrapper.classList.add("is-self");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "candidate";
    input.id = `candidate-${candidate.id}`;
    input.value = candidate.id;
    input.disabled = isSelf || multiplayer.hasVoted;
    const label = document.createElement("label");
    label.htmlFor = input.id;
    const avatar = document.createElement("span");
    avatar.className = "candidate-avatar";
    avatar.textContent = candidate.name.charAt(0).toLocaleUpperCase("es");
    avatar.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "candidate-copy";
    const name = document.createElement("strong");
    name.textContent = candidate.name;
    const status = document.createElement("span");
    status.textContent = isSelf ? "No puedes votarte" : candidate.connected ? "Conectado" : "Desconectado temporalmente";
    copy.append(name, status);
    const choice = document.createElement("span");
    choice.className = "candidate-choice";
    const idleChoice = document.createElement("span");
    idleChoice.className = "candidate-choice__idle";
    idleChoice.textContent = "Elegir";
    const selectedChoice = document.createElement("span");
    selectedChoice.className = "candidate-choice__selected";
    selectedChoice.textContent = "✓ Seleccionado";
    choice.append(idleChoice, selectedChoice);
    label.append(avatar, copy, choice);
    wrapper.append(input, label);
    return wrapper;
  }

  function renderVoteConfirmationState(room) {
    const confirmed = multiplayer.hasVoted;
    document.querySelector("#vote-form").hidden = confirmed;
    document.querySelector("#vote-confirmed").hidden = !confirmed;
    if (confirmed) {
      document.querySelectorAll("input[name='candidate']").forEach((input) => { input.checked = false; });
      pendingVoteCandidate = null;
    }
    document.querySelector("#voting-progress").textContent = `${room.voting.progress.confirmed} de ${room.voting.progress.total} jugadores ya votaron`;
  }

  function renderVotingStage(room) {
    if (!room.voting) return;
    const isTiebreaker = room.state === "vote_tiebreaker";
    document.querySelector("#voting-round-label").textContent = isTiebreaker ? "Desempate secreto" : "Votación secreta";
    document.querySelector("#voting-title").textContent = isTiebreaker ? "El pueblo debe desempatar" : "¿Quién es la criatura?";
    document.querySelector("#voting-explanation").textContent = isTiebreaker
      ? "Solo permanecen los sospechosos empatados. Vuelve a elegir; si el empate continúa, la criatura ganará."
      : "Selecciona al jugador que consideras sospechoso. Tu elección permanecerá oculta hasta el resultado final.";
    const grid = document.querySelector("#candidate-grid");
    grid.querySelectorAll(".candidate-option").forEach((item) => item.remove());
    grid.append(...room.voting.candidates.map(createCandidateOption));
    document.querySelector("#prepare-vote").disabled = true;
    renderVoteConfirmationState(room);
    startVotingClock(room);
  }

  function createResultRoleCard(player) {
    const card = document.createElement("article");
    card.className = "result-role-card";
    card.dataset.role = player.role.id;
    const symbols = { creature: "◉", investigator: "⌕", inhabitant: "⌂" };
    const symbol = document.createElement("span");
    symbol.className = "result-role-card__symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = symbols[player.role.id] || "◇";
    const name = document.createElement("strong");
    name.textContent = player.name;
    const role = document.createElement("span");
    role.textContent = player.role.name;
    const votes = document.createElement("p");
    votes.textContent = `Votos recibidos: ${player.votesReceived.main} en la ronda principal${player.votesReceived.tiebreaker ? ` y ${player.votesReceived.tiebreaker} en el desempate` : ""}.`;
    card.append(symbol, name, role, votes);
    return card;
  }

  function createResultRound(round) {
    const section = document.createElement("article");
    section.className = "result-round";
    const title = document.createElement("h4");
    title.textContent = round.round === "tiebreaker" ? "Ronda de desempate" : "Votación principal";
    const summary = document.createElement("p");
    summary.className = "stage-meta";
    summary.textContent = `${round.validVotes} votos válidos · ${round.abstentions} abstenciones`;
    const totals = document.createElement("ul");
    totals.className = "result-totals";
    round.totals.forEach((total) => {
      const item = document.createElement("li");
      item.textContent = `${total.candidateName}: ${total.votes}`;
      totals.append(item);
    });
    const ballots = document.createElement("ul");
    ballots.className = "result-ballots";
    round.ballots.forEach((ballot) => {
      const item = document.createElement("li");
      const voter = document.createElement("strong");
      voter.textContent = ballot.voterName;
      const choice = document.createElement("span");
      choice.textContent = ballot.candidateName ? `votó por ${ballot.candidateName}` : "se abstuvo";
      item.append(voter, choice);
      ballots.append(item);
    });
    section.append(title, summary, totals, ballots);
    return section;
  }

  function createFinalReconstructionSlot(slot) {
    const item = document.createElement("li");
    item.className = "final-reconstruction-slot";
    item.dataset.correct = String(slot.correct);
    const heading = document.createElement("div");
    const number = document.createElement("span");
    number.textContent = String(slot.id);
    number.setAttribute("aria-hidden", "true");
    const title = document.createElement("strong");
    title.textContent = slot.title;
    const status = document.createElement("b");
    status.textContent = slot.correct ? "✓ Posición correcta" : "✗ Posición incorrecta";
    heading.append(number, title, status);
    item.append(heading);
    if (!slot.clue) {
      const empty = document.createElement("p");
      empty.textContent = "Esta etapa quedó vacía.";
      item.append(empty);
      return item;
    }
    const clueTitle = document.createElement("h4");
    clueTitle.textContent = slot.clue.title;
    const clueText = document.createElement("p");
    clueText.textContent = slot.clue.text;
    const details = document.createElement("ul");
    [
      slot.clue.authentic ? "✓ Pista auténtica" : "✗ Pista distorsionada",
      `Ubicación correcta: ${slot.clue.canonicalStep}. ${slot.clue.canonicalStepTitle}`,
      `${slot.clue.zoneName} · ${slot.clue.objectName}`,
      `Colocada por ${slot.clue.ownerName}`
    ].forEach((text) => {
      const detail = document.createElement("li");
      detail.textContent = text;
      details.append(detail);
    });
    item.append(clueTitle, clueText, details);
    return item;
  }

  function renderGameResult(room) {
    const result = room.result;
    if (!result) return;
    window.clearInterval(votingClockInterval);
    const winnerTeam = result.winnerTeam || result.winner;
    document.querySelector("#result-hero").dataset.winner = winnerTeam;
    document.body.dataset.outcome = winnerTeam;
    document.querySelector("#result-title").textContent = result.title;
    document.querySelector("#result-message").textContent = result.message;
    document.querySelector("#result-creature").textContent = result.creatureName;
    document.querySelector("#result-selected").textContent = result.selectedPlayerName || (result.tiedPlayerNames.length ? `Empate: ${result.tiedPlayerNames.join(", ")}` : "Sin decisión");
    document.querySelector("#result-abstentions").textContent = String(result.totalAbstentions);
    const storyObjective = document.querySelector("#result-objective-story");
    storyObjective.dataset.passed = String(result.reconstruction.passed);
    storyObjective.querySelector(".result-objective__icon").textContent = result.reconstruction.passed ? "✓" : "✗";
    document.querySelector("#result-reconstruction-score").textContent = `${result.reconstruction.score}/5 · requisito ${result.reconstruction.required}/5`;
    document.querySelector("#result-reconstruction-status").textContent = result.reconstruction.passed ? "Historia reconstruida · Objetivo completado" : "Historia incompleta · Objetivo no completado";
    const accusationObjective = document.querySelector("#result-objective-accusation");
    accusationObjective.dataset.passed = String(result.accusation.creatureIdentified);
    accusationObjective.querySelector(".result-objective__icon").textContent = result.accusation.creatureIdentified ? "✓" : "✗";
    document.querySelector("#result-accusation-player").textContent = result.accusation.accusedPlayer
      ? `${result.accusation.accusedPlayer.name} · ${result.accusation.accusedPlayer.role}`
      : result.accusation.persistentTie ? "Sin sospechoso único" : "Sin acusación";
    document.querySelector("#result-accusation-status").textContent = result.accusation.creatureIdentified
      ? "Criatura identificada · Acusación correcta"
      : result.accusation.persistentTie ? "Empate persistente · Objetivo no completado" : "Acusación incorrecta · Objetivo no completado";
    document.querySelector("#result-role-grid").replaceChildren(...result.players.map(createResultRoleCard));
    document.querySelector("#result-rounds").replaceChildren(...result.rounds.map(createResultRound));
    document.querySelector("#final-reconstruction-board").replaceChildren(...result.reconstruction.slots.map(createFinalReconstructionSlot));
    document.querySelector("#true-order-list").replaceChildren(...result.reconstruction.trueOrder.map((step) => {
      const item = document.createElement("li");
      item.textContent = step.text;
      return item;
    }));
    document.querySelector("#story-conclusion").textContent = result.storyConclusion;
    const currentPlayer = room.players.find((player) => player.id === multiplayer.session?.playerId);
    document.querySelector("#play-again").hidden = !currentPlayer?.isHost;
    document.querySelector("#play-again-waiting").hidden = Boolean(currentPlayer?.isHost);
  }

  function renderGameState(room) {
    if (!room || !multiplayer.session) return;
    if (room.state === "waiting") renderWaitingRoom(room);
    if (room.state === "story") renderStory(room);
    if (["role_reveal", "waiting_ready"].includes(room.state)) renderRoleStage(room);
    if (room.state === "ready_for_exploration") renderExplorationReady(room);
    if (room.state === "exploration") renderExploration(room);
    if (room.state !== "exploration") {
      latestExplorationState = null;
      window.clearInterval(explorationClockInterval);
      explorationGame.destroy();
    }
    if (room.state === "ready_for_discussion") renderDiscussionStage(room);
    if (["discussion", "discussion_finished"].includes(room.state)) renderLiveDiscussion(room);
    if (room.state === "ready_for_voting") renderVotingReady(room);
    if (["voting", "vote_tiebreaker"].includes(room.state)) renderVotingStage(room);
    if (room.state === "game_finished") renderGameResult(room);
  }

  function navigateToRoom(room) {
    if (room.state !== "game_finished") delete document.body.dataset.outcome;
    renderGameState(room);
    navigation.goTo(stateScreens[room.state] || "waiting-room");
    if (room.state === "exploration") void mountExplorationGame(room);
  }

  function clearRoleFace() {
    document.querySelector("#private-role-name").textContent = "";
    document.querySelector("#private-role-description").textContent = "";
    document.querySelector("#private-role-objective").textContent = "";
    document.querySelector("#role-icon").textContent = "";
    const card = document.querySelector("#role-card");
    card.classList.remove("role-card--creature", "role-card--investigator", "role-card--inhabitant");
    card.classList.add("is-concealed");
    document.querySelector("#role-card-face").hidden = true;
    document.querySelector("#role-card-back").hidden = false;
    document.querySelector("#hide-role").hidden = true;
    document.querySelector("#reveal-role").hidden = false;
  }

  function resetRolePresentation() {
    roleWasRevealed = false;
    clearRoleFace();
    document.querySelector("#confirm-role").disabled = true;
    renderRoleConfirmationState();
  }

  function revealPrivateRole() {
    const role = multiplayer.privateRole;
    if (!role) {
      showNotice(document.querySelector("#role-notice"), "El servidor todavía no ha entregado tu rol.", "error");
      return;
    }
    const icons = { creature: "◉", investigator: "⌕", inhabitant: "⌂" };
    document.querySelector("#private-role-name").textContent = role.name;
    document.querySelector("#private-role-description").textContent = role.description;
    document.querySelector("#private-role-objective").textContent = role.objective;
    document.querySelector("#role-icon").textContent = icons[role.id] || "◈";
    const card = document.querySelector("#role-card");
    card.classList.remove("is-concealed");
    card.classList.add(`role-card--${role.theme}`);
    document.querySelector("#role-card-back").hidden = true;
    document.querySelector("#role-card-face").hidden = false;
    document.querySelector("#reveal-role").hidden = true;
    document.querySelector("#hide-role").hidden = false;
    roleWasRevealed = true;
    document.querySelector("#confirm-role").disabled = false;
    document.querySelector("#private-role-name").setAttribute("tabindex", "-1");
    document.querySelector("#private-role-name").focus({ preventScroll: true });
  }

  function renderRoleConfirmationState() {
    const confirmed = multiplayer.confirmations.role;
    document.querySelector("#role-controls").hidden = confirmed;
    document.querySelector("#role-confirmed").hidden = !confirmed;
    if (confirmed) clearRoleFace();
    else {
      document.querySelector("#reveal-role").disabled = !multiplayer.privateRole;
      document.querySelector("#confirm-role").disabled = !roleWasRevealed;
    }
  }

  function updateConnectionStatus({ connected, status = connected ? "connected" : "reconnecting" }) {
    window.clearTimeout(connectionWakeTimer);
    const label = status === "recovered" ? "Conexión recuperada" : connected ? "Conectado" : status === "failed" ? "Sin conexión" : status === "connecting" ? "Conectando" : "Reconectando";
    document.querySelectorAll("[data-connection-state]").forEach((element) => {
      element.dataset.connectionState = connected ? "connected" : "disconnected";
      element.querySelector(".connection-pill__text").textContent = label;
    });
    if (status === "recovered") showConnectionAlert("Conexión recuperada. Restaurando el estado de la partida…", "success");
    else if (status === "connecting") {
      showConnectionAlert("Conectando con el pueblo…", "info", { persistent: true });
      connectionWakeTimer = window.setTimeout(() => {
        if (!multiplayer.socket.connected) showConnectionAlert("El servidor puede estar despertando. Esto puede tardar cerca de un minuto…", "info", { persistent: true, showRetry: true });
      }, 4_000);
    }
    else if (status === "reconnecting") showConnectionAlert("Conexión perdida. Intentando reconectar…", "error", { persistent: true });
    else if (status === "failed") showConnectionAlert("No fue posible recuperar la conexión. Puedes reintentar sin recargar la página.", "error", { persistent: true, showHome: true, showRetry: true });
    else hideConnectionAlert({ force: true });
    if (!connected && multiplayer.currentRoom) {
      const noticeByScreen = {
        "waiting-room": "#room-notice",
        "story-screen": "#story-notice",
        "role-screen": "#role-notice",
        "exploration-ready": "#exploration-ready-notice",
        "exploration-screen": "#exploration-notice",
        "discussion-ready": "#discussion-notice",
        "discussion-screen": "#chat-notice",
        "voting-ready": "#voting-notice",
        "voting-screen": "#vote-notice",
        "game-result": "#result-notice"
      };
      const notice = document.querySelector(noticeByScreen[navigation.currentId]);
      if (notice) showNotice(notice, "Se perdió la conexión. Intentando reconectar…", "error");
    }
  }

  async function copyRoomCode() {
    const code = multiplayer.currentRoom?.code;
    if (!code) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else {
        const temporary = document.createElement("textarea");
        temporary.value = code;
        temporary.setAttribute("readonly", "");
        temporary.className = "sr-only";
        document.body.append(temporary);
        temporary.select();
        if (!document.execCommand("copy")) throw new Error("copy failed");
        temporary.remove();
      }
      const feedback = document.querySelector("#copy-feedback");
      feedback.textContent = "Código copiado.";
      window.clearTimeout(copyFeedbackTimer);
      copyFeedbackTimer = window.setTimeout(() => { feedback.textContent = ""; }, 2500);
    } catch (error) {
      showToast("No se pudo copiar. Mantén presionado el código para seleccionarlo.", "error");
    }
  }

  function requestLeaveConfirmation() {
    const dialog = document.querySelector("#leave-dialog");
    if (!dialog.open) dialog.showModal();
  }

  async function confirmLeave() {
    const button = document.querySelector("#confirm-leave");
    button.disabled = true;
    try {
      await multiplayer.leaveRoom();
      navigation.goTo("menu");
      showToast("Saliste de la sala.", "success");
    } catch (error) { showToast(error.message, "error"); }
    finally { button.disabled = false; }
  }

  function clearDiscussionClues() {
    document.querySelector("#discussion-evidence").replaceChildren();
    document.querySelector("#discussion-private-clues").replaceChildren();
    document.querySelector("#discussion-observation").replaceChildren();
    document.querySelector("#discussion-clue-instructions").textContent = "";
    document.querySelector("#notebook-count").textContent = "0/2 pistas";
    document.querySelector("#notebook-empty").hidden = false;
  }

  function openDiscussionClues() {
    const room = multiplayer.currentRoom;
    const clues = multiplayer.privateClues;
    if (!room || !clues) {
      const notice = navigation.currentId === "exploration-screen" ? "#exploration-notice" : navigation.currentId === "voting-screen" ? "#vote-notice" : "#chat-notice";
      showNotice(document.querySelector(notice), "Tus pistas privadas todavía no están disponibles.", "error");
      return;
    }
    clearDiscussionClues();
    if (room.evidence) {
      const evidence = document.createElement("article");
      evidence.className = "public-evidence-mini";
      const evidenceTitle = document.createElement("h3");
      evidenceTitle.textContent = room.evidence.title;
      const evidenceText = document.createElement("p");
      evidenceText.textContent = room.evidence.text;
      evidence.append(evidenceTitle, evidenceText);
      document.querySelector("#discussion-evidence").append(evidence);
    }
    document.querySelector("#discussion-private-clues").replaceChildren(...clues.cards.map((card) => createClueCard(card)));
    document.querySelector("#notebook-count").textContent = `${clues.cards.length}/2 pistas`;
    document.querySelector("#notebook-empty").hidden = clues.cards.length > 0;
    if (clues.observation) document.querySelector("#discussion-observation").append(createClueCard(clues.observation, "Análisis adicional"));
    document.querySelector("#discussion-clue-instructions").textContent = clues.instructions;
    const dialog = document.querySelector("#private-clues-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function closeDiscussionClues() {
    const dialog = document.querySelector("#private-clues-dialog");
    if (dialog.open) dialog.close();
    clearDiscussionClues();
  }

  async function submitChatMessage(event) {
    event.preventDefault();
    const input = document.querySelector("#chat-input");
    const text = input.value.trim();
    if (!text) return;
    const sendButton = document.querySelector("#send-chat");
    sendButton.disabled = true;
    try {
      await multiplayer.sendChatMessage(text);
      input.value = "";
      document.querySelector("#chat-counter").textContent = "0/300";
      input.focus({ preventScroll: true });
    } catch (error) {
      showNotice(document.querySelector("#chat-notice"), error.message, "error");
    } finally {
      if (multiplayer.currentRoom?.state === "discussion") sendButton.disabled = false;
    }
  }

  function openVoteConfirmation(candidateId) {
    const candidate = multiplayer.currentRoom?.voting?.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    pendingVoteCandidate = { id: candidate.id, name: candidate.name };
    document.querySelector("#vote-dialog-description").textContent = `Tu voto será definitivo. ¿Deseas votar por ${candidate.name}?`;
    document.querySelector("#vote-dialog").showModal();
  }

  function closeVoteConfirmation() {
    const dialog = document.querySelector("#vote-dialog");
    if (dialog.open) dialog.close();
  }

  async function confirmPendingVote() {
    if (!pendingVoteCandidate) return;
    const button = document.querySelector("#confirm-vote");
    button.disabled = true;
    try {
      await multiplayer.submitVote(pendingVoteCandidate.id);
      multiplayer.hasVoted = true;
      audio.play("vote");
      closeVoteConfirmation();
      if (multiplayer.currentRoom?.voting) renderVoteConfirmationState(multiplayer.currentRoom);
    } catch (error) {
      showNotice(document.querySelector("#vote-notice"), error.message, "error");
      closeVoteConfirmation();
    } finally {
      button.disabled = false;
    }
  }

  function reviewChat() {
    if (!multiplayer.currentRoom) return;
    reviewReturnScreen = stateScreens[multiplayer.currentRoom.state] || "voting-ready";
    renderLiveDiscussion(multiplayer.currentRoom);
    navigation.goTo("discussion-screen");
  }

  function openReconstructionConfirmation(clueId, slot = null, mode = "place") {
    const room = multiplayer.currentRoom;
    if (!room?.reconstruction || room.reconstruction.locked) return;
    const clue = (multiplayer.privateClues?.cards || []).find((item) => item.id === clueId)
      || room.reconstruction.slots.find((item) => item.clue?.id === clueId)?.clue;
    if (!clue) return;
    pendingReconstructionChange = { clueId, slot, mode, boardVersion: room.reconstruction.version };
    const stage = room.reconstruction.slots.find((item) => item.id === slot);
    document.querySelector("#reconstruction-dialog-title").textContent = mode === "remove" ? "Retirar pista" : "Confirmar cambio";
    document.querySelector("#reconstruction-dialog-description").textContent = mode === "remove"
      ? `¿Retirar “${clue.title}” de la mesa compartida?`
      : `¿Colocar “${clue.title}” en la etapa ${stage?.id}: ${stage?.title}?`;
    document.querySelector("#apply-reconstruction-change").textContent = mode === "remove" ? "Retirar pista" : "Colocar aquí";
    document.querySelector("#reconstruction-dialog").showModal();
  }

  async function applyReconstructionChange() {
    if (!pendingReconstructionChange) return;
    const change = pendingReconstructionChange;
    const button = document.querySelector("#apply-reconstruction-change");
    button.disabled = true;
    try {
      if (change.mode === "remove") await multiplayer.removeReconstructionClue(change.clueId, change.boardVersion);
      else {
        const isPlaced = multiplayer.currentRoom?.reconstruction?.slots.some((slot) => slot.clue?.id === change.clueId);
        if (isPlaced) await multiplayer.moveReconstructionClue(change.clueId, change.slot, change.boardVersion);
        else await multiplayer.placeReconstructionClue(change.clueId, change.slot, change.boardVersion);
      }
      selectedReconstructionClue = null;
      document.querySelector("#reconstruction-dialog").close();
    } catch (error) {
      showNotice(document.querySelector("#reconstruction-notice"), error.message, "error");
      document.querySelector("#reconstruction-dialog").close();
    } finally {
      pendingReconstructionChange = null;
      button.disabled = false;
    }
  }

  document.addEventListener("click", (event) => {
    const navigationButton = event.target.closest("[data-go-to]");
    if (navigationButton) navigation.goTo(navigationButton.dataset.goTo);
    const tab = event.target.closest("[data-discussion-tab]");
    if (tab) {
      document.querySelector(".discussion-layout").dataset.mobileTab = tab.dataset.discussionTab;
      document.querySelectorAll("[data-discussion-tab]").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "room-code") {
      const caret = event.target.selectionStart;
      event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "");
      event.target.setSelectionRange(caret, caret);
    }
    if (event.target.matches("input[aria-invalid='true']") && event.target.value.trim()) {
      const errorId = event.target.getAttribute("aria-describedby")?.split(" ").at(-1);
      const errorElement = errorId && document.querySelector(`#${errorId}`);
      if (errorElement) setFieldError(event.target, errorElement, "");
    }
    if (event.target.id === "chat-input") document.querySelector("#chat-counter").textContent = `${event.target.value.length}/300`;
  });

  document.addEventListener("keydown", (event) => {
    audio.unlock();
    if (event.target.id === "chat-input" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      document.querySelector("#chat-form").requestSubmit();
      return;
    }
    if (event.key !== "Escape" || document.querySelector("#leave-dialog").open || document.querySelector("#private-clues-dialog").open || document.querySelector("#vote-dialog").open || document.querySelector("#reconstruction-dialog").open) return;
    if (["waiting-room", "story-screen", "role-screen", "exploration-ready", "exploration-screen", "exploration-finished", "discussion-ready", "discussion-screen", "voting-ready", "voting-screen", "calculating-result", "game-result"].includes(navigation.currentId)) requestLeaveConfirmation();
    else if (!["loading", "menu"].includes(navigation.currentId)) navigation.goTo("menu");
  });

  soundButton.addEventListener("click", () => {
    const isMuted = audio.toggle();
    renderSoundState(isMuted);
    if (!isMuted) {
      audio.play("bell", { cooldown: 0 });
      audio.startAmbience();
    }
    announce(isMuted ? "Sonido silenciado" : "Sonido activado");
  });

  document.addEventListener("pointerdown", () => audio.unlock(), { once: true, passive: true });

  document.querySelector("#create-form").addEventListener("submit", handleCreateSubmit);
  document.querySelector("#join-form").addEventListener("submit", handleJoinSubmit);
  document.querySelector("#copy-room-code").addEventListener("click", copyRoomCode);
  document.querySelectorAll("#leave-room, .leave-room-trigger").forEach((button) => button.addEventListener("click", requestLeaveConfirmation));
  document.querySelector("#confirm-leave").addEventListener("click", confirmLeave);
  document.querySelector("#connection-alert-close").addEventListener("click", () => {
    document.querySelector("#connection-alert").hidden = true;
  });
  document.querySelector("#connection-alert-retry").addEventListener("click", () => multiplayer.retryConnection());
  document.querySelector("#connection-alert-home").addEventListener("click", () => {
    multiplayer.abandonSession();
    document.querySelector("#connection-alert").hidden = true;
    navigation.goTo("menu");
  });
  document.querySelector("#copy-safe-report").addEventListener("click", copySafeReport);
  document.querySelector("#start-room").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try { await multiplayer.startRoom(); }
    catch (error) { showNotice(document.querySelector("#room-notice"), error.message, "error"); }
    finally { if (multiplayer.currentRoom?.state === "waiting") event.currentTarget.disabled = false; }
  });
  document.querySelector("#confirm-story").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await multiplayer.confirmStory();
      multiplayer.confirmations.story = true;
      renderStory(multiplayer.currentRoom);
    } catch (error) {
      event.currentTarget.disabled = false;
      showNotice(document.querySelector("#story-notice"), error.message, "error");
    }
  });
  document.querySelector("#reveal-role").addEventListener("click", revealPrivateRole);
  document.querySelector("#hide-role").addEventListener("click", clearRoleFace);
  document.querySelector("#confirm-role").addEventListener("click", async (event) => {
    if (!roleWasRevealed) return;
    event.currentTarget.disabled = true;
    try {
      await multiplayer.confirmRole();
      multiplayer.confirmations.role = true;
      renderRoleConfirmationState();
    } catch (error) {
      event.currentTarget.disabled = false;
      showNotice(document.querySelector("#role-notice"), error.message, "error");
    }
  });
  document.querySelector("#confirm-exploration-ready").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await multiplayer.confirmExplorationReady();
      multiplayer.confirmations.exploration = true;
      if (multiplayer.currentRoom?.state === "ready_for_exploration") renderExplorationReady(multiplayer.currentRoom);
    } catch (error) {
      event.currentTarget.disabled = false;
      showNotice(document.querySelector("#exploration-ready-notice"), error.message, "error");
    }
  });
  document.querySelector("#exploration-interact").addEventListener("click", () => window.dispatchEvent(new CustomEvent("hidetown:interact")));
  document.querySelectorAll("#virtual-joystick button").forEach((button) => {
    const direction = { x: Number(button.dataset.moveX || 0), y: Number(button.dataset.moveY || 0) };
    const start = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      window.dispatchEvent(new CustomEvent("hidetown:move", { detail: direction }));
    };
    const stop = () => window.dispatchEvent(new CustomEvent("hidetown:move", { detail: { x: 0, y: 0 } }));
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
  });
  document.querySelectorAll(".game-reset-button").forEach((button) => button.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try { await multiplayer.resetRoom(); }
    catch (error) {
      event.currentTarget.disabled = false;
      const notice = navigation.currentId === "voting-ready" ? "#voting-notice" : "#discussion-notice";
      showNotice(document.querySelector(notice), error.message, "error");
    }
  }));
  document.querySelector("#start-discussion").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try { await multiplayer.startDiscussion(); }
    catch (error) {
      event.currentTarget.disabled = false;
      showNotice(document.querySelector("#discussion-notice"), error.message, "error");
    }
  });
  document.querySelector("#reconstruction-tray-list").addEventListener("click", (event) => {
    const button = event.target.closest(".tray-clue");
    if (!button) return;
    selectedReconstructionClue = selectedReconstructionClue === button.dataset.clueId ? null : button.dataset.clueId;
    if (multiplayer.currentRoom) renderReconstruction(multiplayer.currentRoom);
  });
  document.querySelector("#reconstruction-board").addEventListener("click", (event) => {
    const remove = event.target.closest(".reconstruction-remove");
    if (remove) return openReconstructionConfirmation(remove.dataset.clueId, null, "remove");
    const select = event.target.closest(".reconstruction-select-placed");
    if (select) {
      selectedReconstructionClue = select.dataset.clueId;
      if (multiplayer.currentRoom) renderReconstruction(multiplayer.currentRoom);
      return;
    }
    const slot = event.target.closest(".reconstruction-slot.is-target");
    if (slot && selectedReconstructionClue) openReconstructionConfirmation(selectedReconstructionClue, Number(slot.dataset.slot));
  });
  document.querySelector("#reconstruction-board").addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const slot = event.target.closest(".reconstruction-slot.is-target");
    if (!slot || !selectedReconstructionClue) return;
    event.preventDefault();
    openReconstructionConfirmation(selectedReconstructionClue, Number(slot.dataset.slot));
  });
  document.querySelector("#cancel-reconstruction-change").addEventListener("click", () => {
    pendingReconstructionChange = null;
    document.querySelector("#reconstruction-dialog").close();
  });
  document.querySelector("#apply-reconstruction-change").addEventListener("click", applyReconstructionChange);
  document.querySelector("#reconstruction-dialog").addEventListener("close", () => { pendingReconstructionChange = null; });
  document.querySelector("#confirm-reconstruction").addEventListener("click", async (event) => {
    const room = multiplayer.currentRoom;
    if (!room?.reconstruction) return;
    event.currentTarget.disabled = true;
    try {
      await multiplayer.confirmReconstruction(room.reconstruction.version);
      showToast("Confirmaste esta versión de la reconstrucción.", "success");
      if (multiplayer.currentRoom) renderReconstruction(multiplayer.currentRoom);
    } catch (error) {
      event.currentTarget.disabled = false;
      showNotice(document.querySelector("#reconstruction-notice"), error.message, "error");
    }
  });
  document.querySelector("#review-locked-board").addEventListener("click", () => {
    document.querySelector(".discussion-layout").dataset.mobileTab = "board";
    document.querySelectorAll("[data-discussion-tab]").forEach((item) => item.setAttribute("aria-selected", String(item.dataset.discussionTab === "board")));
    document.querySelector("#reconstruction-board-title").focus({ preventScroll: true });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector("#reconstruction-panel").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  });
  document.querySelector("#chat-form").addEventListener("submit", submitChatMessage);
  document.querySelector("#new-messages").addEventListener("click", () => {
    const messages = document.querySelector("#chat-messages");
    messages.scrollTop = messages.scrollHeight;
    document.querySelector("#new-messages").hidden = true;
  });
  document.querySelectorAll("#view-private-clues, #open-exploration-notebook, #open-finished-notebook, .view-clues-button").forEach((button) => button.addEventListener("click", openDiscussionClues));
  document.querySelector("#close-private-clues").addEventListener("click", closeDiscussionClues);
  document.querySelector("#private-clues-dialog").addEventListener("close", clearDiscussionClues);
  document.querySelector("#discussion-private-clues").addEventListener("click", async (event) => {
    const button = event.target.closest(".analyze-clue");
    if (!button) return;
    button.disabled = true;
    try {
      const result = await multiplayer.analyzeClue(button.dataset.clueId);
      multiplayer.privateClues = result.clues;
      multiplayer.privateExploration = result.exploration;
      openDiscussionClues();
      showToast("Análisis añadido a tu cuaderno.", "success");
    } catch (error) {
      button.disabled = false;
      showNotice(document.querySelector("#exploration-notice"), error.message, "error");
    }
  });
  document.querySelectorAll(".review-chat-button").forEach((button) => button.addEventListener("click", reviewChat));
  document.querySelector("#back-to-decision").addEventListener("click", () => navigation.goTo(reviewReturnScreen));
  document.querySelector("#candidate-grid").addEventListener("change", (event) => {
    if (event.target.matches("input[name='candidate']")) document.querySelector("#prepare-vote").disabled = false;
  });
  document.querySelector("#vote-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const candidate = document.querySelector("input[name='candidate']:checked");
    if (candidate) openVoteConfirmation(candidate.value);
  });
  document.querySelector("#cancel-vote").addEventListener("click", () => {
    pendingVoteCandidate = null;
    closeVoteConfirmation();
  });
  document.querySelector("#confirm-vote").addEventListener("click", confirmPendingVote);
  document.querySelector("#vote-dialog").addEventListener("close", () => { pendingVoteCandidate = null; });
  document.querySelector("#play-again").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try { await multiplayer.playAgain(); }
    catch (error) {
      event.currentTarget.disabled = false;
      showNotice(document.querySelector("#result-notice"), error.message, "error");
    }
  });
  document.querySelector("#return-to-menu").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await multiplayer.returnToMenu();
      navigation.goTo("menu");
      showToast("Saliste de la sala.", "success");
    } catch (error) {
      event.currentTarget.disabled = false;
      showNotice(document.querySelector("#result-notice"), error.message, "error");
    }
  });

  multiplayer.on("connection", updateConnectionStatus);
  multiplayer.on("joined", navigateToRoom);
  multiplayer.on("room-updated", navigateToRoom);
  multiplayer.on("game-started", navigateToRoom);
  multiplayer.on("story-presented", () => {
    audio.play("bell");
    if (multiplayer.currentRoom) renderStory(multiplayer.currentRoom);
  });
  multiplayer.on("game-state", ({ room }) => navigateToRoom(room));
  multiplayer.on("story-progress", ({ progress }) => {
    document.querySelector("#story-progress").textContent = `${progress.storyConfirmed} de ${progress.total} jugadores preparados`;
  });
  multiplayer.on("role-assigned", () => {
    resetRolePresentation();
    if (multiplayer.currentRoom) renderRoleStage(multiplayer.currentRoom);
  });
  multiplayer.on("role-progress", ({ progress }) => {
    document.querySelector("#role-progress").textContent = `${progress.roleConfirmed} de ${progress.total} jugadores preparados`;
  });
  multiplayer.on("clues-assigned", () => {
    audio.play("clue");
    if (multiplayer.currentRoom?.state === "exploration") renderExploration(multiplayer.currentRoom);
  });
  multiplayer.on("exploration-waiting", ({ room }) => navigateToRoom(room));
  multiplayer.on("exploration-started", ({ room }) => {
    navigateToRoom(room);
  });
  multiplayer.on("exploration-state", () => {
    if (multiplayer.currentRoom?.state !== "exploration") return;
    renderExploration(multiplayer.currentRoom);
    void mountExplorationGame(multiplayer.currentRoom);
  });
  multiplayer.on("exploration-location", ({ room }) => navigateToRoom(room));
  multiplayer.on("exploration-search-started", () => multiplayer.currentRoom && renderExploration(multiplayer.currentRoom));
  multiplayer.on("exploration-clue-found", () => {
    audio.play("clue");
    showToast("Encontraste una pista. Se guardó en tu cuaderno.", "success");
    if (multiplayer.currentRoom) renderExploration(multiplayer.currentRoom);
  });
  multiplayer.on("exploration-finished", ({ room }) => {
    closeDiscussionClues();
    navigateToRoom(room);
    showToast("La exploración ha terminado.");
  });
  multiplayer.on("exploration-error", (error) => { recordPublicError(error); showNotice(document.querySelector("#exploration-notice"), error.message, "error"); });
  multiplayer.on("ready-for-discussion", navigateToRoom);
  multiplayer.on("discussion-started", ({ room }) => navigateToRoom(room));
  multiplayer.on("discussion-state", ({ room }) => navigateToRoom(room));
  multiplayer.on("reconstruction-started", ({ room }) => navigateToRoom(room));
  multiplayer.on("reconstruction-board-updated", ({ room }) => navigateToRoom(room));
  multiplayer.on("reconstruction-progress", ({ room }) => navigateToRoom(room));
  multiplayer.on("reconstruction-locked", ({ room }) => navigateToRoom(room));
  multiplayer.on("reconstruction-result", ({ room }) => {
    navigateToRoom(room);
    audio.play("clue");
  });
  multiplayer.on("reconstruction-error", (error) => {
    recordPublicError(error);
    showNotice(document.querySelector("#reconstruction-notice"), error.message, "error");
  });
  multiplayer.on("chat-history", () => {
    if (navigation.currentId === "discussion-screen") renderChatHistory();
  });
  multiplayer.on("chat-message", (message) => {
    if (navigation.currentId === "discussion-screen") appendChatMessage(message);
  });
  multiplayer.on("discussion-finished", ({ room }) => {
    navigateToRoom(room);
    showToast("La conversación ha terminado.");
  });
  multiplayer.on("ready-for-voting", navigateToRoom);
  multiplayer.on("voting-started", ({ room }) => navigateToRoom(room));
  multiplayer.on("voting-progress", ({ progress }) => {
    if (!multiplayer.currentRoom?.voting) return;
    multiplayer.currentRoom.voting.progress = progress;
    if (navigation.currentId === "voting-screen") renderVoteConfirmationState(multiplayer.currentRoom);
  });
  multiplayer.on("voting-closed", ({ room }) => navigateToRoom(room));
  multiplayer.on("voting-tiebreaker", ({ room }) => {
    closeVoteConfirmation();
    navigateToRoom(room);
    showToast("Hay empate. Comienza una ronda final de desempate.");
  });
  multiplayer.on("game-result", ({ room }) => {
    closeVoteConfirmation();
    navigateToRoom(room);
    audio.play((room.result?.winnerTeam || room.result?.winner) === "village" ? "village" : "creature", { cooldown: 0 });
  });
  multiplayer.on("vote-error", (error) => { recordPublicError(error); showNotice(document.querySelector("#vote-notice"), error.message, "error"); });
  multiplayer.on("chat-error", (error) => { recordPublicError(error); showNotice(document.querySelector("#chat-notice"), error.message, "error"); });
  multiplayer.on("reset", (room) => {
    closeVoteConfirmation();
    closeDiscussionClues();
    resetRolePresentation();
    navigateToRoom(room);
  });
  multiplayer.on("game-reset", ({ room, message }) => {
    closeVoteConfirmation();
    closeDiscussionClues();
    resetRolePresentation();
    navigateToRoom(room);
    showToast(message || "La partida fue reiniciada.", "success");
  });
  multiplayer.on("game-cancelled", ({ message, room }) => {
    closeVoteConfirmation();
    closeDiscussionClues();
    resetRolePresentation();
    navigateToRoom(room);
    showConnectionAlert(message, "error");
  });
  multiplayer.on("restored", (room) => {
    navigateToRoom(room);
    if (room.state === "exploration") void mountExplorationGame(room);
    showToast("Sesión y etapa recuperadas correctamente.", "success");
  });
  multiplayer.on("restore-failed", (error = {}) => {
    recordPublicError(error);
    navigation.goTo("menu");
    showConnectionAlert(error.message || "La sesión anterior ya no está disponible.", "error", { persistent: true, showHome: true, showRetry: true });
  });
  multiplayer.on("closed", () => {
    navigation.goTo("menu");
    showToast("La sala fue cerrada.", "error");
  });
  multiplayer.on("host-changed", (room) => {
    navigateToRoom(room);
    const currentPlayer = room.players.find((player) => player.id === multiplayer.session?.playerId);
    showToast(currentPlayer?.isHost ? "Ahora eres el anfitrión de la sala." : "La sala tiene un nuevo anfitrión.", "success");
  });
  multiplayer.on("player-disconnected", () => showToast("Un jugador perdió la conexión temporalmente."));
  multiplayer.on("player-reconnected", () => showToast("Un jugador volvió a conectarse.", "success"));
  multiplayer.on("player-removed", () => showToast("Un jugador no pudo reconectarse y salió de la sala."));
  multiplayer.on("storage-error", ({ message }) => showToast(message, "error"));
  multiplayer.on("error", (error) => { recordPublicError(error); showToast(error.message, "error"); });

  window.addEventListener("pagehide", () => audio.destroy(), { once: true });
  renderSoundState(audio.muted);
  updateConnectionStatus({ connected: multiplayer.socket.connected, status: multiplayer.socket.connected ? "connected" : "connecting" });
  resetRolePresentation();
  const loadingDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 1200;
  window.setTimeout(() => {
    if (navigation.currentId !== "loading") return;
    if (multiplayer.currentRoom) navigateToRoom(multiplayer.currentRoom);
    else navigation.goTo("menu", { focus: false });
  }, loadingDelay);
})();
