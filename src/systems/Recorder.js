import { CONFIG } from '../config/GameConfig.js';

/** Index of the last buffer frame with t <= target (buffer is sorted by t). */
export function frameIndexAt(buf, target) {
  let lo = 0, hi = buf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (buf[mid].t <= target) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * Records the player's path on the *gameplay* clock (advanced only while playing),
 * so pauses and menus never leave gaps or jumps in what the echoes replay.
 */
export class Recorder {
  constructor() {
    this.reset();
  }

  record(x, y, deltaMs) {
    this.now += deltaMs;
    if (this.buffer.length && this.now - this.lastRecordTime < CONFIG.RECORD_INTERVAL) return;
    this.lastRecordTime = this.now;

    this.buffer.push({ x, y, t: this.now });

    // Prune old data outside the rolling window
    const cutoff = this.now - CONFIG.RECORD_WINDOW_MS;
    let drop = 0;
    while (drop < this.buffer.length && this.buffer[drop].t < cutoff) drop++;
    if (drop) this.buffer.splice(0, drop);
  }

  reset() {
    this.buffer = [];          // Array<{x, y, t}>
    this.now = 0;
    this.lastRecordTime = 0;
  }
}
