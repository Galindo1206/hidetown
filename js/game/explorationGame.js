(function () {
  "use strict";

  const LOAD_TIMEOUT_MS = 12_000;
  const CONTAINER_TIMEOUT_MS = 5_000;
  const MIN_GAME_WIDTH = 320;
  const MIN_GAME_HEIGHT = 240;

  function waitForVisibleContainer(container, timeoutMs = CONTAINER_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      let retryTimer = null;
      let animationFrame = null;
      let firstFramePassed = false;

      const finish = (size) => {
        window.clearTimeout(retryTimer);
        window.cancelAnimationFrame(animationFrame);
        resolve(size);
      };
      const check = () => {
        if (!firstFramePassed) {
          firstFramePassed = true;
          animationFrame = window.requestAnimationFrame(check);
          return;
        }
        const width = container?.clientWidth || 0;
        const height = container?.clientHeight || 0;
        if (container?.isConnected && width > 0 && height > 0) {
          finish({ width, height });
          return;
        }
        if (performance.now() - startedAt >= timeoutMs) {
          finish(null);
          return;
        }
        retryTimer = window.setTimeout(check, 50);
      };

      animationFrame = window.requestAnimationFrame(check);
    });
  }

  class ExplorationGame {
    constructor({ multiplayer, audio, onError, onRetry, onExit }) {
      this.multiplayer = multiplayer;
      this.audio = audio;
      this.onError = onError;
      this.onRetry = onRetry;
      this.onExit = onExit;
      this.instance = null;
      this.soundscape = null;
      this.loadTimer = null;
      this.generation = 0;
      this.failed = false;
      this.failureCount = 0;
      this.retryButton = document.querySelector("#exploration-loading-retry");
      this.homeButton = document.querySelector("#exploration-loading-home");
      this.retryButton?.addEventListener("click", () => this.onRetry?.());
      this.homeButton?.addEventListener("click", () => this.onExit?.());
    }

    get mounted() { return Boolean(this.instance); }

    showLoading(message = "Preparando San Jerónimo…") {
      const loading = document.querySelector("#exploration-loading");
      const label = document.querySelector("#exploration-loading-message");
      if (!loading || !label) return;
      loading.hidden = false;
      loading.dataset.state = "loading";
      label.textContent = message;
      if (this.retryButton) this.retryButton.hidden = true;
      if (this.homeButton) this.homeButton.hidden = true;
    }

    showError(message) {
      window.clearTimeout(this.loadTimer);
      this.loadTimer = null;
      const loading = document.querySelector("#exploration-loading");
      const label = document.querySelector("#exploration-loading-message");
      if (!loading || !label) return;
      loading.hidden = false;
      loading.dataset.state = "error";
      label.textContent = message;
      if (this.retryButton) this.retryButton.hidden = false;
      this.failureCount += 1;
      if (this.homeButton) this.homeButton.hidden = this.failureCount < 2;
    }

    markReady(generation) {
      if (generation !== this.generation || !this.instance || this.failed) return;
      window.clearTimeout(this.loadTimer);
      this.loadTimer = null;
      this.failureCount = 0;
      const loading = document.querySelector("#exploration-loading");
      if (loading) { loading.hidden = true; delete loading.dataset.state; }
      if (this.retryButton) this.retryButton.hidden = true;
      if (this.homeButton) this.homeButton.hidden = true;
    }

    reportResourceError(resource, essential = true) {
      const resourceName = resource || "recurso desconocido";
      if (!essential) {
        this.showLoading(`El recurso decorativo ${resourceName} falló; usando un sustituto local…`);
        return;
      }
      const error = new Error(`No se pudo cargar el recurso esencial: ${resourceName}.`);
      error.code = "PHASER_RESOURCE_FAILED";
      error.resource = resourceName;
      this.failed = true;
      this.showError(`Tu navegador no pudo iniciar el mapa. Intenta nuevamente. ${error.message} Código: ${error.code}.`);
      console.error("Phaser resource failed", { code: error.code, renderer: "canvas", resource: resourceName });
      this.onError?.(error);
    }

    sync(room) {
      if (!this.instance || room?.state !== "exploration") return false;
      const sceneId = this.multiplayer.privateExploration?.sceneId || "village";
      this.instance.registry.set("world", room.exploration.world);
      const active = this.instance.scene.getScenes(true)[0];
      if (active?.sceneId && active.sceneId !== sceneId && window.HideTownGame.sceneKey(sceneId)) {
        active.scene.start(window.HideTownGame.sceneKey(sceneId));
      } else if (active?.sceneId === sceneId) {
        active.restoreAuthoritativePosition?.();
        active.network?.syncRoom?.();
      }
      return true;
    }

    mount(room, measuredSize = null) {
      const container = document.querySelector("#exploration-canvas");
      if (!container?.isConnected || !window.Phaser || !room?.exploration?.world || !this.multiplayer.privateExploration) return false;
      if (this.instance) return this.sync(room);
      const measuredWidth = measuredSize?.width || container.clientWidth;
      const measuredHeight = measuredSize?.height || container.clientHeight;
      if (measuredWidth <= 0 || measuredHeight <= 0) return false;

      const requiredResources = [
        ["PreloadScene", "/js/game/scenes/PreloadScene.js"],
        ["VillageScene", "/js/game/scenes/VillageScene.js"],
        ["ChurchScene", "/js/game/scenes/ChurchScene.js"],
        ["CaretakerHouseScene", "/js/game/scenes/CaretakerHouseScene.js"],
        ["BellTowerScene", "/js/game/scenes/BellTowerScene.js"],
        ["ExplorationAudio", "/js/game/systems/ExplorationAudio.js"]
      ];
      const missingResource = requiredResources.find(([name]) => !window.HideTownGame?.[name]);
      if (missingResource) {
        this.reportResourceError(missingResource[1], true);
        return false;
      }

      const generation = ++this.generation;
      this.failed = false;
      const sceneId = this.multiplayer.privateExploration.sceneId || "village";
      this.showLoading();
      container.replaceChildren();
      this.soundscape = new window.HideTownGame.ExplorationAudio(this.audio);
      try {
        this.instance = new Phaser.Game({
          type: Phaser.CANVAS,
          parent: container,
          width: Math.max(Math.floor(measuredWidth), MIN_GAME_WIDTH),
          height: Math.max(Math.floor(measuredHeight), MIN_GAME_HEIGHT),
          backgroundColor: "#081923",
          transparent: false,
          scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
          physics: { default: "arcade", arcade: { debug: false } },
          render: { antialias: true, pixelArt: false, roundPixels: false },
          callbacks: {
            preBoot: (game) => {
              game.registry.set("world", room.exploration.world);
              game.registry.set("soundscape", this.soundscape);
              game.registry.set("context", {
                initialSceneId: sceneId,
                multiplayer: this.multiplayer,
                onError: this.onError,
                onReady: () => this.markReady(generation),
                onResourceError: (resource, essential) => this.reportResourceError(resource, essential)
              });
            }
          },
          scene: [window.HideTownGame.PreloadScene, window.HideTownGame.VillageScene, window.HideTownGame.ChurchScene, window.HideTownGame.CaretakerHouseScene, window.HideTownGame.BellTowerScene]
        });
        this.loadTimer = window.setTimeout(() => {
          if (generation !== this.generation || !this.instance) return;
          this.failed = true;
          this.showError("Tu navegador no pudo iniciar el mapa. Intenta nuevamente. Código: MAP_LOAD_TIMEOUT.");
          console.error("Phaser load timed out", { code: "MAP_LOAD_TIMEOUT", renderer: "canvas" });
        }, LOAD_TIMEOUT_MS);
        return true;
      } catch (error) {
        this.failed = true;
        this.instance = null;
        this.soundscape?.destroy();
        this.soundscape = null;
        container.replaceChildren();
        const publicError = new Error("Tu navegador no pudo iniciar el mapa. Intenta nuevamente.");
        publicError.code = "MAP_INIT_FAILED";
        this.showError(`${publicError.message} Código: ${publicError.code}.`);
        console.error("Phaser initialization failed", { code: publicError.code, renderer: "canvas", errorName: error?.name || "Error" });
        this.onError?.(publicError);
        return false;
      }
    }

    updateRoom(room) { if (room?.state === "exploration") this.mount(room); else this.destroy(); }

    destroy({ preserveFailures = false } = {}) {
      this.generation += 1;
      this.failed = false;
      if (!preserveFailures) this.failureCount = 0;
      window.clearTimeout(this.loadTimer);
      this.loadTimer = null;
      this.soundscape?.destroy();
      this.soundscape = null;
      if (this.instance) this.instance.destroy(true);
      this.instance = null;
      document.querySelector("#exploration-canvas")?.replaceChildren();
      const loading = document.querySelector("#exploration-loading");
      if (loading) { loading.hidden = true; delete loading.dataset.state; }
      if (this.retryButton) this.retryButton.hidden = true;
      if (this.homeButton) this.homeButton.hidden = true;
    }
  }

  window.HideTownGame.waitForVisibleContainer = waitForVisibleContainer;
  window.ExplorationGame = ExplorationGame;
})();
