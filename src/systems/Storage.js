const PREFIX = 'echorun_';

/** localStorage wrapper that never throws (private mode, blocked storage, bad JSON). */
export const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch { return raw; }
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },

  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* storage unavailable */ }
  },
};
