(function () {
  "use strict";
  class MovementSystem {
    constructor(scene, player, speed) {
      this.scene = scene; this.player = player; this.speed = speed;
      this.keys = scene.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT");
      this.touch = { x: 0, y: 0 };
      this.onTouch = (event) => { this.touch = event.detail || { x: 0, y: 0 }; };
      window.addEventListener("hidetown:move", this.onTouch);
      this.onBlur = () => this.stop(); window.addEventListener("blur", this.onBlur);
      this.enabled = true;
    }
    update() {
      const body = this.player.sprite.body;
      if (!this.enabled || this.player.investigating) { body.setVelocity(0); this.player.updateLabel(); return false; }
      let x = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown) + this.touch.x;
      let y = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown) + this.touch.y;
      if (Math.abs(x) >= Math.abs(y)) y = 0; else x = 0;
      body.setVelocity(x * this.speed, y * this.speed);
      if (x < 0) this.player.setDirection("left"); else if (x > 0) this.player.setDirection("right"); else if (y < 0) this.player.setDirection("up"); else if (y > 0) this.player.setDirection("down");
      const moving = x !== 0 || y !== 0;
      this.player.sprite.setScale(1, moving ? 1 + Math.sin(performance.now() / 85) * .035 : 1);
      this.player.updateLabel(); return moving;
    }
    stop() { this.touch = { x: 0, y: 0 }; this.player.sprite.body?.setVelocity(0); }
    destroy() { this.stop(); window.removeEventListener("hidetown:move", this.onTouch); window.removeEventListener("blur", this.onBlur); }
  }
  window.HideTownGame.MovementSystem = MovementSystem;
})();
