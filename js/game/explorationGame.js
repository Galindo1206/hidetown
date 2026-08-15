(function () {
  "use strict";

  const LOAD_TIMEOUT_MS = 12_000;

  class ExplorationGame {
    constructor({ multiplayer, audio, onError, onRetry }) {
      this.multiplayer = multiplayer;
      this.audio = audio;
      this.onError = onError;
      this.onRetry = onRetry;
      this.instance = null;
      this.soundscape = null;
      this.loadTimer = null;
      this.generation = 0;
      this.failed = false;
      this.retryButton = document.querySelector("#exploration-loading-retry");
      this.retryButton?.addEventListener("click", () => this.onRetry?.());
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
    }

    markReady(generation) {
      if (generation !== this.generation || !this.instance || this.failed) return;
      window.clearTimeout(this.loadTimer);
      this.loadTimer = null;
      const loading = document.querySelector("#exploration-loading");
      if (loading) { loading.hidden = true; delete loading.dataset.state; }
      if (this.retryButton) this.retryButton.hidden = true;
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
      this.showError(`${error.message} Pulsa Reintentar.`);
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

    mount(room) {
      const container = document.querySelector("#exploration-canvas");
      if (!container?.isConnected || !window.Phaser || !room?.exploration?.world || !this.multiplayer.privateExploration) return false;
      if (this.instance) return this.sync(room);

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
          type: Phaser.AUTO,
          parent: container,
          backgroundColor: "#081923",
          transparent: false,
          scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: "100%", height: "100%" },
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
          this.showError("El mapa tardó demasiado en cargar. Comprueba la conexión y pulsa Reintentar.");
        }, LOAD_TIMEOUT_MS);
        return true;
      } catch (error) {
        this.failed = true;
        this.instance = null;
        this.soundscape?.destroy();
        this.soundscape = null;
        this.showError(`No se pudo iniciar Phaser: ${error.message || "error desconocido"}. Pulsa Reintentar.`);
        this.onError?.(error);
        return false;
      }
    }

    updateRoom(room) { if (room?.state === "exploration") this.mount(room); else this.destroy(); }

    destroy() {
      this.generation += 1;
      this.failed = false;
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
    }
  }

  window.ExplorationGame = ExplorationGame;
})();
