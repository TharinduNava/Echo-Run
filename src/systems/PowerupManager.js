import Phaser from 'phaser';
import { CONFIG } from '../config/GameConfig.js';
import { Powerup } from '../entities/Powerup.js';

/**
 * Spawns pickups, holds one in reserve, and runs the active effect.
 * Clash: echoes touched are destroyed. Phase: pass through echoes. Decoy: echoes are lured away.
 */
export class PowerupManager {
  constructor(scene, audioManager, scoreSystem) {
    this.scene       = scene;
    this.audio       = audioManager;
    this.scoreSystem = scoreSystem;

    this._current    = null;   // pickup on the floor
    this._held       = null;   // type in reserve
    this._activeType = null;   // effect running
    this._activeTimer    = null;
    this._activeDuration = 0;
    this._stopped    = false;

    this._px = CONFIG.CANVAS_WIDTH / 2;
    this._py = CONFIG.CANVAS_HEIGHT / 2;

    // Buff modifiers
    this._clashBonusMs = 0;
    this._phaseBonusMs = 0;
    this._pickupRadius = CONFIG.POWERUP_PICKUP_RADIUS;

    this._decoyGfx = null;
    this._decoyPhase = 0;
    this._clashKillCount = 0;

    this._spawnTimer = null;
    this._pingTimer  = null;
    this._scheduleNext(CONFIG.POWERUP_FIRST_SPAWN_MS);
  }

  // ── Buff hooks ────────────────────────────────────────────
  addClashBonus(ms) { this._clashBonusMs += ms; }
  addPhaseBonus(ms) { this._phaseBonusMs += ms; }
  enableMagnet()    { this._pickupRadius = CONFIG.POWERUP_MAGNET_RADIUS; }

  _durationFor(type) {
    if (type === 'clash') return CONFIG.POWERUP_CLASH_DURATION + this._clashBonusMs;
    if (type === 'phase') return CONFIG.POWERUP_PHASE_DURATION + this._phaseBonusMs;
    return CONFIG.POWERUP_DECOY_DURATION;
  }

  // ── Spawning ──────────────────────────────────────────────
  _scheduleNext(delay) {
    if (this._stopped) return;
    if (delay == null) {
      delay = CONFIG.POWERUP_SPAWN_INTERVAL_MIN +
        Math.random() * (CONFIG.POWERUP_SPAWN_INTERVAL_MAX - CONFIG.POWERUP_SPAWN_INTERVAL_MIN);
    }
    this._pingTimer = this.scene.time.delayedCall(Math.max(0, delay - 4000), () => {
      if (!this._current?.alive) this.audio.playPowerupPing();
    });
    this._spawnTimer = this.scene.time.delayedCall(delay, () => this._spawn());
  }

  _randomPoint(margin, awayFrom, minDist) {
    const minX = CONFIG.ARENA_PADDING + margin, maxX = CONFIG.CANVAS_WIDTH  - CONFIG.ARENA_PADDING - margin;
    // Vertical margin keeps pickups (and their labels) clear of the HUD panels
    const vm = Math.max(margin, 100);
    const minY = CONFIG.ARENA_PADDING + vm, maxY = CONFIG.CANVAS_HEIGHT - CONFIG.ARENA_PADDING - vm;
    let best = null, bestD = -1;
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(minX, maxX), y = Phaser.Math.Between(minY, maxY);
      const d = Math.hypot(x - awayFrom.x, y - awayFrom.y);
      if (d >= minDist) return { x, y };
      if (d > bestD) { best = { x, y }; bestD = d; }
    }
    return best;
  }

  _spawn() {
    if (this._stopped) return;
    if (this._current?.alive) this._current._fadeOut();

    const { x, y } = this._randomPoint(60, { x: this._px, y: this._py }, CONFIG.POWERUP_MIN_PLAYER_DIST);
    const roll = Math.random();
    const type = roll < 0.4 ? 'clash' : roll < 0.75 ? 'phase' : 'decoy';

    this._current = new Powerup(this.scene, type, x, y);
    this._scheduleNext();
  }

  update(playerX, playerY) {
    this._px = playerX; this._py = playerY;
    if (this._current) {
      if (!this._current.alive) {
        this._current = null;
      } else {
        this._current.update();
        if (this._current.overlaps(playerX, playerY, this._pickupRadius)) this._pickup();
      }
    }
    if (this._activeType === 'decoy') this._updateDecoyVisual();
  }

  _pickup() {
    this._held = this._current.type;   // a new pickup replaces whatever was in reserve
    this._current.collect();
    this._current = null;
    this.audio.playPowerupPickup();
    this.scoreSystem.recordPowerupCollected();
  }

  // ── Activation ────────────────────────────────────────────
  /** Returns the activated type, or null if nothing could be activated. */
  activate() {
    if (!this._held || this._activeType) return null;
    const type = this._held;
    this._held = null;
    this._activeType = type;
    this._activeDuration = this._durationFor(type);

    if (type === 'clash') {
      this._clashKillCount = 0;
      this.audio.playClashActivate();
    } else if (type === 'decoy') {
      this.audio.playDecoyDeploy();
      this._startDecoy();
    } else {
      this.audio.playPhaseActivate();
    }

    this._activeTimer = this.scene.time.delayedCall(this._activeDuration, () => this._end());
    return type;
  }

  /** Register an echo destroyed by Clash; returns chain count. */
  registerClashKill() {
    this._clashKillCount++;
    this.scoreSystem.recordClashKill();
    this.audio.playClashKill();
    return this._clashKillCount;
  }

  _end(silent = false) {
    const type = this._activeType;
    this._activeType = null;
    if (this._activeTimer) { this._activeTimer.remove(false); this._activeTimer = null; }
    if (type === 'phase' && !silent) this.audio.playPhaseEnd();
    if (type === 'clash' && !silent) this.audio.playPowerupExpire();
    if (type === 'decoy') this._endDecoy(silent);
  }

  // ── Decoy ─────────────────────────────────────────────────
  _startDecoy() {
    // Place the decoy well away from the player so lured echoes are pulled off them
    const pos = this._randomPoint(80, { x: this._px, y: this._py }, 260);
    this._decoyX = pos.x;
    this._decoyY = pos.y;
    this._decoyPhase = 0;
    this._decoyGfx = this.scene.add.graphics().setDepth(19);

    // Deploy streak from player to decoy
    const streak = this.scene.add.graphics().setDepth(19);
    streak.lineStyle(2, 0x00ff88, 0.7);
    streak.beginPath(); streak.moveTo(this._px, this._py); streak.lineTo(this._decoyX, this._decoyY); streak.strokePath();
    this.scene.tweens.add({ targets: streak, alpha: 0, duration: 400, onComplete: () => streak.destroy() });
  }

  _updateDecoyVisual() {
    if (!this._decoyGfx) return;
    this._decoyPhase += 0.08;
    const g = this._decoyGfx, x = this._decoyX, y = this._decoyY;
    const pulse = 0.5 + 0.5 * Math.sin(this._decoyPhase);
    g.clear();
    g.fillStyle(0x00ff88, 0.06 + pulse * 0.04); g.fillCircle(x, y, 100);
    g.fillStyle(0x00ff88, 0.12 + pulse * 0.08); g.fillCircle(x, y, 36);
    g.lineStyle(1.5, 0x00ff88, 0.5 + pulse * 0.35); g.strokeCircle(x, y, 18);
    // Expanding "signal" rings
    const r = (this._decoyPhase * 30) % 90;
    g.lineStyle(1, 0x00ff88, 0.5 * (1 - r / 90)); g.strokeCircle(x, y, 20 + r);
    g.fillStyle(0x00ff88, 1);     g.fillCircle(x, y, CONFIG.PLAYER_RADIUS);
    g.fillStyle(0xffffff, 0.9);   g.fillCircle(x - 3, y - 3, 3.2);
  }

  _endDecoy(silent) {
    if (!silent) this.audio.playDecoyExpire();
    const gfx = this._decoyGfx;
    this._decoyGfx = null;
    if (gfx) this.scene.tweens.add({ targets: gfx, alpha: 0, duration: 400, onComplete: () => gfx.destroy() });
  }

  // ── State for other systems / HUD ─────────────────────────
  get decoyPosition()  { return this._activeType === 'decoy' ? { x: this._decoyX, y: this._decoyY } : null; }
  get heldType()       { return this._held; }
  get activeType()     { return this._activeType; }
  get clashActive()    { return this._activeType === 'clash'; }
  get phaseActive()    { return this._activeType === 'phase'; }
  get decoyActive()    { return this._activeType === 'decoy'; }
  get clashKillCount() { return this._clashKillCount; }
  get activeRemaining() { return this._activeTimer ? this._activeTimer.getRemaining() : 0; }

  get activeProgress() {
    if (!this._activeTimer || !this._activeDuration) return 0;
    return Phaser.Math.Clamp(this._activeTimer.getRemaining() / this._activeDuration, 0, 1);
  }

  stop() {
    this._stopped = true;
    this._spawnTimer?.remove(false);
    this._pingTimer?.remove(false);
    if (this._activeType) this._end(true);
    if (this._current) { this._current.destroy(); this._current = null; }
  }
}
