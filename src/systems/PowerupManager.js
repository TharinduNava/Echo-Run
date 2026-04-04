import { CONFIG } from '../config/GameConfig.js';
import { Powerup }  from '../entities/Powerup.js';

export class PowerupManager {
  constructor(scene, audioManager, scoreSystem) {
    this.scene        = scene;
    this.audio        = audioManager;
    this.scoreSystem  = scoreSystem;
    this._current     = null;   // one powerup on arena at a time
    this._held        = null;   // 'clash' | 'phase' | null
    this._heldTimer   = null;
    this.active       = false;  // is powerup effect currently running

    this._scheduleNext();
  }

  _scheduleNext() {
    const delay = CONFIG.POWERUP_SPAWN_INTERVAL_MIN +
      Math.random() * (CONFIG.POWERUP_SPAWN_INTERVAL_MAX - CONFIG.POWERUP_SPAWN_INTERVAL_MIN);
    this.scene.time.delayedCall(delay, () => this._spawn());
  }

  _spawn() {
    // Clear old if still there
    if (this._current && this._current.alive) this._current.collect();

    const p    = CONFIG.ARENA_PADDING + 60;
    const W    = CONFIG.CANVAS_WIDTH  - p;
    const H    = CONFIG.CANVAS_HEIGHT - p;
    const x    = p + Math.random() * (W - p);
    const y    = p + Math.random() * (H - p);
    const type = Math.random() > 0.5 ? 'clash' : 'phase';

    this._current = new Powerup(this.scene, type, x, y);
    this._scheduleNext();
  }

  /** Call each frame. Returns true if player just picked something up. */
  update(playerX, playerY) {
    if (this._current && this._current.alive) {
      this._current.update();
      if (this._current.overlaps(playerX, playerY) && this._held === null) {
        this._pickup();
      }
    }
  }

  _pickup() {
    this._held = this._current.type;
    this._current.collect();
    this._current = null;
    this.audio.playPowerupPickup();
    this.scoreSystem.recordPowerupCollected();
  }

  /** Called when player presses E. Returns true if a powerup was activated. */
  activate(ghosts, onClashKill) {
    if (!this._held || this.active) return false;

    const type = this._held;
    this._held  = null;
    this.active = true;

    if (type === 'clash') {
      this.audio.playClashActivate();
      this._activateClash(ghosts, onClashKill);
    } else {
      this.audio.playPhaseActivate();
      this._activatePhase();
    }
    return true;
  }

  _activateClash(ghosts, onClashKill) {
    this._clashActive  = true;
    this._clashKillCb  = onClashKill;

    // Auto-expire after duration
    this._heldTimer = this.scene.time.delayedCall(CONFIG.POWERUP_CLASH_DURATION, () => {
      this._endClash(false);
    });
  }

  /** Call this from CollisionSystem when player hits a ghost during clash */
  tryClashKill(ghost) {
    if (!this._clashActive) return false;
    this._clashKillCb && this._clashKillCb(ghost);
    this.scoreSystem.recordClashKill();
    this.audio.playClashKill();
    this._endClash(true);
    return true;
  }

  _endClash(byKill) {
    this._clashActive = false;
    this.active       = false;
    if (!byKill) this.audio.playPowerupExpire();
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

  get heldType()     { return this._held; }
  get clashActive()  { return !!this._clashActive; }
  get phaseActive()  { return !!this._phaseActive; }

  /** Returns 0–1 progress of remaining powerup time (for HUD bar) */
  get activeProgress() {
    if (!this.active || !this._heldTimer) return 0;
    const dur = this._clashActive ? CONFIG.POWERUP_CLASH_DURATION : CONFIG.POWERUP_PHASE_DURATION;
    return Phaser.Math.Clamp(this._heldTimer.getRemaining() / dur, 0, 1);
  }

  stop() {
    if (this._heldTimer) this._heldTimer.remove();
    if (this._current)   this._current.destroy();
  }
}
