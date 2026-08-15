(function () {
  "use strict";
  class ExplorationGame {
    constructor({ multiplayer, audio, onError }) { this.multiplayer = multiplayer; this.audio = audio; this.onError = onError; this.instance = null; this.soundscape = null; }
    mount(room) {
      if (!window.Phaser || !room?.exploration?.world || !this.multiplayer.privateExploration) return false;
      const sceneId = this.multiplayer.privateExploration.sceneId || "village";
      if (this.instance) {
        const active = this.instance.scene.getScenes(true)[0];
        if (active?.sceneId !== sceneId && window.HideTownGame.sceneKey(sceneId)) active.scene.start(window.HideTownGame.sceneKey(sceneId));
        return true;
      }
      this.soundscape = new window.HideTownGame.ExplorationAudio(this.audio);
      this.instance = new Phaser.Game({
        type: Phaser.AUTO, parent: "exploration-canvas", backgroundColor: "#081923", transparent: false,
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: "100%", height: "100%" },
        physics: { default: "arcade", arcade: { debug: false } },
        render: { antialias: true, pixelArt: false, roundPixels: false },
        scene: [window.HideTownGame.PreloadScene, window.HideTownGame.VillageScene, window.HideTownGame.ChurchScene, window.HideTownGame.CaretakerHouseScene, window.HideTownGame.BellTowerScene]
      });
      this.instance.registry.set("world", room.exploration.world);
      this.instance.registry.set("soundscape", this.soundscape);
      this.instance.registry.set("context", { initialSceneId: sceneId, multiplayer: this.multiplayer, onError: this.onError });
      return true;
    }
    updateRoom(room) { if (room?.state === "exploration") this.mount(room); else this.destroy(); }
    destroy() {
      if (!this.instance) return;
      this.soundscape?.destroy(); this.instance.destroy(true); this.instance = null; this.soundscape = null;
      document.querySelector("#exploration-canvas")?.replaceChildren();
      const loading = document.querySelector("#exploration-loading"); if (loading) loading.hidden = true;
    }
  }
  window.ExplorationGame = ExplorationGame;
})();
