import { CONFIG } from '../config/GameConfig.js';

export class Recorder {
  constructor() {
    this.buffer = [];          // Array<{x, y, t}>
    this.lastRecordTime = 0;
    this.startTime = Date.now();
  }

  record(x, y) {
    const now = Date.now() - this.startTime;

    // Only record at RECORD_INTERVAL rate
    if (now - this.lastRecordTime < CONFIG.RECORD_INTERVAL) return;
    this.lastRecordTime = now;

    this.buffer.push({ x, y, t: now });

    // Prune old data outside the rolling window
    const cutoff = now - CONFIG.RECORD_WINDOW_MS;
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) {
      this.buffer.shift();
    }
  }

  // Clone buffer snapshot for a ghost to replay
  snapshotFrom(startOffsetMs) {
    // Returns all recorded frames from startOffsetMs onward
    return this.buffer
      .filter(f => f.t >= startOffsetMs)
      .map(f => ({ ...f })); // deep copy
  }

  // Get full buffer clone
  snapshotAll() {
    return this.buffer.map(f => ({ ...f }));
  }

  getElapsed() {
    return Date.now() - this.startTime;
  }

  reset() {
    this.buffer = [];
    this.lastRecordTime = 0;
    this.startTime = Date.now();
  }
}
