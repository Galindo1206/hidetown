(function () {
  "use strict";
  class LocalPlayer {
    constructor(scene, state, name, color) {
      this.scene = scene;
      this.sprite = scene.physics.add.sprite(state.x, state.y, "player-body").setTint(color).setDepth(30).setCollideWorldBounds(true);
      this.sprite.body.setSize(28, 25).setOffset(10, 37);
      this.label = scene.add.text(state.x, state.y - 51, name, { fontFamily: "system-ui", fontSize: "14px", color: "#fff7df", stroke: "#071219", strokeThickness: 4 }).setOrigin(.5).setDepth(40);
      this.direction = state.direction || "down";
      this.investigating = false;
    }
    setDirection(direction) {
      this.direction = direction;
      this.sprite.setFlipX(direction === "left");
      this.sprite.setAngle(direction === "up" ? 180 : direction === "left" ? -4 : direction === "right" ? 4 : 0);
    }
    updateLabel() { this.label.setPosition(this.sprite.x, this.sprite.y - 51); }
    setInvestigating(value) { this.investigating = Boolean(value); this.sprite.setTint(value ? 0xd6ad57 : this.sprite.tintTopLeft); }
    destroy() { this.label.destroy(); this.sprite.destroy(); }
  }
  window.HideTownGame.LocalPlayer = LocalPlayer;
})();
