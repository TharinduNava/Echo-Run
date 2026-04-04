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

    // Run stats
    this.stats = {
      nearMisses:       0,
      warpUses:         0,
      powerupsCollected:0,
      clashKills:       0,
      longestNerveStreak: 0,  // seconds
      _currentNerveStreak: 0,
      scoreZoneTimeMs:  0,
    };

    // Score zones (created once)
    this._zones      = [];
    this._zoneGfx    = scene.add.graphics().setDepth(5);
    this._createZones();
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
        active: false,   // is player inside?
      });
    }
  }

  /** Call every frame. Returns current score multiplier (nerve × zone). */
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
      // Build nerve — closer = faster ramp
      const rampRate = (1 - minDist / NERVE_D) * 0.8;
      this.nerveMultiplier = Math.min(CONFIG.NERVE_MAX_MULT, this.nerveMultiplier + rampRate * dt);
      this.stats._currentNerveStreak += dt;
      this.stats.longestNerveStreak = Math.max(this.stats.longestNerveStreak, this.stats._currentNerveStreak);
      this._nerveBuilding = true;
    } else {
      // Decay nerve slowly when not near
      this.nerveMultiplier = Math.max(1.0, this.nerveMultiplier - 0.4 * dt);
      if (this._nerveBuilding && minDist >= NERVE_D) { this.stats._currentNerveStreak = 0; }
      this._nerveBuilding = false;
    }

    // ── Score zones ────────────────────────────────────────
    let inZone = false;
    this._zones.forEach(z => {
      const d = Math.hypot(playerX - z.x, playerY - z.y);
      z.active = d < CONFIG.SCORE_ZONE_RADIUS;
      if (z.active) inZone = true;
    });
    if (inZone) this.stats.scoreZoneTimeMs += delta;

    // ── Draw zones ─────────────────────────────────────────
    this._drawZones(now);

    // Return combined multiplier
    const zoneMult = inZone ? CONFIG.SCORE_ZONE_MULT : 1.0;
    return this.nerveMultiplier * zoneMult;
  }

  _drawZones(now) {
    const g = this._zoneGfx;
    g.clear();
    const r  = CONFIG.SCORE_ZONE_RADIUS;
    this._zones.forEach(z => {
      const pulse  = 0.5 + 0.5 * Math.sin(now * 0.0015 + z.phase);
      const baseA  = z.active ? 0.22 : 0.10;
      const ringA  = z.active ? 0.65 : 0.30;

      // Fill
      g.fillStyle(z.color, baseA + pulse * 0.08);
      g.fillCircle(z.x, z.y, r);

      // Ring
      g.lineStyle(2, z.color, ringA + pulse * 0.25);
      g.strokeCircle(z.x, z.y, r);

      // Inner ring (active glow)
      if (z.active) {
        g.lineStyle(4, z.color, 0.22 + pulse * 0.18);
        g.strokeCircle(z.x, z.y, r + 5);
      }

      // Label
      g.fillStyle(z.color, 0.5 + pulse * 0.3);
      g.fillCircle(z.x, z.y, 4);
    });
  }

  recordNearMiss()        { this.stats.nearMisses++;        }
  recordWarpUse()         { this.stats.warpUses++;          }
  recordPowerupCollected(){ this.stats.powerupsCollected++; }
  recordClashKill()       { this.stats.clashKills++;        }

  isPlayerInZone(px, py) {
    return this._zones.some(z => Math.hypot(px - z.x, py - z.y) < CONFIG.SCORE_ZONE_RADIUS);
  }

  destroy() { this._zoneGfx.destroy(); }
}
