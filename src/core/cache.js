

class TTLCache {
  constructor({ ttlMs = 60_000, maxEntries = 500, cleanupIntervalMs = 120_000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();

    this.timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.store.set(key, {
      value,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      expiresAt: Date.now() + ttlMs
    });
  }

  cleanup() {
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  evictOldest() {
    let oldestKey = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}

const cache = new TTLCache({
  ttlMs: 60_000,
  maxEntries: 1000,
  cleanupIntervalMs: 120_000
});

function makeCacheKey(user = {}, texte = "") {
  const classe = String(user?.classe || "").toLowerCase().trim();
  const nom = String(user?.nom || "").toLowerCase().trim();
  const q = String(texte || "").toLowerCase().trim();

  return `${nom}|${classe}|${q}`;
}

function getCache(key) {
  return cache.get(key);
}

function setCache(key, value) {
  cache.set(key, value);
}

module.exports = {
  TTLCache,
  cache,
  makeCacheKey,
  getCache,
  setCache
};
