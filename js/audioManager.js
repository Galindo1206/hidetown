(function () {
  "use strict";

  const STORAGE_KEY = "el-pueblo-oculto:sound-muted";
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  class AudioManager {
    #onVisibilityChange;

    constructor() {
      this.context = null;
      this.master = null;
      this.ambient = null;
      this.lastPlayed = new Map();
      this.muted = this.#readPreference();
      this.unlocked = false;
      this.#onVisibilityChange = () => {
        if (!this.context) return;
        if (document.hidden) this.context.suspend().catch(() => {});
        else if (!this.muted && this.unlocked) this.context.resume().catch(() => {});
      };
      document.addEventListener("visibilitychange", this.#onVisibilityChange);
    }

    #readPreference() {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored === null ? true : stored === "true";
      }
      catch (error) { return true; }
    }

    #savePreference() {
      try { window.localStorage.setItem(STORAGE_KEY, String(this.muted)); }
      catch (error) { /* The preference remains valid for this session. */ }
    }

    #ensureContext() {
      if (!AudioContextClass) return false;
      if (!this.context) {
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.context.destination);
      }
      this.unlocked = true;
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
      return true;
    }

    setMuted(muted, { userGesture = false } = {}) {
      this.muted = Boolean(muted);
      this.#savePreference();
      if (userGesture && !this.muted) this.#ensureContext();
      if (this.master && this.context) {
        const now = this.context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.18, now, 0.025);
      }
      if (this.muted) this.stopAmbience();
      return this.muted;
    }

    toggle() {
      return this.setMuted(!this.muted, { userGesture: true });
    }

    unlock() {
      if (this.muted) return false;
      const ready = this.#ensureContext();
      if (ready) this.startAmbience();
      return ready;
    }

    play(cue, { cooldown = 350 } = {}) {
      if (this.muted || !this.unlocked || !this.#ensureContext()) return false;
      const nowMs = Date.now();
      if (nowMs - (this.lastPlayed.get(cue) || 0) < cooldown) return false;
      this.lastPlayed.set(cue, nowMs);
      const patterns = {
        bell: [[392, 0, .9, "sine"], [587, .08, .75, "sine"], [784, .16, .65, "sine"]],
        clue: [[523, 0, .12, "triangle"], [659, .1, .16, "triangle"]],
        warning: [[294, 0, .1, "sine"], [294, .18, .1, "sine"]],
        vote: [[392, 0, .1, "triangle"], [494, .09, .12, "triangle"], [659, .18, .18, "triangle"]],
        village: [[392, 0, .35, "sine"], [523, .12, .45, "sine"], [659, .24, .6, "sine"]],
        creature: [[196, 0, .45, "triangle"], [147, .18, .65, "sine"]]
      };
      (patterns[cue] || patterns.clue).forEach(([frequency, delay, duration, type]) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const start = this.context.currentTime + delay;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(cue === "bell" ? 0.1 : 0.07, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(this.master);
        oscillator.start(start);
        oscillator.stop(start + duration + .03);
      });
      return true;
    }

    startAmbience() {
      if (this.muted || this.ambient || !this.unlocked || !this.#ensureContext()) return;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const lfo = this.context.createOscillator();
      const lfoGain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 55;
      gain.gain.value = 0.012;
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 0.006;
      lfo.connect(lfoGain).connect(gain.gain);
      oscillator.connect(gain).connect(this.master);
      oscillator.start();
      lfo.start();
      this.ambient = { oscillator, lfo, gain };
    }

    stopAmbience() {
      if (!this.ambient) return;
      const { oscillator, lfo, gain } = this.ambient;
      if (this.context) gain.gain.setTargetAtTime(0.0001, this.context.currentTime, .04);
      window.setTimeout(() => {
        try { oscillator.stop(); lfo.stop(); } catch (error) { /* Already stopped. */ }
      }, 180);
      this.ambient = null;
    }

    destroy() {
      this.stopAmbience();
      document.removeEventListener("visibilitychange", this.#onVisibilityChange);
      if (this.context) this.context.close().catch(() => {});
      this.context = null;
    }
  }

  window.AudioManager = AudioManager;
})();
