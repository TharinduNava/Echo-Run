import { CONFIG } from '../config/GameConfig.js';
import { Powerup }  from '../entities/Powerup.js';

export class PowerupManager {
  constructor(scene, audioManager, scoreSystem) {
    this.scene        = scene;
    this.audio        = audioManager;
    this.scoreSystem  = scoreSystem;
    this._current     = null;
    this._held        = null;
    this._heldTimer   = null;
    this.active       = false;
    this._clashDurationOverride = null;

    // Decoy state
    this._decoyGfx    = null;
    this._decoyActive = false;

    // Clash chain tracking
    this._clashKillCount = 0;

    this._scheduleNext();
  }

  _scheduleNext() {
    const delay = CONFIG.POWERUP_SPAWN_INTERVAL_MIN +
      Math.random() * (CONFIG.POWERUP_SPAWN_INTERVAL_MAX - CONFIG.POWERUP_SPAWN_INTERVAL_MIN);

    // Ping warning 4s before spawn
    const pingDelay = Math.max(0, delay - 4000);
    this.scene.time.delayedCall(pingDelay, () => {
      if (this._current === null) this.audio.playPowerupPing();
    });

    this.scene.time.delayedCall(delay, () => this._spawn());
  }

  _spawn() {
    if (this._current && this._current.alive) this._current.collect();

    const p    = CONFIG.ARENA_PADDING + 60;
    const W    = CONFIG.CANVAS_WIDTH  - p;
    const H    = CONFIG.CANVAS_HEIGHT - p;
    const x    = p + Math.random() * (W - p);
    const y    = p + Math.random() * (H - p);

    // 40% clash, 40% phase, 20% decoy
    const roll = Math.random();
    const type = roll < 0.4 ? 'clash' : roll < 0.8 ? 'phase' : 'decoy';

    this._current = new Powerup(this.scene, type, x, y);
    this._scheduleNext();
  }

  update(playerX, playerY) {
    if (this._current && this._current.alive) {
      this._current.update();
      if (this._current.overlaps(playerX, playerY) && !this.active) {
        this._pickup();
      }
    }
    if (this._decoyActive && this._decoyGfx) {
      this._updateDecoyVisual();
    }
  }

  _pickup() {
    this._held = this._current.type;
    this._current.collect();
    this._current = null;
    this.audio.playPowerupPickup();
    this.scoreSystem.recordPowerupCollected();
  }

  activate(ghosts, onClashKill) {
    if (!this._held || this.active) return false;

    const type = this._held;
    this._held  = null;
    this.active = true;

    if (type === 'clash') {
      this.audio.playClashActivate();
      this._activateClash(ghosts, onClashKill);
    } else if (type === 'decoy') {
      this.audio.playDecoyDeploy();
      this._activateDecoy();
    } else {
      this.audio.playPhaseActivate();
      this._activatePhase();
    }
    return true;
  }

  setClashDurationOverride(ms) { this._clashDurationOverride = ms; }

  _activateClash(ghosts, onClashKill) {
    this._clashActive    = true;
    this._clashKillCount = 0;
    this._clashKillCb    = onClashKill;

    const clashDur = this._clashDurationOverride ?? CONFIG.POWERUP_CLASH_DURATION;
    this._heldTimer = this.scene.time.delayedCall(clashDur, () => {
      this._endClash(false);
    });
  }

  tryClashKill(ghost) {
    if (!this._clashActive) return false;
    this._clashKillCount++;
    this._clashKillCb && this._clashKillCb(ghost);
    this.scoreSystem.recordClashKill();
    this.audio.playClashKill();

    // Chain: don't end clash on first kill, let timer run so more kills possible
    // But if it's a first kill (old behaviour), end clash
    // New: clash persists for full duration — kills are additive, not terminating
    return true;
  }

  _endClash(byExpiry) {
    this._clashActive = false;
    this.active       = false;
    if (byExpiry) this.audio.playPowerupExpire();
    if (this._heldTimer) { this._heldTimer.remove(); this._heldTimer = null; }
  }

  _activatePhase() {
    this._phaseActive = true;
    this._heldTimer = this.scene.time.delayedCall(CONFIG.POWERUP_PHASE_DURATION, () => {
      this._endPhase();
    });
  }

  _endPhase() {
    this._phaseActive = false;
    this.active       = false;
    this.audio.playPhaseEnd();
    if (this._heldTimer) { this._heldTimer.remove(); this._heldTimer = null; }
  }

  /** DECOY: spawns a ghost-luring fake player at random arena position */
  _activateDecoy() {
    this._decoyActive = true;
    const p = CONFIG.ARENA_PADDING + 80;
    const W = CONFIG.CANVAS_WIDTH  - p;
    const H = CONFIG.CANVAS_HEIGHT - p;
    this._decoyX = p + Math.random() * (W - p);
    this._decoyY = p + Math.random() * (H - p);
    this._decoyPhase = 0;

    this._decoyGfx = this.scene.add.graphics().setDepth(19);

    this._heldTimer = this.scene.time.delayedCall(CONFIG.POWERUP_DECOY_DURATION, () => {
      this._endDecoy();
    });
  }

  _updateDecoyVisual() {
    if (!this._decoyGfx) return;
    this._decoyPhase += 0.08;
    const g    = this._decoyGfx;
    const pulse = 0.5 + 0.5 * Math.sin(this._decoyPhase);
    g.clear();

    // Fake player visual (green tint to distinguish)
    g.fillStyle(0x00ff88, 0.06 + pulse * 0.04);
    g.fillCircle(this._decoyX, this._decoyY, 100);
    g.fillStyle(0x00ff88, 0.12 + pulse * 0.08);
    g.fillCircle(this._decoyX, this._decoyY, 36);
    g.lineStyle(1.5, 0x00ff88, 0.5 + pulse * 0.35);
    g.strokeCircle(this._decoyX, this._decoyY, 18);
    g.fillStyle(0x00ff88, 1);
    g.fillCircle(this._decoyX, this._decoyY, CONFIG.PLAYER_RADIUS);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(this._decoyX - 3, this._decoyY - 3, 3.2);
    // "D" label
    g.lineStyle(1, 0x00ff88, 0.7);
    g.strokeCircle(this._decoyX, this._decoyY - 24, 7);
  }

  _endDecoy() {
    this._decoyActive = false;
    this.active       = false;
    this.audio.playDecoyExpire();
    if (this._decoyGfx) {
      this.scene.tweens.add({
        targets: this._decoyGfx, alpha: 0, duration: 400,
        onComplete: () => { this._decoyGfx && this._decoyGfx.destroy(); this._decoyGfx = null; }
      });
    }
    if (this._heldTimer) { this._heldTimer.remove(); this._heldTimer = null; }
  }

  /** Returns decoy position for collision system to use as alternate target */
  get decoyPosition() {
    if (!this._decoyActive) return null;
    return { x: this._decoyX, y: this._decoyY };
  }

  get heldType()     { return this._held; }
  get clashActive()  { return !!this._clashActive; }
  get phaseActive()  { return !!this._phaseActive; }
  get decoyActive()  { return !!this._decoyActive; }
  get clashKillCount() { return this._clashKillCount; }

  get activeProgress() {
    if (!this.active || !this._heldTimer) return 0;
    let dur = CONFIG.POWERUP_PHASE_DURATION;
    if (this._clashActive) dur = this._clashDurationOverride ?? CONFIG.POWERUP_CLASH_DURATION;
    if (this._decoyActive) dur = CONFIG.POWERUP_DECOY_DURATION;
    return Phaser.Math.Clamp(this._heldTimer.getRemaining() / dur, 0, 1);
  }

  /** Active type string for HUD */
  get activeType() {
    if (this._clashActive) return 'clash';
    if (this._phaseActive) return 'phase';
    if (this._decoyActive) return 'decoy';
    return false;
  }

  stop() {
    if (this._heldTimer) this._heldTimer.remove();
    if (this._current)   this._current.destroy();
    if (this._decoyGfx)  this._decoyGfx.destroy();
  }
}
