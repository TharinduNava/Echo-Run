import { CONFIG } from '../config/GameConfig.js';
import { Ghost }  from '../entities/Ghost.js';

/**
 * Spawns and owns echoes.
 * Each live echo occupies a "slot"; slot N replays the path `delay + N * interval` ms behind,
 * so a respawned echo never duplicates the path of one that is still alive.
 * All timers run on the scene clock, which GameScene pauses during menus.
 */
export class GhostManager {
  constructor(scene, recorder, audioManager, waveAnnouncer, preset) {
    this.scene         = scene;
    this.recorder      = recorder;
    this.audioManager  = audioManager;
    this.waveAnnouncer = waveAnnouncer;
    this.ghosts        = [];
    this.active        = true;

    this._delay      = preset.ghostDelay;
    this._interval   = preset.ghostInterval;
    this._baseSpeed  = preset.ghostSpeed ?? 1;
    this._minInterval = Math.min(CONFIG.GHOST_MIN_INTERVAL, this._interval * 0.75);

    this._slots        = new Array(CONFIG.MAX_GHOSTS).fill(null);
    this._spawnedTotal = 0;
    this._spawnTimer   = null;
    this._lastBeepStep = -1;

    // Ghost ink trail: {x,y,t,col} marks left on the arena floor
    this._inkMarks = [];
    this._inkGfx   = scene.add.graphics().setDepth(4);
    this._inkClock = 0;

    this._ensureSpawnScheduled(this._delay);
  }

  get ghostCount()      { return this.ghosts.length; }
  get totalSpawned()    { return this._spawnedTotal; }
  get nextGhostNumber() { return this._spawnedTotal + 1; }
  get isOverdrive()     { return this.ghosts.length >= CONFIG.GHOST_OVERDRIVE_COUNT; }

  getDynamicInterval() {
    return Math.max(this._minInterval, this._interval - this.ghosts.length * 500);
  }

  getTimeUntilNextSpawn() {
    return this._spawnTimer ? Math.max(0, this._spawnTimer.getRemaining()) : -1;
  }

  _ensureSpawnScheduled(delayMs) {
    if (!this.active || this._spawnTimer || this.ghosts.length >= CONFIG.MAX_GHOSTS) return;
    this._lastBeepStep = -1;
    this._spawnTimer = this.scene.time.delayedCall(delayMs, () => {
      this._spawnTimer = null;
      this.spawnGhost();
    });
  }

  _assignTier(ghost, index) {
    if (index >= CONFIG.GHOST_TIER3_COUNT)      { ghost.tier = 3; ghost._speedMult = CONFIG.GHOST_TIER3_SPEED; }
    else if (index >= CONFIG.GHOST_TIER2_COUNT) { ghost.tier = 2; ghost._speedMult = CONFIG.GHOST_TIER2_SPEED; }
    else                                        { ghost.tier = 1; ghost._speedMult = 1.0; }
    ghost._speedMult *= this._baseSpeed;
  }

  spawnGhost() {
    if (!this.active || this.ghosts.length >= CONFIG.MAX_GHOSTS) return;

    const slot = this._slots.indexOf(null);
    const buf  = this.recorder.buffer;
    if (slot === -1) return;
    if (!buf || buf.length < 10) { this._ensureSpawnScheduled(1000); return; }

    const behindMs = this._delay + slot * this._interval;
    const ghost    = new Ghost(this.scene, this.recorder, behindMs);
    if (!ghost.alive) { ghost.destroy(); this._ensureSpawnScheduled(1000); return; }

    this._assignTier(ghost, this._spawnedTotal);
    ghost.slot = slot;
    ghost.playSpawnPulse();
    this._slots[slot] = ghost;
    this.ghosts.push(ghost);
    this._spawnedTotal++;

    this.audioManager?.playGhostSpawn();
    this.waveAnnouncer?.announce(this._spawnedTotal, ghost.tier);

    this._ensureSpawnScheduled(this.getDynamicInterval());
  }

  _remove(ghost) {
    const idx = this.ghosts.indexOf(ghost);
    if (idx !== -1) this.ghosts.splice(idx, 1);
    if (ghost.slot >= 0 && this._slots[ghost.slot] === ghost) this._slots[ghost.slot] = null;
    ghost.destroy();
    this._ensureSpawnScheduled(this.getDynamicInterval());
  }

  /** Removes an echo destroyed by Clash */
  killGhost(ghost) { this._remove(ghost); }

  setLure(pos) { this.ghosts.forEach(g => g.setLure(pos)); }

  _updateBeeps() {
    const ms = this.getTimeUntilNextSpawn();
    if (ms < 0) return;
    let step = -1;
    if (ms < 500)       step = 2;
    else if (ms < 1500) step = 1;
    else if (ms < 2500) step = 0;
    if (step !== -1 && step !== this._lastBeepStep) {
      this.audioManager?.playCountdownBeep(step);
      this._lastBeepStep = step;
    }
  }

  _recordInk(ghost) {
    const col = ghost.tier === 3 ? 0xff3355 : ghost.tier === 2 ? 0xff8c00 : 0xa855f7;
    this._inkMarks.push({ x: ghost.x, y: ghost.y, t: this._inkClock, col });
    if (this._inkMarks.length > 260) this._inkMarks.shift();
  }

  _drawInkTrail() {
    const g = this._inkGfx;
    g.clear();
    const fadeDur = CONFIG.GHOST_INK_FADE_MS;
    let drop = 0;
    while (drop < this._inkMarks.length && this._inkClock - this._inkMarks[drop].t > fadeDur) drop++;
    if (drop) this._inkMarks.splice(0, drop);
    for (const m of this._inkMarks) {
      g.fillStyle(m.col, (1 - (this._inkClock - m.t) / fadeDur) * 0.2);
      g.fillRect(m.x - 2.5, m.y - 2.5, 5, 5);
    }
  }

  update(timeWarpMultiplier = 1, delta = 16) {
    this._inkClock += delta;

    for (const g of [...this.ghosts]) {
      g.update(timeWarpMultiplier, delta);
      if (!g.alive) { this._remove(g); continue; }  // finished its expiry fade
      g._inkTimer += delta;
      if (g._inkTimer >= 100) { this._recordInk(g); g._inkTimer -= 100; }
    }

    this._drawInkTrail();
    if (this.active) this._updateBeeps();
  }

  getAllGhosts() { return [...this.ghosts]; }

  stop() {
    this.active = false;
    if (this._spawnTimer) { this._spawnTimer.remove(false); this._spawnTimer = null; }
  }
}
