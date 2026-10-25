import { CONFIG }  from '../config/GameConfig.js';
import { Storage } from './Storage.js';

const KEY        = 'leaderboard_v2';
const PER_DIFF   = 10;

/**
 * Per-difficulty top-10 boards.
 * Entry: { score, time, echoes, date }
 */
function load() {
  const data = Storage.get(KEY, null);
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;

  // Migrate the pre-1.3 time-only board (array of ms) into the normal board
  const boards = {};
  const legacy = Storage.get('lb', []);
  if (Array.isArray(legacy) && legacy.length) {
    boards.normal = legacy
      .filter(t => typeof t === 'number' && t > 0)
      .map(t => ({ score: Math.round((t / 1000) * CONFIG.SCORE_PER_SEC), time: t, echoes: 0, date: 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, PER_DIFF);
  }
  return boards;
}

let boards = load();

export const Leaderboard = {
  top(difficulty, n = PER_DIFF) {
    return (boards[difficulty] || []).slice(0, n);
  },

  best(difficulty) {
    const list = boards[difficulty] || [];
    return {
      score: list.reduce((m, e) => Math.max(m, e.score), 0),
      time:  list.reduce((m, e) => Math.max(m, e.time), 0),
    };
  },

  /** Adds a run; returns { rank (1-based, 0 if off-board), newBestScore, newBestTime }. */
  add(difficulty, entry) {
    const prev = this.best(difficulty);
    const list = [...(boards[difficulty] || []), entry]
      .sort((a, b) => b.score - a.score || b.time - a.time)
      .slice(0, PER_DIFF);
    boards = { ...boards, [difficulty]: list };
    Storage.set(KEY, boards);
    return {
      rank:         list.indexOf(entry) + 1,
      newBestScore: entry.score > prev.score,
      newBestTime:  entry.time  > prev.time,
    };
  },

  clear(difficulty) {
    boards = { ...boards, [difficulty]: [] };
    Storage.set(KEY, boards);
    Storage.remove('lb');
    Storage.remove('best');
  },
};
