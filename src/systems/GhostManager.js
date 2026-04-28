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

    // Ghost ink trail: array of {x,y,t,col} marks left on arena floor
    this._inkMarks   = [];
    this._inkGfx     = scene.add.graphics().setDepth(4);

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

  /** Assign tier (speed + visual) based on ghost index */
  _assignTier(ghost, index) {
    if (index >= CONFIG.GHOST_TIER3_COUNT) {
      ghost.tier = 3;
      ghost._speedMult = CONFIG.GHOST_TIER3_SPEED;
    } else if (index >= CONFIG.GHOST_TIER2_COUNT) {
      ghost.tier = 2;
      ghost._speedMult = CONFIG.GHOST_TIER2_SPEED;
    } else {
      ghost.tier = 1;
      ghost._speedMult = 1.0;
    }
  }

  spawnGhost() {
    if (!this.active || this.ghostCount >= CONFIG.MAX_GHOSTS) return;

    const buf = this.recorder.buffer;
    if (!buf || buf.length < 10) { this._scheduleSpawn(1000); return; }

    const behindMs = CONFIG.GHOST_DELAY + this.ghostCount * CONFIG.GHOST_INTERVAL;
    const ghost    = new Ghost(this.scene, this.recorder, behindMs);
    this._assignTier(ghost, this.ghostCount);
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
    if (ms < 500)       step = 2;
    else if (ms < 1500) step = 1;
    else if (ms < 2500) step = 0;
    if (step !== -1 && step !== this._lastBeepStep) {
      audioManager?.playCountdownBeep(step);
      this._lastBeepStep = step;
    }
  }

  /** Record an ink mark at a ghost's current position */
  _recordInk(ghost) {
    const col = ghost.tier === 3 ? 0xff3355 : ghost.tier === 2 ? 0xff8c00 : 0xa855f7;
    this._inkMarks.push({ x: ghost.x, y: ghost.y, t: this.scene.time.now, col });
    // Cap to 300 marks to avoid unbounded growth
    if (this._inkMarks.length > 300) this._inkMarks.shift();
  }

  _drawInkTrail(now) {
    const g = this._inkGfx;
    g.clear();
    const fadeDur = CONFIG.GHOST_INK_FADE_MS;
    for (let i = this._inkMarks.length - 1; i >= 0; i--) {
      const m = this._inkMarks[i];
      const age = now - m.t;
      if (age > fadeDur) { this._inkMarks.splice(0, i + 1); break; }
      const alpha = (1 - age / fadeDur) * 0.18;
      g.fillStyle(m.col, alpha);
      g.fillCircle(m.x, m.y, 3.5);
    }
  }

  update(timeWarpMultiplier = 1, delta = 16) {
    const now = this.scene.time.now;

    this.ghosts.forEach(g => {
      g.update(timeWarpMultiplier, delta);
      g._inkTimer = (g._inkTimer || 0) + delta;
      if (g._inkTimer >= 80) { this._recordInk(g); g._inkTimer -= 80; }
    });

    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      if (!this.ghosts[i].alive) {
        const wasExpired = this.ghosts[i]._expired;
        this.ghosts.splice(i, 1);
        if (wasExpired) {
          this.ghostCount--;
          this._scheduleSpawn(this.getDynamicInterval());
        }
      }
    }

    this._drawInkTrail(now);
    this._updateBeeps(this.audioManager);
  }

  getAllGhosts()  { return [...this.ghosts]; }
  stop()         { this.active = false; }

  destroyAll() {
    this.ghosts.forEach(g => g.destroy());
    this.ghosts = [];
    this._inkGfx.destroy();
    this.active = false;
  }
}
