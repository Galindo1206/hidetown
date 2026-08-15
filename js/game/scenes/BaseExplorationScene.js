(function () {
  "use strict";
  const { palette } = window.HideTownGame;
  class BaseExplorationScene extends Phaser.Scene {
    constructor(key, sceneId) { super(key); this.sceneId = sceneId; this.interactableNodes = new Map(); }
    create() {
      this.context = this.game.registry.get("context"); this.world = this.game.registry.get("world");
      this.definition = this.world.scenes.find((item) => item.id === this.sceneId);
      this.physics.world.setBounds(0, 0, this.definition.width, this.definition.height);
      this.cameras.main.setBounds(0, 0, this.definition.width, this.definition.height).setBackgroundColor(palette.night);
      this.drawScene(); this.createCollisionBodies(); this.createInteractables();
      const state = this.context.multiplayer.privateExploration?.sceneId === this.sceneId
        ? this.context.multiplayer.privateExploration : this.definition.spawn;
      const selfIndex = Math.max(0, this.context.multiplayer.currentRoom.players.findIndex((item) => item.id === this.context.multiplayer.session.playerId));
      const self = this.context.multiplayer.currentRoom.players[selfIndex];
      this.localPlayer = new window.HideTownGame.LocalPlayer(this, state, self?.name || "Jugador", window.HideTownGame.playerColors[selfIndex % 6]);
      this.physics.add.collider(this.localPlayer.sprite, this.blockers);
      this.movement = new window.HideTownGame.MovementSystem(this, this.localPlayer, this.world.playerSpeed);
      this.network = new window.HideTownGame.NetworkSystem(this, this.localPlayer, this.context.multiplayer);
      this.interaction = new window.HideTownGame.InteractionSystem(this, this.localPlayer, this.definition, window.HideTownGame.objectNames(this.context.multiplayer.currentRoom), {
        investigate: (id) => this.investigate(id), transition: (target) => this.transition(target)
      });
      this.soundscape = this.game.registry.get("soundscape"); this.soundscape.enter(this.sceneId);
      this.cameras.main.startFollow(this.localPlayer.sprite, true, .1, .1);
      this.resizeCamera(this.scale.width, this.scale.height);
      this.onResize = ({ width, height }) => this.resizeCamera(width, height); this.scale.on("resize", this.onResize);
      this.unsubscribers = [
        this.context.multiplayer.on("exploration-search-started", (search) => this.setInvestigating(true, search.completesAt)),
        this.context.multiplayer.on("exploration-clue-found", () => this.setInvestigating(false)),
        this.context.multiplayer.on("connection", ({ connected }) => { if (this.movement) this.movement.enabled = Boolean(connected) && !this.localPlayer.investigating; })
      ];
      if (this.context.multiplayer.privateExploration?.activeSearch) this.setInvestigating(true, this.context.multiplayer.privateExploration.activeSearch.completesAt);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
      document.querySelector("#exploration-location-name").textContent = this.definition.name;
    }
    drawScene() {
      const g = this.add.graphics().setDepth(0);
      g.fillStyle(this.sceneId === "village" ? palette.pine : 0x332a28).fillRect(0, 0, this.definition.width, this.definition.height);
      if (this.sceneId === "village") this.drawVillage(g); else this.drawInterior(g);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        for (let index = 0; index < 5; index += 1) {
          const fog = this.add.ellipse(index * 360, 150 + (index % 2) * 310, 430, 110, palette.mist, .055).setDepth(50);
          this.tweens.add({ targets: fog, x: fog.x + 180, duration: 18000 + index * 1200, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        }
      }
    }
    drawVillage(g) {
      g.fillStyle(0x29423a).fillRect(0, 0, 1600, 1152);
      g.fillStyle(0x4e5148).fillRoundedRect(570, 380, 620, 480, 110).fillRoundedRect(210, 510, 1180, 190, 75);
      g.lineStyle(5, 0x767166, .65); for (let x = 250; x < 1370; x += 70) g.lineBetween(x, 525, x + 40, 675);
      this.definition.obstacles.forEach((box, index) => {
        g.fillStyle(index < 2 ? 0x5b4438 : palette.adobe).fillRoundedRect(box.x, box.y, box.width, box.height, 18);
        g.fillStyle(0x382d2b).fillTriangle(box.x - 18, box.y + 20, box.x + box.width / 2, box.y - 50, box.x + box.width + 18, box.y + 20);
        g.fillStyle(palette.warm, .85).fillRoundedRect(box.x + 35, box.y + 45, 38, 28, 5);
      });
      g.fillStyle(0x39503d); for (let x = 50; x < 1550; x += 145) { g.fillEllipse(x, 1060 - (x % 220), 58, 95); g.fillStyle(0x47372e).fillRect(x - 6, 1050 - (x % 220), 12, 52).fillStyle(0x39503d); }
      g.fillStyle(0x50666a, .7).fillEllipse(850, 545, 130, 82); g.lineStyle(8, 0xb6a77e).strokeEllipse(850, 545, 130, 82);
      this.definition.transitions.forEach((door) => g.fillStyle(palette.warm, .75).fillRoundedRect(door.x - 25, door.y - 16, 50, 32, 6));
      this.add.text(800, 430, "PLAZA DE SAN JERÓNIMO", { fontFamily: "Georgia", fontSize: "25px", color: "#d8c79c" }).setOrigin(.5).setDepth(3);
      this.add.text(350, 710, "CALLE OCCIDENTAL", { fontFamily: "Georgia", fontSize: "20px", color: "#b9b29f" }).setAngle(-3).setDepth(3);
    }
    drawInterior(g) {
      g.fillStyle(0x594637).fillRoundedRect(38, 35, this.definition.width - 76, this.definition.height - 70, 18);
      g.fillStyle(0x3b302b).fillRoundedRect(62, 62, this.definition.width - 124, this.definition.height - 124, 12);
      g.lineStyle(3, 0x6c5540, .7); for (let y = 100; y < 560; y += 48) g.lineBetween(70, y, 825, y);
      this.definition.obstacles.forEach((box) => { g.fillStyle(palette.adobe).fillRoundedRect(box.x, box.y, box.width, box.height, 12); g.lineStyle(3, palette.gold, .22).strokeRoundedRect(box.x, box.y, box.width, box.height, 12); });
      g.fillStyle(palette.warm, .8).fillCircle(448, 220, 18); g.fillStyle(palette.warm, .12).fillCircle(448, 220, 95);
      this.definition.transitions.forEach((door) => g.fillStyle(0x171515).fillRoundedRect(door.x - 38, door.y - 18, 76, 36, 8));
    }
    createCollisionBodies() {
      this.blockers = this.physics.add.staticGroup();
      this.definition.obstacles.forEach((box) => { const body = this.add.rectangle(box.x + box.width / 2, box.y + box.height / 2, box.width, box.height, 0, 0); this.physics.add.existing(body, true); this.blockers.add(body); });
    }
    createInteractables() {
      const names = window.HideTownGame.objectNames(this.context.multiplayer.currentRoom);
      this.definition.objects.forEach((item) => {
        const halo = this.add.ellipse(item.x, item.y, 65, 40, palette.gold, .08).setStrokeStyle(3, palette.gold, .25).setDepth(10);
        const icon = this.add.text(item.x, item.y - 3, "⌕", { fontFamily: "Georgia", fontSize: "27px", color: "#e9c66f", stroke: "#382711", strokeThickness: 3 }).setOrigin(.5).setDepth(12);
        const label = this.add.text(item.x, item.y + 27, names.get(item.id) || item.id, { fontFamily: "system-ui", fontSize: "13px", color: "#e7ddc2", backgroundColor: "#081923cc", padding: { x: 5, y: 2 } }).setOrigin(.5).setDepth(12).setVisible(false);
        this.interactableNodes.set(item.id, { halo, icon, label });
      });
    }
    setActiveInteractable(item) {
      this.interactableNodes.forEach((nodes, id) => { const active = item?.kind === "object" && item.id === id; nodes.halo.setAlpha(active ? 1 : .35).setScale(active ? 1.18 : 1); nodes.label.setVisible(active); });
    }
    async investigate(objectId) {
      this.setInvestigating(true); this.soundscape.investigate();
      try { await this.context.multiplayer.investigateObject(objectId); }
      catch (error) { this.setInvestigating(false); this.context.onError(error); }
    }
    async transition(targetSceneId) {
      this.movement.enabled = false; this.soundscape.door(); this.cameras.main.fadeOut(220, 8, 15, 20);
      try {
        const result = await this.context.multiplayer.transitionExplorationScene(targetSceneId);
        this.time.delayedCall(220, () => this.scene.start(window.HideTownGame.sceneKey(result.position.sceneId)));
      } catch (error) { this.movement.enabled = true; this.cameras.main.fadeIn(150); this.context.onError(error); }
    }
    setInvestigating(value, completesAt) {
      if (!this.localPlayer) return; this.localPlayer.investigating = Boolean(value); this.movement.enabled = !value;
      if (value && Number.isFinite(completesAt)) this.time.delayedCall(Math.max(0, completesAt - (Date.now() + this.context.multiplayer.serverTimeOffset)) + 80, () => this.setInvestigating(false));
    }
    restoreAuthoritativePosition() {
      const state = this.context.multiplayer.privateExploration;
      if (state?.sceneId === this.sceneId) this.localPlayer.sprite.setPosition(state.x, state.y);
    }
    resizeCamera(width, height) { this.cameras.main.setZoom(Phaser.Math.Clamp(Math.min(width / 900, height / 650), .72, 1.12)); }
    update(_time, delta) { const moving = this.movement?.update() || false; if (moving) this.soundscape.step(); this.interaction?.update(); this.network?.update(delta, moving); }
    cleanup() { this.scale.off("resize", this.onResize); this.unsubscribers?.forEach((off) => off()); this.interaction?.destroy(); this.network?.destroy(); this.movement?.destroy(); this.localPlayer?.destroy(); }
  }
  window.HideTownGame.BaseExplorationScene = BaseExplorationScene;
})();
