(function () {
  "use strict";
  class PreloadScene extends Phaser.Scene {
    constructor() { super("PreloadScene"); }
    preload() {
      const loading = document.querySelector("#exploration-loading");
      if (loading) { loading.hidden = false; loading.textContent = "Preparando San Jerónimo…"; }
      this.load.on("loaderror", () => { if (loading) loading.textContent = "Un recurso decorativo falló; usando sustituto local…"; });
    }
    create() {
      const graphics = this.make.graphics({ add: false });
      graphics.fillStyle(0x071219, .35).fillEllipse(24, 55, 42, 13);
      graphics.fillStyle(0xe7ddc2).fillEllipse(24, 16, 24, 26);
      graphics.fillStyle(0x6e493a).fillRoundedRect(8, 25, 32, 30, 10);
      graphics.fillStyle(0xd6ad57).fillTriangle(7, 29, 41, 29, 24, 17);
      graphics.fillStyle(0x20262a).fillRect(13, 52, 9, 10).fillRect(27, 52, 9, 10);
      graphics.generateTexture("player-body", 48, 64); graphics.destroy();
      const loading = document.querySelector("#exploration-loading"); if (loading) loading.hidden = true;
      const context = this.game.registry.get("context");
      this.scene.start(window.HideTownGame.sceneKey(context.initialSceneId));
    }
  }
  window.HideTownGame.PreloadScene = PreloadScene;
})();
