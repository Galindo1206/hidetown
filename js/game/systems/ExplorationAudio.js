(function () {
  "use strict";
  class ExplorationAudio {
    constructor(audio) { this.audio = audio; this.lastStep = 0; this.sceneId = "village"; this.ambientTimer = null; }
    enter(sceneId) {
      this.sceneId = sceneId; this.audio.startAmbience();
      this.audio.play(sceneId === "village" ? "wind" : "interior", { cooldown: 1000 });
      if (sceneId === "village") this.scheduleDistantSound();
    }
    scheduleDistantSound() {
      window.clearTimeout(this.ambientTimer);
      this.ambientTimer = window.setTimeout(() => {
        this.audio.play(Math.random() > .72 ? "distantDog" : "distantBell", { cooldown: 8000 });
        this.scheduleDistantSound();
      }, 18_000 + Math.random() * 16_000);
    }
    step() { if (Date.now() - this.lastStep > 360) { this.lastStep = Date.now(); this.audio.play(this.sceneId === "village" ? "stoneStep" : "dirtStep", { cooldown: 320 }); } }
    door() { this.audio.play("door", { cooldown: 500 }); this.audio.play("creak", { cooldown: 500 }); }
    investigate() { this.audio.play("investigate", { cooldown: 500 }); }
    destroy() { window.clearTimeout(this.ambientTimer); this.ambientTimer = null; this.audio.stopAmbience(); }
  }
  window.HideTownGame.ExplorationAudio = ExplorationAudio;
})();
