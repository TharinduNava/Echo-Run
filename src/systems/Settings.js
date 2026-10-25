import { CONFIG }  from '../config/GameConfig.js';
import { Storage } from './Storage.js';

const DEFAULTS = {
  volume:       0.8,
  muted:        false,
  reducedFlash: false,
  difficulty:   'normal',
};

function load() {
  const saved = Storage.get('settings', {});
  const state = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  // Migrate the pre-1.3 standalone difficulty key
  const legacyDiff = Storage.get('difficulty', null);
  if (legacyDiff && !saved?.difficulty) state.difficulty = legacyDiff;
  if (!CONFIG.DIFFICULTIES[state.difficulty]) state.difficulty = DEFAULTS.difficulty;
  return state;
}

const state = load();
const listeners = new Set();

export const Settings = {
  get(key) { return state[key]; },

  set(key, value) {
    state[key] = value;
    Storage.set('settings', state);
    listeners.forEach(fn => fn(key, value));
  },

  toggle(key) { this.set(key, !state[key]); return state[key]; },

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Scale a flash alpha down when the player asked for reduced flashing. */
  flash(alpha) { return state.reducedFlash ? alpha * 0.2 : alpha; },

  /** Screen shake is skipped entirely in reduced-flash mode. */
  shake(camera, duration, intensity) {
    if (!state.reducedFlash) camera.shake(duration, intensity);
  },
};
