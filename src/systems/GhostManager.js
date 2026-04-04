import { CONFIG } from '../config/GameConfig.js';
import { Ghost } from '../entities/Ghost.js';

export class GhostManager {
  constructor(scene, recorder, audioManager) {
    this.scene        = scene;
    this.recorder     = recorder;
    this.audioManager = audioManager;
    this.ghosts       = [];
    this.ghostCount   = 0;
    this.active       = true;

    // Time tracking for next-spawn countdown UI
    this._nextSpawnAt = null;   // scene.time.now value when next ghost spawns
    this._scheduleSpawn(CONFIG.GHOST_DELAY);
  }

  // ── Scheduling ──────────────────────────────────────────

  _scheduleSpawn(delayMs) {
    if (this.ghostCount >= CONFIG.MAX_GHOSTS) {
      this._nextSpawnAt = null;
      return;
    }
    this._nextSpawnAt = this.scene.time.now + delayMs;
    this.scene.time.delayedCall(delayMs, () => this.spawnGhost());
  }

  getDynamicInterval() {
    // Interval shrinks by 500ms per ghost, minimum 3.5s
    return Math.max(3500, CONFIG.GHOST_INTERVAL - this.ghostCount * 500);
  }

  /** ms until next ghost spawns, -1 if at max */
  getTimeUntilNextSpawn() {
    if (this._nextSpawnAt === null || this.ghostCount >= CONFIG.MAX_GHOSTS) return -1;
    return Math.max(0, this._nextSpawnAt - this.scene.time.now);
  }

  /** Which echo number comes next (1-based) */
  get nextGhostNumber() { return this.ghostCount + 1; }

  /** Speed label for UI when in overdrive */
  get isOverdrive() { return this.ghostCount >= CONFIG.GHOST_OVERDRIVE_COUNT; }

  // ── Spawning ─────────────────────────────────────────────

  spawnGhost() {
    if (!this.active) return;
    if (this.ghostCount >= CONFIG.MAX_GHOSTS) { this._nextSpawnAt = null; return; }

    const buf = this.recorder.buffer;
    if (!buf || buf.length < 10) {
      this._scheduleSpawn(1000);
      return;
    }

    // Each ghost is a fixed time behind the player:
    //   Ghost #1: GHOST_DELAY (10s behind)
    //   Ghost #2: GHOST_DELAY + 1×GHOST_INTERVAL (19s behind)
    //   Ghost #N: GHOST_DELAY + (N-1)×GHOST_INTERVAL
    const behindMs = CONFIG.GHOST_DELAY + this.ghostCount * CONFIG.GHOST_INTERVAL;
    const ghost = new Ghost(this.scene, this.recorder, behindMs);
    this.ghosts.push(ghost);
    this.ghostCount++;

    this.audioManager?.playGhostSpawn();
    console.log(`Echo #${this.ghostCount} spawned — ${behindMs / 1000}s behind player`);

    this._scheduleSpawn(this.getDynamicInterval());
  }

  // ── Update ────────────────────────────────────────────────

  update(timeWarpMultiplier = 1, delta = 16) {
    this.ghosts.forEach(g => g.update(timeWarpMultiplier, delta));
    this.ghosts = this.ghosts.filter(g => g.alive);
  }

  getAllGhosts()  { return this.ghosts; }
  stop()         { this.active = false; }

  destroyAll() {
    this.ghosts.forEach(g => g.destroy());
    this.ghosts = [];
    this.active = false;
  }
}
