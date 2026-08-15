(function () {
  "use strict";
  class RemotePlayer {
    constructor(scene, player, color) {
      const state = player.explorationState;
      this.id = player.id;
      this.sprite = scene.add.sprite(state.x, state.y, "player-body").setTint(color).setDepth(29);
      this.label = scene.add.text(state.x, state.y - 51, player.name, { fontFamily: "system-ui", fontSize: "14px", color: player.connected ? "#fff7df" : "#a9b0af", stroke: "#071219", strokeThickness: 4 }).setOrigin(.5).setDepth(40);
      this.target = { ...state };
      this.setState(state, player.connected);
    }
    setState(state, connected = true) { this.target = { ...state }; this.sprite.setAlpha(connected ? 1 : .45).setFlipX(state.direction === "left"); this.label.setAlpha(connected ? 1 : .55); }
    update() {
      this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.target.x, .18);
      this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.target.y, .18);
      const bob = this.target.isMoving ? Math.sin(performance.now() / 90) * 2 : 0;
      this.sprite.setY(this.sprite.y + bob).setScale(this.target.investigating ? 1.06 : 1);
      this.label.setPosition(this.sprite.x, this.sprite.y - 51);
    }
    destroy() { this.sprite.destroy(); this.label.destroy(); }
  }
  window.HideTownGame.RemotePlayer = RemotePlayer;
})();
