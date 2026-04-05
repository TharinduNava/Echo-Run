import { CONFIG } from '../config/GameConfig.js';

/**
 * ScoreSystem — tracks nerve multiplier, score zones, near-misses & run stats.
 */
export class ScoreSystem {
  constructor(scene) {
    this.scene = scene;

    // Nerve multiplier
    this.nerveMultiplier = 1.0;
    this._nerveBuilding  = false;

    // Near-miss combo chain
    this._comboCount     = 0;
    this._lastNearMissAt = 0;

    // Survival bonus multiplier (applied at each milestone)
    this._survivalBonus = 1.0;

    // Run stats
    this.stats = {
      nearMisses:       0,
      warpUses:         0,
      powerupsCollected:0,
      clashKills:       0,
      longestNerveStreak: 0,
      _currentNerveStreak: 0,
      scoreZoneTimeMs:  0,
      bestCombo:        0,
    };

    // Score zones
    this._zones      = [];
    this._zoneGfx    = scene.add.graphics().setDepth(5);
    this._createZones();

    // Peak multiplier flash state
    this._peakActive  = false;
    this._peakTimer   = 0;
  }

  _createZones() {
    const p  = CONFIG.ARENA_PADDING + CONFIG.SCORE_ZONE_RADIUS + 20;
    const W  = CONFIG.CANVAS_WIDTH  - p;
    const H  = CONFIG.CANVAS_HEIGHT - p;
    const r  = CONFIG.SCORE_ZONE_RADIUS;
    const zoneColors = [0xffdd00, 0x00ffcc, 0xff6600];
    const count = CONFIG.SCORE_ZONE_COUNT;

    for (let i = 0; i < count; i++) {
      this._zones.push({
        x: p + Math.random() * (W - p),
        y: p + Math.random() * (H - p),
        color: zoneColors[i % zoneColors.length],
        phase: Math.random() * Math.PI * 2,
        active: false,
        dwellTime: 0,  // ms spent inside this zone
      });
    }
  }

  /** Call every frame. Returns current score multiplier (nerve × zone × survival bonus). */
  update(playerX, playerY, ghosts, delta) {
    const now     = this.scene.time.now;
    const NERVE_D = CONFIG.NERVE_RAMP_DIST;
    const dt      = delta / 1000;

    // ── Nerve multiplier ──────────────────────────────────
    let minDist = Infinity;
    ghosts.forEach(g => {
      const d = Math.hypot(playerX - g.x, playerY - g.y);
      if (d < minDist) minDist = d;
    });

    if (ghosts.length > 0 && minDist < NERVE_D) {
      const rampRate = (1 - minDist / NERVE_D) * 0.8;
      this.nerveMultiplier = Math.min(CONFIG.NERVE_MAX_MULT, this.nerveMultiplier + rampRate * dt);
      this.stats._currentNerveStreak += dt;
      this.stats.longestNerveStreak = Math.max(this.stats.longestNerveStreak, this.stats._currentNerveStreak);
      this._nerveBuilding = true;
    } else {
      this.nerveMultiplier = Math.max(1.0, this.nerveMultiplier - 0.4 * dt);
      if (this._nerveBuilding && minDist >= NERVE_D) { this.stats._currentNerveStreak = 0; }
      this._nerveBuilding = false;
    }

    // ── Score zones ────────────────────────────────────────
    let inZone = false;
    this._zones.forEach(z => {
      const d = Math.hypot(playerX - z.x, playerY - z.y);
      z.active = d < CONFIG.SCORE_ZONE_RADIUS;
      if (z.active) {
        inZone = true;
        z.dwellTime += delta;
        this.stats.scoreZoneTimeMs += delta;
      }
    });

    // ── Peak multiplier: max nerve + in zone simultaneously ──
    const atMaxNerve = this.nerveMultiplier >= CONFIG.NERVE_MAX_MULT - 0.05;
    if (atMaxNerve && inZone) {
      this._peakActive = true;
      this._peakTimer  = now;
    } else if (now - this._peakTimer > 500) {
      this._peakActive = false;
    }

    // ── Draw zones ─────────────────────────────────────────
    this._drawZones(now);

    // Combined multiplier
    const zoneMult   = inZone ? CONFIG.SCORE_ZONE_MULT : 1.0;
    const peakMult   = this._peakActive ? 2.0 : 1.0;  // zone stacking bonus
    return this.nerveMultiplier * zoneMult * peakMult * this._survivalBonus;
  }

  _drawZones(now) {
    const g = this._zoneGfx;
    g.clear();
    const r  = CONFIG.SCORE_ZONE_RADIUS;
    this._zones.forEach(z => {
      const pulse  = 0.5 + 0.5 * Math.sin(now * 0.0015 + z.phase);
      // Dwell increases pulse intensity — harder the longer you stay
      const dwellFactor = Math.min(1, z.dwellTime / 5000);
      const baseA  = z.active ? (0.22 + dwellFactor * 0.15) : 0.10;
      const ringA  = z.active ? (0.65 + dwellFactor * 0.2) : 0.30;

      // Fill
      g.fillStyle(z.color, baseA + pulse * (0.08 + dwellFactor * 0.06));
      g.fillCircle(z.x, z.y, r);

      // Ring — pulses harder the longer you stay
      g.lineStyle(z.active ? 2 + dwellFactor * 2 : 2, z.color, ringA + pulse * 0.25);
      g.strokeCircle(z.x, z.y, r);

      // Active inner ring
      if (z.active) {
        g.lineStyle(4, z.color, 0.22 + pulse * 0.18 + dwellFactor * 0.15);
        g.strokeCircle(z.x, z.y, r + 5 + dwellFactor * 5);

        // Peak glow when at max nerve
        if (this._peakActive) {
          g.lineStyle(6, 0xffffff, 0.18 + pulse * 0.18);
          g.strokeCircle(z.x, z.y, r + 12 + pulse * 8);
        }
      }

      // Center dot
      g.fillStyle(z.color, 0.5 + pulse * 0.3);
      g.fillCircle(z.x, z.y, 4);
    });
  }

  /**
   * Record a near-miss. Returns combo count (1 = no combo, 2+ = chain).
   * Combos build when misses happen within NEAR_MISS_COMBO_WINDOW ms of each other.
   */
  recordNearMiss() {
    this.stats.nearMisses++;
    const now = this.scene.time.now;
    if (now - this._lastNearMissAt < CONFIG.NEAR_MISS_COMBO_WINDOW) {
      this._comboCount++;
    } else {
      this._comboCount = 1;
    }
    this._lastNearMissAt = now;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this._comboCount);
    return this._comboCount;
  }

  /** Apply 15% survival bonus at milestone crossings */
  applyMilestoneBonus() {
    this._survivalBonus = Math.min(this._survivalBonus * 1.15, 2.5);
    return this._survivalBonus;
  }

  get peakActive()    { return this._peakActive; }
  get comboCount()    { return this._comboCount; }

  recordWarpUse()          { this.stats.warpUses++; }
  recordPowerupCollected() { this.stats.powerupsCollected++; }
  recordClashKill()        { this.stats.clashKills++; }

  isPlayerInZone(px, py) {
    return this._zones.some(z => Math.hypot(px - z.x, py - z.y) < CONFIG.SCORE_ZONE_RADIUS);
  }

  destroy() { this._zoneGfx.destroy(); }
}
