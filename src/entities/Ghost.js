import { CONFIG } from '../config/GameConfig.js';

/**
 * Ghost uses the LIVE recorder buffer (not a snapshot).
 * It is always exactly `behindMs` milliseconds behind the current recording.
 * Tier and drift are assigned by GhostManager after construction.
 */
export class Ghost {
  constructor(scene, recorder, behindMs) {
    this.scene    = scene;
    this.recorder = recorder;
    this._behindMs = behindMs;
    this.pathIndex = 0;
    this.alive     = true;
    this.alpha     = 0;
    this._dangerIntensity = 0;
    this.trailHistory = [];
    this._pulseAngle  = Math.random() * Math.PI * 2;
    this._eyeFlicker  = 0;
    this._warpSlowed  = false;
    this.radius = CONFIG.GHOST_RADIUS;

    // Tier: 1 = normal, 2 = faster/orange, 3 = fastest/red
    this.tier = 1;
    this._speedMult = 1.0;

    // Drift: smooth random offset from exact path for unpredictability
    this._driftX = 0;
    this._driftY = 0;
    this._driftTargetX = 0;
    this._driftTargetY = 0;
    this._driftTimer = 0;
    this._inkTimer   = 0;
    this._expired    = false;

    // Aging: how long this ghost has been alive (drives visual intensity)
    this._age = 0;

    // Spawn time for ink trail
    this.spawnTime = scene.time.now;

    const buf = recorder.buffer;
    if (!buf || buf.length < 2) { this.alive = false; return; }

    const currentRecT = buf[buf.length - 1].t;
    this._pathT = Math.max(buf[0].t, currentRecT - behindMs);

    while (this.pathIndex < buf.length - 1 && buf[this.pathIndex + 1].t <= this._pathT) {
      this.pathIndex++;
    }

    this.x = buf[this.pathIndex].x;
    this.y = buf[this.pathIndex].y;

    this.graphics = scene.add.graphics().setDepth(18);

    scene.tweens.add({ targets: this, alpha: CONFIG.GHOST_ALPHA, duration: CONFIG.GHOST_FADE_IN_MS, ease: 'Sine.easeOut' });
    this._doSpawnPulse();
  }

  _doSpawnPulse() {
    const pulse = this.scene.add.graphics().setDepth(17);
    const col = this._getTierColor();
    pulse.lineStyle(2, col, 0.9);
    pulse.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS);
    this.scene.tweens.add({
      targets: pulse, scaleX: 5, scaleY: 5, alpha: 0,
      duration: 600, ease: 'Power2.Out', onComplete: () => pulse.destroy()
    });
  }

  _getTierColor() {
    if (this.tier === 3) return 0xff3355;
    if (this.tier === 2) return 0xff8c00;
    return CONFIG.GHOST_COLOR;
  }

  _updateDrift(delta) {
    this._driftTimer -= delta;
    if (this._driftTimer <= 0) {
      // Pick a new drift target every 1.5–3s
      const amt = CONFIG.GHOST_DRIFT_AMOUNT;
      this._driftTargetX = (Math.random() - 0.5) * 2 * amt;
      this._driftTargetY = (Math.random() - 0.5) * 2 * amt;
      this._driftTimer = 1500 + Math.random() * 1500;
    }
    // Smooth lerp toward drift target
    const lerpRate = 0.003 * delta;
    this._driftX += (this._driftTargetX - this._driftX) * lerpRate;
    this._driftY += (this._driftTargetY - this._driftY) * lerpRate;
  }

  update(timeWarpMultiplier = 1, delta = 16) {
    if (!this.alive) return;

    const buf = this.recorder.buffer;
    if (!buf || buf.length < 2) return;

    this._warpSlowed  = timeWarpMultiplier < 0.5;
    this._pulseAngle += 0.05;
    this._eyeFlicker += (Math.random() - this._eyeFlicker) * 0.12;
    this._age        += delta;

    if (!this._expired && this._age > CONFIG.GHOST_MAX_AGE_MS) {
      this._expired = true;
      this.scene.tweens.add({
        targets: this, alpha: 0, duration: 1200, ease: 'Power2',
        onComplete: () => { this.alive = false; }
      });
    }

    this._updateDrift(delta);

    const safeDelta = Math.min(delta, 33);
    // Speed multiplier from tier, but warp overrides
    this._pathT += safeDelta * timeWarpMultiplier * this._speedMult;

    const maxRecT = buf[buf.length - 1].t;
    const minRecT = buf[0].t;
    if (this._pathT > maxRecT) this._pathT = maxRecT;
    if (this._pathT < minRecT) this._pathT = minRecT;

    if (this.pathIndex >= buf.length || buf[this.pathIndex].t > this._pathT) {
      this.pathIndex = 0;
    }

    while (this.pathIndex < buf.length - 1 && buf[this.pathIndex + 1].t <= this._pathT) {
      this.pathIndex++;
    }

    const curr  = buf[this.pathIndex];
    const next  = buf[Math.min(this.pathIndex + 1, buf.length - 1)];
    const span  = next.t - curr.t;
    const lerpT = span > 0 ? Phaser.Math.Clamp((this._pathT - curr.t) / span, 0, 1) : 0;

    // Apply drift offset — scales to zero near player to prevent unfair hits
    const driftScale = 1 - this._dangerIntensity * 0.85;
    this.x = Phaser.Math.Linear(curr.x, next.x, lerpT) + this._driftX * driftScale;
    this.y = Phaser.Math.Linear(curr.y, next.y, lerpT) + this._driftY * driftScale;

    // Clamp within arena
    const pad = CONFIG.ARENA_PADDING + this.radius;
    this.x = Phaser.Math.Clamp(this.x, pad, CONFIG.CANVAS_WIDTH  - pad);
    this.y = Phaser.Math.Clamp(this.y, pad, CONFIG.CANVAS_HEIGHT - pad);

    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) this.trailHistory.shift();

    this.draw();
  }

  draw() {
    this.graphics.clear();
    const g      = this.graphics;
    const danger = this._dangerIntensity || 0;
    const pulse  = 0.5 + 0.5 * Math.sin(this._pulseAngle);

    // Aging factor: ghosts that have lived longer glow more intensely
    const ageFactor = Math.min(1, this._age / 20000);

    // Tier-based color
    const col = this._getTierColor();

    // Trail — longer and brighter for higher tiers
    const tMult = this._warpSlowed ? 2.0 : 1;
    const trailBrightness = 1 + ageFactor * 0.5 + (this.tier - 1) * 0.3;
    this.trailHistory.forEach((pt, i) => {
      const prog = (i + 1) / this.trailHistory.length;
      g.fillStyle(col, Math.min(Math.pow(prog, 1.2) * 0.4 * this.alpha * tMult * trailBrightness, 0.85));
      g.fillCircle(pt.x, pt.y, this.radius * 0.8 * prog * tMult);
    });

    // 3D drop shadow
    g.fillStyle(0x220033, this.alpha * 0.38);
    g.fillEllipse(this.x + 3, this.y + 14, 26, 8);

    // Chromatic aberration — more intense for higher tiers
    const ca = 2.5 + danger * 3.5 + (this.tier - 1) * 1.5;
    g.fillStyle(0xff0055, this.alpha * 0.12); g.fillCircle(this.x - ca, this.y, this.radius * 0.95);
    g.fillStyle(0x00ccff, this.alpha * 0.12); g.fillCircle(this.x + ca, this.y, this.radius * 0.95);

    // Far glow — brighter with age and tier
    const glowMult = 1 + ageFactor * 0.8 + (this.tier - 1) * 0.5;
    g.fillStyle(col, this.alpha * (0.035 + danger * 0.05) * glowMult + pulse * 0.015);
    g.fillCircle(this.x, this.y, 65 + danger * 35 + ageFactor * 20);

    // Mid glow
    g.fillStyle(col, this.alpha * (0.18 + danger * 0.42) * glowMult);
    g.fillCircle(this.x, this.y, this.radius * 3.0 + danger * 8 + pulse * 2.5 + ageFactor * 4);

    // Tier 2/3: outer energy ring
    if (this.tier >= 2) {
      const ringCol = this.tier === 3 ? 0xff3355 : 0xff8c00;
      g.lineStyle(1.5, ringCol, 0.4 + pulse * 0.3);
      g.strokeCircle(this.x, this.y, this.radius * 2.2 + pulse * 2);
    }

    // Core (3D sphere)
    g.fillStyle(col, this.alpha);
    g.fillCircle(this.x, this.y, this.radius);
    g.fillStyle(0x220033, this.alpha * 0.5);
    g.fillCircle(this.x + 2.5, this.y + 2.5, this.radius * 0.75);
    g.fillStyle(0xffffff, this.alpha * 0.3);
    g.fillCircle(this.x - 2.5, this.y - 2.5, this.radius * 0.35);

    // Void eye
    const eyeA = this.alpha * (0.4 + (danger > 0.3 ? this._eyeFlicker * 0.5 : 0));
    const eyeC = danger > 0.5 ? 0xff0000 : (this.tier >= 2 ? col : 0xffffff);
    g.lineStyle(1, eyeC, eyeA * 0.8); g.strokeCircle(this.x, this.y, this.radius * 0.52);
    g.fillStyle(eyeC, eyeA);           g.fillCircle(this.x, this.y, this.radius * 0.2);

    // Warp shimmer
    if (this._warpSlowed) {
      g.fillStyle(0x001888, 0.2);   g.fillCircle(this.x, this.y, this.radius * 2.4);
      g.lineStyle(1.5, 0x0066ff, 0.55); g.strokeCircle(this.x, this.y, this.radius * 1.7);
    }
  }

  setDangerIntensity(d) { this._dangerIntensity = Phaser.Math.Clamp(d, 0, 1); }

  flashDanger() {
    const orig = this.alpha; this.alpha = 1; this._dangerIntensity = 1;
    this.scene.time.delayedCall(120, () => { this.alpha = orig; this._dangerIntensity = 0; });
  }

  destroy() { if (this.graphics) this.graphics.destroy(); }
}
