import { CONFIG } from '../config/GameConfig.js';

/**
 * ScoreSystem — accumulates points, tracks nerve multiplier, score zones, near-misses & run stats.
 * Points per second = SCORE_PER_SEC × nerve × zone × peak × milestone bonus × difficulty.
 */
export class ScoreSystem {
  constructor(scene, difficultyMult = 1) {
    this.scene = scene;
    this.score = 0;
    this._difficultyMult = difficultyMult;

    // Nerve multiplier
    this.nerveMultiplier = 1.0;
    this._nerveDecayMult = 1.0;

    // Near-miss combo chain (on gameplay clock)
    this._clock          = 0;
    this._comboCount     = 0;
    this._lastNearMissAt = -Infinity;

    this._survivalBonus = 1.0;
    this._zoneMult      = CONFIG.SCORE_ZONE_MULT;
    this._currentMult   = 1.0;

    this.stats = {
      nearMisses:        0,
      warpUses:          0,
      powerupsCollected: 0,
      clashKills:        0,
      peakNerve:         1.0,
      scoreZoneTimeMs:   0,
      bestCombo:         0,
    };

    this._zones   = [];
    this._zoneGfx = scene.add.graphics().setDepth(5);
    this._createZones();

    this._peakActive = false;
    this._peakHold   = 0;
  }

  _createZones() {
    // Keep zones clear of the HUD panels in the corners / top-centre / bottom
    const p  = CONFIG.ARENA_PADDING + CONFIG.SCORE_ZONE_RADIUS + 20;
    const W  = CONFIG.CANVAS_WIDTH  - p;
    const top = CONFIG.ARENA_PADDING + 62 + CONFIG.SCORE_ZONE_RADIUS;
    const bottom = CONFIG.CANVAS_HEIGHT - CONFIG.ARENA_PADDING - 62 - CONFIG.SCORE_ZONE_RADIUS;
    const cx = CONFIG.CANVAS_WIDTH / 2, cy = CONFIG.CANVAS_HEIGHT / 2;
    const zoneColors = [0xffdd00, 0x00ffcc, 0xff6600];

    for (let i = 0; i < CONFIG.SCORE_ZONE_COUNT; i++) {
      // Keep zones apart from each other and off the spawn point
      let x = 0, y = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = p + Math.random() * (W - p);
        y = top + Math.random() * (bottom - top);
        const clear = Math.hypot(x - cx, y - cy) > 120 &&
          this._zones.every(z => Math.hypot(x - z.x, y - z.y) > CONFIG.SCORE_ZONE_RADIUS * 4);
        if (clear) break;
      }
      this._zones.push({
        x, y,
        color: zoneColors[i % zoneColors.length],
        phase: Math.random() * Math.PI * 2,
        active: false,
        dwellTime: 0,
      });
    }
  }

  // ── Buff hooks ────────────────────────────────────────────
  setNerveDecayMult(m) { this._nerveDecayMult = m; }
  setZoneMult(m)       { this._zoneMult = m; }

  /** Call every PLAYING frame. Returns current score multiplier. */
  update(playerX, playerY, ghosts, delta) {
    const dt = delta / 1000;
    this._clock += delta;
    const NERVE_D = CONFIG.NERVE_RAMP_DIST;

    // ── Nerve multiplier ──────────────────────────────────
    let minDist = Infinity;
    for (const g of ghosts) {
      if (!g.harmful) continue;
      const d = Math.hypot(playerX - g.x, playerY - g.y);
      if (d < minDist) minDist = d;
    }

    if (minDist < NERVE_D) {
      const rampRate = (1 - minDist / NERVE_D) * 0.8;
      this.nerveMultiplier = Math.min(CONFIG.NERVE_MAX_MULT, this.nerveMultiplier + rampRate * dt);
    } else {
      this.nerveMultiplier = Math.max(1.0, this.nerveMultiplier - CONFIG.NERVE_DECAY_RATE * this._nerveDecayMult * dt);
    }
    this.stats.peakNerve = Math.max(this.stats.peakNerve, this.nerveMultiplier);

    // ── Score zones ────────────────────────────────────────
    let inZone = false;
    for (const z of this._zones) {
      z.active = Math.hypot(playerX - z.x, playerY - z.y) < CONFIG.SCORE_ZONE_RADIUS;
      if (z.active) {
        inZone = true;
        z.dwellTime += delta;
        this.stats.scoreZoneTimeMs += delta;
      }
    }

    // ── Peak multiplier: max nerve + in zone simultaneously (held 0.5s) ──
    const atMaxNerve = this.nerveMultiplier >= CONFIG.NERVE_MAX_MULT - 0.05;
    if (atMaxNerve && inZone) { this._peakActive = true; this._peakHold = 500; }
    else if ((this._peakHold -= delta) <= 0) this._peakActive = false;

    this._drawZones();

    const zoneMult = inZone ? this._zoneMult : 1.0;
    const peakMult = this._peakActive ? 2.0 : 1.0;
    this._currentMult = this.nerveMultiplier * zoneMult * peakMult * this._survivalBonus * this._difficultyMult;
    this.score += CONFIG.SCORE_PER_SEC * this._currentMult * dt;
    return this._currentMult;
  }

  _drawZones() {
    const g = this._zoneGfx;
    g.clear();
    const r = CONFIG.SCORE_ZONE_RADIUS;
    const now = this._clock;
    for (const z of this._zones) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.0015 + z.phase);
      const dwellFactor = Math.min(1, z.dwellTime / 5000);
      const baseA = z.active ? (0.22 + dwellFactor * 0.15) : 0.10;
      const ringA = z.active ? (0.65 + dwellFactor * 0.2) : 0.30;

      g.fillStyle(z.color, baseA + pulse * (0.08 + dwellFactor * 0.06));
      g.fillCircle(z.x, z.y, r);
      g.lineStyle(z.active ? 2 + dwellFactor * 2 : 2, z.color, ringA + pulse * 0.25);
      g.strokeCircle(z.x, z.y, r);

      if (z.active) {
        g.lineStyle(4, z.color, 0.22 + pulse * 0.18 + dwellFactor * 0.15);
        g.strokeCircle(z.x, z.y, r + 5 + dwellFactor * 5);
        if (this._peakActive) {
          g.lineStyle(6, 0xffffff, 0.18 + pulse * 0.18);
          g.strokeCircle(z.x, z.y, r + 12 + pulse * 8);
        }
      }

      g.fillStyle(z.color, 0.5 + pulse * 0.3);
      g.fillCircle(z.x, z.y, 4);
    }
  }

  addPoints(n) {
    const pts = Math.round(n * this._difficultyMult);
    this.score += pts;
    return pts;
  }

  /** Record a near-miss. Returns combo count (1 = single, 2+ = chain). */
  recordNearMiss() {
    this.stats.nearMisses++;
    if (this._clock - this._lastNearMissAt < CONFIG.NEAR_MISS_COMBO_WINDOW) this._comboCount++;
    else this._comboCount = 1;
    this._lastNearMissAt = this._clock;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this._comboCount);
    this.addPoints(CONFIG.NEAR_MISS_POINTS * this._comboCount);
    return this._comboCount;
  }

  /** +15% permanent multiplier per milestone (capped) plus a flat bonus. */
  applyMilestoneBonus() {
    this._survivalBonus = Math.min(this._survivalBonus * 1.15, 2.5);
    return this.addPoints(CONFIG.MILESTONE_POINTS);
  }

  get peakActive()  { return this._peakActive; }
  get comboCount()  { return this._comboCount; }
  get multiplier()  { return this._currentMult; }

  recordWarpUse()          { this.stats.warpUses++; }
  recordPowerupCollected() { this.stats.powerupsCollected++; }
  recordClashKill()        { this.stats.clashKills++; return this.addPoints(CONFIG.CLASH_KILL_POINTS); }

  destroy() { this._zoneGfx.destroy(); }
}
