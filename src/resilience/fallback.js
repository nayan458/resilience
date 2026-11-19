export class StaleCache {
  constructor({ maxAgeMs = 5 * 60_000 } = {}) {
    this.maxAgeMs = maxAgeMs;
    this.store = new Map();
  }

  set(key, value) {
    this.store.set(key, { value, at: Date.now() });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    const ageMs = Date.now() - entry.at;
    if (ageMs > this.maxAgeMs) return null;
    return { value: entry.value, ageMs };
  }
}