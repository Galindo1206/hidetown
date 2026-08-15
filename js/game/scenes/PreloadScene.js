(function () {
  "use strict";
  class PreloadScene extends Phaser.Scene {
    constructor() { super("PreloadScene"); this.essentialLoadFailed = false; }
    preload() {
      const loading = document.querySelector("#exploration-loading");
      const label = document.querySelector("#exploration-loading-message");
      if (loading) loading.hidden = false;
      if (label) label.textContent = "Preparando San Jerónimo…";
      this.load.on("loaderror", (file) => {
        const resource = file?.src || file?.url || file?.key || "recurso desconocido";
        const essential = file?.config?.essential !== false;
        if (essential) this.essentialLoadFailed = true;
        if (!essential && file?.key && !this.textures.exists(file.key)) {
          const fallback = this.textures.createCanvas(file.key, 32, 32);
          const context = fallback?.context;
          if (context) {
            context.fillStyle = "#76553f"; context.fillRect(0, 0, 32, 32);
            context.fillStyle = "#d6ad57"; context.fillRect(0, 0, 16, 16); context.fillRect(16, 16, 16, 16);
            fallback.refresh();
          }
        }
        this.game.registry.get("context")?.onResourceError?.(resource, essential);
      });
    }
    create() {
      const graphics = this.make.graphics({ add: false });
      graphics.fillStyle(0x071219, .35).fillEllipse(24, 55, 42, 13);
      graphics.fillStyle(0xe7ddc2).fillEllipse(24, 16, 24, 26);
      graphics.fillStyle(0x6e493a).fillRoundedRect(8, 25, 32, 30, 10);
      graphics.fillStyle(0xd6ad57).fillTriangle(7, 29, 41, 29, 24, 17);
      graphics.fillStyle(0x20262a).fillRect(13, 52, 9, 10).fillRect(27, 52, 9, 10);
      graphics.generateTexture("player-body", 48, 64); graphics.destroy();
      const context = this.game.registry.get("context");
      if (this.essentialLoadFailed) return;
      context?.onReady?.();
      this.scene.start(window.HideTownGame.sceneKey(context.initialSceneId));
    }
  }
  window.HideTownGame.PreloadScene = PreloadScene;
})();
