(function () {
  "use strict";
  class InteractionSystem {
    constructor(scene, player, definition, names, callbacks) {
      this.scene = scene; this.player = player; this.definition = definition; this.names = names; this.callbacks = callbacks; this.current = null;
      this.key = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      this.onAction = () => this.activate(); window.addEventListener("hidetown:interact", this.onAction);
    }
    update() {
      const choices = [
        ...this.definition.objects.map((item) => ({ ...item, kind: "object", distance: Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, item.x, item.y) })),
        ...this.definition.transitions.map((item) => ({ ...item, kind: "transition", distance: Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, item.x, item.y) }))
      ];
      const limit = this.scene.game.registry.get("world").interactionDistance || 92;
      const nearest = choices.sort((a, b) => a.distance - b.distance)[0];
      this.current = nearest && nearest.distance <= (nearest.kind === "transition" ? limit + 12 : limit) ? nearest : null;
      this.scene.setActiveInteractable(this.current);
      const prompt = document.querySelector("#exploration-interaction-prompt");
      const button = document.querySelector("#exploration-interact");
      if (prompt) prompt.textContent = this.current ? `${this.current.kind === "transition" ? this.current.label : this.names.get(this.current.id)} · Presiona E` : "Acércate a una pista o una puerta";
      if (button) { button.disabled = !this.current; button.textContent = this.current?.kind === "transition" ? "Entrar / Salir" : "Investigar"; }
      if (Phaser.Input.Keyboard.JustDown(this.key)) this.activate();
    }
    activate() {
      if (!this.current || this.player.investigating) return;
      if (this.current.kind === "object") this.callbacks.investigate(this.current.id);
      else this.callbacks.transition(this.current.targetSceneId);
    }
    destroy() { window.removeEventListener("hidetown:interact", this.onAction); }
  }
  window.HideTownGame.InteractionSystem = InteractionSystem;
})();
