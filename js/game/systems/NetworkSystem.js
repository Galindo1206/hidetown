(function () {
  "use strict";
  class NetworkSystem {
    constructor(scene, player, multiplayer) {
      this.scene = scene; this.player = player; this.multiplayer = multiplayer; this.remotes = new Map(); this.lastSent = null; this.elapsed = 0; this.enabled = true;
      this.unsubscribers = [
        multiplayer.on("exploration-player-state", (payload) => this.receive(payload)),
        multiplayer.on("player-disconnected", () => this.syncRoom()), multiplayer.on("player-reconnected", () => this.syncRoom())
      ];
      this.syncRoom();
    }
    syncRoom() {
      const room = this.multiplayer.currentRoom; const selfId = this.multiplayer.session?.playerId;
      const visible = new Set();
      (room?.players || []).forEach((item, index) => {
        if (item.id === selfId || item.explorationState?.sceneId !== this.scene.sceneId) return;
        visible.add(item.id); let remote = this.remotes.get(item.id);
        if (!remote) { remote = new window.HideTownGame.RemotePlayer(this.scene, item, window.HideTownGame.playerColors[index % 6]); this.remotes.set(item.id, remote); }
        remote.setState(item.explorationState, item.connected);
      });
      for (const [id, remote] of this.remotes) if (!visible.has(id)) { remote.destroy(); this.remotes.delete(id); }
    }
    receive({ playerId, position }) {
      const item = this.multiplayer.currentRoom?.players?.find((candidate) => candidate.id === playerId);
      if (!item || playerId === this.multiplayer.session?.playerId) return;
      item.explorationState = position;
      if (position?.sceneId !== this.scene.sceneId) { this.syncRoom(); return; }
      this.syncRoom();
    }
    update(delta, moving) {
      this.elapsed += delta; this.remotes.forEach((remote) => remote.update());
      if (!this.enabled || this.elapsed < 80) return;
      this.elapsed = 0;
      const next = { sceneId: this.scene.sceneId, x: this.player.sprite.x, y: this.player.sprite.y, direction: this.player.direction, isMoving: moving };
      const changed = !this.lastSent || Math.hypot(next.x - this.lastSent.x, next.y - this.lastSent.y) >= 2 || next.direction !== this.lastSent.direction || next.isMoving !== this.lastSent.isMoving;
      if (!changed) return;
      this.lastSent = { ...next };
      this.multiplayer.sendExplorationPosition(next).catch((error) => {
        if (["MOVEMENT_TOO_FAST", "POSITION_OUT_OF_BOUNDS"].includes(error.code)) this.scene.restoreAuthoritativePosition();
      });
    }
    destroy() { this.enabled = false; this.unsubscribers.forEach((off) => off()); this.remotes.forEach((remote) => remote.destroy()); this.remotes.clear(); }
  }
  window.HideTownGame.NetworkSystem = NetworkSystem;
})();
