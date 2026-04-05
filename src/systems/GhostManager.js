import { CONFIG } from '../config/GameConfig.js';
import { Ghost }  from '../entities/Ghost.js';

export class GhostManager {
  constructor(scene, recorder, audioManager, waveAnnouncer, initialDelay) {
    this.scene         = scene;
    this.recorder      = recorder;
    this.audioManager  = audioManager;
    this.waveAnnouncer = waveAnnouncer;
    this.ghosts        = [];
    this.ghostCount    = 0;
    this.active        = true;

    this._nextSpawnAt  = null;
    this._lastBeepStep = -1;
    this._scheduleSpawn(initialDelay != null ? initialDelay : CONFIG.GHOST_DELAY);
  }

  _scheduleSpawn(delayMs) {
    if (this.ghostCount >= CONFIG.MAX_GHOSTS) { this._nextSpawnAt = null; return; }
    this._nextSpawnAt  = this.scene.time.now + delayMs;
    this._lastBeepStep = -1;
    this.scene.time.delayedCall(delayMs, () => this.spawnGhost());
  }

  getDynamicInterval() {
    return Math.max(CONFIG.GHOST_MIN_INTERVAL, CONFIG.GHOST_INTERVAL - this.ghostCount * 500);
  }

  getTimeUntilNextSpawn() {
    if (this._nextSpawnAt === null || this.ghostCount >= CONFIG.MAX_GHOSTS) return -1;
    return Math.max(0, this._nextSpawnAt - this.scene.time.now);
  }

  get nextGhostNumber() { return this.ghostCount + 1; }
  get isOverdrive()     { return this.ghostCount >= CONFIG.GHOST_OVERDRIVE_COUNT; }

  spawnGhost() {
    if (!this.active || this.ghostCount >= CONFIG.MAX_GHOSTS) return;

    const buf = this.recorder.buffer;
    if (!buf || buf.length < 10) { this._scheduleSpawn(1000); return; }

    const behindMs = CONFIG.GHOST_DELAY + this.ghostCount * CONFIG.GHOST_INTERVAL;
    const ghost    = new Ghost(this.scene, this.recorder, behindMs);
    this.ghosts.push(ghost);
    this.ghostCount++;

    this.audioManager?.playGhostSpawn();
    this.waveAnnouncer?.announce(this.ghostCount);

    this._scheduleSpawn(this.getDynamicInterval());
  }

  /** Removes a ghost that was killed by Clash */
  killGhost(ghost) {
    ghost.alive = false;
    ghost.graphics.setVisible(false);
    const idx = this.ghosts.indexOf(ghost);
    if (idx !== -1) this.ghosts.splice(idx, 1);
  }

  /** Plays countdown beeps as next spawn approaches */
  _updateBeeps(audioManager) {
    const ms = this.getTimeUntilNextSpawn();
    if (ms < 0) return;
    let step = -1;
    if (ms < 1100)      step = 2;  // 1s beep
    else if (ms < 2100) step = 1;  // 2s beep
    else if (ms < 3100) step = 0;  // 3s beep
    if (step !== -1 && step !== this._lastBeepStep) {
      audioManager?.playCountdownBeep(step);
      this._lastBeepStep = step;
    }
  }

  update(timeWarpMultiplier = 1, delta = 16) {
    this.ghosts.forEach(g => g.update(timeWarpMultiplier, delta));
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      if (!this.ghosts[i].alive) this.ghosts.splice(i, 1);
    }
    this._updateBeeps(this.audioManager);
  }

  getAllGhosts()  { return this.ghosts; }
  stop()         { this.active = false; }

  destroyAll() {
    this.ghosts.forEach(g => g.destroy());
    this.ghosts = [];
    this.active = false;
  }
}
