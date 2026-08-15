import { AppError } from "./errors.js";

export class RateLimiter {
  constructor({ windowMs = 10_000, maxActions = 8 } = {}) {
    this.windowMs = windowMs;
    this.maxActions = maxActions;
    this.entries = new Map();
  }

  consume(key) {
    const now = Date.now();
    const recent = (this.entries.get(key) || []).filter((timestamp) => now - timestamp < this.windowMs);
    if (recent.length >= this.maxActions) throw new AppError("RATE_LIMITED");
    recent.push(now);
    this.entries.set(key, recent);
  }

  clear() {
    this.entries.clear();
  }

  cleanup(now = Date.now()) {
    for (const [key, timestamps] of this.entries) {
      const recent = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
      if (recent.length) this.entries.set(key, recent);
      else this.entries.delete(key);
    }
  }
}
