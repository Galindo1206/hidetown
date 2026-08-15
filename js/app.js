(function () {
  "use strict";

  const NAME_PATTERN = /^[\p{L}\p{N} ._'’-]+$/u;
  const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5,6}$/;
  const announcer = document.querySelector("#app-announcer");
  const soundButton = document.querySelector("#sound-toggle");
  const multiplayer = new window.MultiplayerClient();
  const audio = new window.AudioManager();
  let copyFeedbackTimer;
  let roleWasRevealed = false;
  let explorationClockInterval;
  let currentExplorationZone = null;
  let discussionClockInterval;
  let votingClockInterval;
  let pendingVoteCandidate = null;
  let reviewReturnScreen = "voting-ready";
  let connectionAlertTimer;
  let connectionWakeTimer;
  let lastPublicErrorCode = "NINGUNO";
  let lastReportableStage = "menu";
  const timerWarningsPlayed = new Set();

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
    document.querySelector("#exploration-duration").textContent = `${room.explorationDurationSeconds || 60} segundos`;
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

  function playersInZone(room, zoneId) {
    return room.players.filter((player) => player.zoneId === zoneId);
  }

  function createMapZone(room, zone) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-zone";
    button.dataset.zone = zone.id;
    const ownLocation = multiplayer.privateExploration?.location;
    if (ownLocation === zone.id) button.classList.add("is-current");
    const symbol = document.createElement("span");
    symbol.className = "map-zone__symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = zone.symbol;
    const name = document.createElement("strong");
    name.textContent = zone.name;
    const present = playersInZone(room, zone.id);
    const players = document.createElement("span");
    players.className = "map-zone__players";
    players.textContent = present.length ? present.map((player) => player.id === multiplayer.session?.playerId ? `${player.name} (tú)` : player.name).join(", ") : "Sin jugadores";
    button.setAttribute("aria-label", `${zone.name}. ${present.length} jugadores presentes`);
    button.append(symbol, name, players);
    return button;
  }

  function renderZoneScene(room, zone) {
    const map = document.querySelector("#village-map");
    const scene = document.querySelector("#zone-scene");
    if (!zone) {
      map.hidden = false;
      scene.hidden = true;
      return;
    }
    map.hidden = true;
    scene.hidden = false;
    document.querySelector("#zone-scene-symbol").textContent = zone.symbol;
    document.querySelector("#zone-scene-title").textContent = zone.name;
    const present = playersInZone(room, zone.id);
    document.querySelector("#zone-presence").textContent = present.length ? `Presentes: ${present.map((player) => player.name).join(", ")}` : "No hay otros jugadores en esta zona.";
    const privateState = multiplayer.privateExploration || {};
    const investigated = new Set(privateState.investigatedObjectIds || []);
    const atLimit = (privateState.clueCount || 0) >= 2;
    const grid = document.querySelector("#investigation-object-grid");
    grid.replaceChildren(...zone.objects.map((item) => {
      const article = document.createElement("article");
      article.className = "investigation-object";
      if (investigated.has(item.id)) article.classList.add("is-investigated");
      const title = document.createElement("h4");
      title.textContent = item.name;
      const description = document.createElement("p");
      description.textContent = item.description;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--primary button--full investigate-object";
      button.dataset.objectId = item.id;
      const searching = privateState.activeSearch?.objectId === item.id;
      button.textContent = searching ? "Investigando…" : investigated.has(item.id) ? "Ya investigado" : atLimit ? "Cuaderno completo" : "Investigar";
      button.disabled = Boolean(privateState.activeSearch) || investigated.has(item.id) || atLimit;
      article.append(title, description, button);
      return article;
    }));
  }

  function updateExplorationClock(room) {
    const endsAt = room.exploration?.endsAt;
    const remaining = Number.isFinite(endsAt) ? Math.max(0, Math.ceil((endsAt - (Date.now() + multiplayer.serverTimeOffset)) / 1_000)) : 0;
    document.querySelector("#exploration-timer-value").textContent = formatClock(remaining);
    const timer = document.querySelector("#exploration-timer");
    timer.dataset.warning = remaining <= 5 ? "final" : remaining <= 15 ? "thirty" : remaining <= 30 ? "minute" : "normal";
    const threshold = remaining <= 5 ? 5 : remaining <= 15 ? 15 : remaining <= 30 ? 30 : null;
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
    document.querySelector("#village-map").replaceChildren(...exploration.zones.map((zone) => createMapZone(room, zone)));
    const zone = exploration.zones.find((item) => item.id === currentExplorationZone);
    renderZoneScene(room, zone);
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

  function renderLiveDiscussion(room) {
    document.querySelector("#live-discussion-title").textContent = room.story?.title || "Conversación del pueblo";
    renderCompactPlayers(room);
    renderChatHistory();
    const locked = room.state !== "discussion";
    setChatLocked(locked);
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

  function renderGameResult(room) {
    const result = room.result;
    if (!result) return;
    window.clearInterval(votingClockInterval);
    document.querySelector("#result-hero").dataset.winner = result.winner;
    document.body.dataset.outcome = result.winner;
    document.querySelector("#result-title").textContent = result.title;
    document.querySelector("#result-message").textContent = result.message;
    document.querySelector("#result-creature").textContent = result.creatureName;
    document.querySelector("#result-selected").textContent = result.selectedPlayerName || (result.tiedPlayerNames.length ? `Empate: ${result.tiedPlayerNames.join(", ")}` : "Sin decisión");
    document.querySelector("#result-abstentions").textContent = String(result.totalAbstentions);
    document.querySelector("#result-role-grid").replaceChildren(...result.players.map(createResultRoleCard));
    document.querySelector("#result-rounds").replaceChildren(...result.rounds.map(createResultRound));
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
    if (room.state !== "exploration") window.clearInterval(explorationClockInterval);
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

  document.addEventListener("click", (event) => {
    const navigationButton = event.target.closest("[data-go-to]");
    if (navigationButton) navigation.goTo(navigationButton.dataset.goTo);
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
    if (event.key !== "Escape" || document.querySelector("#leave-dialog").open || document.querySelector("#private-clues-dialog").open || document.querySelector("#vote-dialog").open) return;
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
  document.querySelector("#village-map").addEventListener("click", async (event) => {
    const button = event.target.closest(".map-zone");
    if (!button) return;
    button.disabled = true;
    try {
      await multiplayer.moveDuringExploration(button.dataset.zone);
      currentExplorationZone = button.dataset.zone;
      if (multiplayer.currentRoom) renderExploration(multiplayer.currentRoom);
    } catch (error) {
      button.disabled = false;
      showNotice(document.querySelector("#exploration-notice"), error.message, "error");
    }
  });
  document.querySelector("#back-to-map").addEventListener("click", () => {
    currentExplorationZone = null;
    if (multiplayer.currentRoom) renderExploration(multiplayer.currentRoom);
  });
  document.querySelector("#investigation-object-grid").addEventListener("click", async (event) => {
    const button = event.target.closest(".investigate-object");
    if (!button) return;
    button.disabled = true;
    button.textContent = "Investigando…";
    try { await multiplayer.investigateObject(button.dataset.objectId); }
    catch (error) {
      showNotice(document.querySelector("#exploration-notice"), error.message, "error");
      if (multiplayer.currentRoom) renderExploration(multiplayer.currentRoom);
    }
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
    currentExplorationZone = null;
    navigateToRoom(room);
  });
  multiplayer.on("exploration-state", () => multiplayer.currentRoom?.state === "exploration" && renderExploration(multiplayer.currentRoom));
  multiplayer.on("exploration-location", ({ room }) => navigateToRoom(room));
  multiplayer.on("exploration-search-started", () => multiplayer.currentRoom && renderExploration(multiplayer.currentRoom));
  multiplayer.on("exploration-clue-found", () => {
    audio.play("clue");
    showToast("Encontraste una pista. Se guardó en tu cuaderno.", "success");
    if (multiplayer.currentRoom) renderExploration(multiplayer.currentRoom);
  });
  multiplayer.on("exploration-finished", ({ room }) => {
    currentExplorationZone = null;
    closeDiscussionClues();
    navigateToRoom(room);
    showToast("La exploración ha terminado.");
  });
  multiplayer.on("exploration-error", (error) => { recordPublicError(error); showNotice(document.querySelector("#exploration-notice"), error.message, "error"); });
  multiplayer.on("ready-for-discussion", navigateToRoom);
  multiplayer.on("discussion-started", ({ room }) => navigateToRoom(room));
  multiplayer.on("discussion-state", ({ room }) => navigateToRoom(room));
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
    audio.play(room.result?.winner === "village" ? "village" : "creature", { cooldown: 0 });
  });
  multiplayer.on("vote-error", (error) => { recordPublicError(error); showNotice(document.querySelector("#vote-notice"), error.message, "error"); });
  multiplayer.on("chat-error", (error) => { recordPublicError(error); showNotice(document.querySelector("#chat-notice"), error.message, "error"); });
  multiplayer.on("reset", (room) => {
    closeVoteConfirmation();
    closeDiscussionClues();
    resetRolePresentation();
    currentExplorationZone = null;
    navigateToRoom(room);
  });
  multiplayer.on("game-reset", ({ room, message }) => {
    closeVoteConfirmation();
    closeDiscussionClues();
    resetRolePresentation();
    currentExplorationZone = null;
    navigateToRoom(room);
    showToast(message || "La partida fue reiniciada.", "success");
  });
  multiplayer.on("game-cancelled", ({ message, room }) => {
    closeVoteConfirmation();
    closeDiscussionClues();
    resetRolePresentation();
    currentExplorationZone = null;
    navigateToRoom(room);
    showConnectionAlert(message, "error");
  });
  multiplayer.on("restored", (room) => {
    navigateToRoom(room);
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
