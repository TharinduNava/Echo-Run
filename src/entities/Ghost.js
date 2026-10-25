import Phaser from 'phaser';
import { CONFIG } from '../config/GameConfig.js';
import { frameIndexAt } from '../systems/Recorder.js';

/**
 * Ghost uses the LIVE recorder buffer (not a snapshot).
 * It starts `behindMs` milliseconds behind the current recording and replays forward.
 * Tier, speed and slot are assigned by GhostManager after construction.
 */
export class Ghost {
  constructor(scene, recorder, behindMs) {
    this.scene    = scene;
    this.recorder = recorder;
    this.alive    = true;
    this.alpha    = 0;
    this.radius   = CONFIG.GHOST_RADIUS;
    this.trailHistory = [];
    this._dangerIntensity = 0;
    this._pulseAngle  = Math.random() * Math.PI * 2;
    this._eyeFlicker  = 0;
    this._warpSlowed  = false;

    // Tier: 1 = normal, 2 = faster/orange, 3 = fastest/red
    this.tier = 1;
    this._speedMult = 1.0;
    this.slot = -1;

    // Drift: smooth random offset from exact path for unpredictability
    this._driftX = 0; this._driftY = 0;
    this._driftTargetX = 0; this._driftTargetY = 0;
    this._driftTimer = 0;
    this._inkTimer   = 0;

    // Decoy lure: blend weight toward a lure point
    this._lureW = 0;
    this._lureX = 0; this._lureY = 0;
    this._lureTarget = null;

    this._age       = 0;
    this._graceLeft = CONFIG.GHOST_GRACE_MS;
    this._expired   = false;

    const buf = recorder.buffer;
    if (!buf || buf.length < 2) { this.alive = false; return; }

    const currentRecT = buf[buf.length - 1].t;
    this._pathT = Math.max(buf[0].t, currentRecT - behindMs);
    const f = buf[frameIndexAt(buf, this._pathT)];
    this.x = f.x;
    this.y = f.y;

    this.graphics = scene.add.graphics().setDepth(18);
    // Soft glows are textured sprites — much cheaper than large tessellated circles
    this._glowFar = scene.add.image(this.x, this.y, 'glow').setDepth(17).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this._glowMid = scene.add.image(this.x, this.y, 'glow').setDepth(17).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  }

  /** Called by GhostManager once tier is known so the pulse uses the right color. */
  playSpawnPulse() {
    const pulse = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(17);
    pulse.lineStyle(2, this._getTierColor(), 0.9);
    pulse.strokeCircle(0, 0, CONFIG.GHOST_RADIUS);
    this.scene.tweens.add({
      targets: pulse, scaleX: 5, scaleY: 5, alpha: 0,
      duration: 600, ease: 'Power2.Out', onComplete: () => pulse.destroy()
    });
  }

  /** Can this echo kill the player right now? */
  get harmful() { return this.alive && !this._expired && this._graceLeft <= 0; }

  _getTierColor() {
    if (this.tier === 3) return 0xff3355;
    if (this.tier === 2) return 0xff8c00;
    return CONFIG.GHOST_COLOR;
  }

  _updateDrift(delta) {
    this._driftTimer -= delta;
    if (this._driftTimer <= 0) {
      const amt = CONFIG.GHOST_DRIFT_AMOUNT;
      this._driftTargetX = (Math.random() - 0.5) * 2 * amt;
      this._driftTargetY = (Math.random() - 0.5) * 2 * amt;
      this._driftTimer = 1500 + Math.random() * 1500;
    }
    const lerpRate = Math.min(1, 0.003 * delta);
    this._driftX += (this._driftTargetX - this._driftX) * lerpRate;
    this._driftY += (this._driftTargetY - this._driftY) * lerpRate;
  }

  setLure(pos) { this._lureTarget = pos; }

  update(timeWarpMultiplier = 1, delta = 16) {
    if (!this.alive) return;

    const buf = this.recorder.buffer;
    if (!buf || buf.length < 2) return;

    this._warpSlowed  = timeWarpMultiplier < 0.5;
    this._pulseAngle += 0.003 * delta;
    this._eyeFlicker += (Math.random() - this._eyeFlicker) * 0.12;
    this._age        += delta;
    this._graceLeft  -= delta;

    // Fade in / expire on the gameplay clock (tweens run on wall time and ignore pauses)
    if (this._age > CONFIG.GHOST_MAX_AGE_MS) {
      this._expired = true;
      const k = (this._age - CONFIG.GHOST_MAX_AGE_MS) / CONFIG.GHOST_EXPIRE_FADE_MS;
      this.alpha = CONFIG.GHOST_ALPHA * Math.max(0, 1 - k) ** 2;
      if (k >= 1) { this.alive = false; return; }
    } else {
      const k = Math.min(1, this._age / CONFIG.GHOST_FADE_IN_MS);
      this.alpha = CONFIG.GHOST_ALPHA * Math.sin(k * Math.PI / 2);
    }

    this._updateDrift(delta);

    this._pathT += delta * timeWarpMultiplier * this._speedMult;
    const minRecT = buf[0].t;
    const maxRecT = Math.max(minRecT, buf[buf.length - 1].t - CONFIG.GHOST_MIN_BEHIND_MS);
    this._pathT = Phaser.Math.Clamp(this._pathT, minRecT, maxRecT);

    const idx   = frameIndexAt(buf, this._pathT);
    const curr  = buf[idx];
    const next  = buf[Math.min(idx + 1, buf.length - 1)];
    const span  = next.t - curr.t;
    const lerpT = span > 0 ? Phaser.Math.Clamp((this._pathT - curr.t) / span, 0, 1) : 0;

    // Drift scales to zero near the player to prevent unfair hits
    const driftScale = 1 - this._dangerIntensity * 0.85;
    let x = Phaser.Math.Linear(curr.x, next.x, lerpT) + this._driftX * driftScale;
    let y = Phaser.Math.Linear(curr.y, next.y, lerpT) + this._driftY * driftScale;

    // Decoy lure — ease toward the lure point while active, ease back afterwards
    const targetW = this._lureTarget ? CONFIG.DECOY_LURE_WEIGHT : 0;
    if (this._lureTarget) { this._lureX = this._lureTarget.x; this._lureY = this._lureTarget.y; }
    this._lureW += (targetW - this._lureW) * Math.min(1, delta * 0.0025);
    if (this._lureW > 0.001) {
      x = Phaser.Math.Linear(x, this._lureX, this._lureW);
      y = Phaser.Math.Linear(y, this._lureY, this._lureW);
    }

    const pad = CONFIG.ARENA_PADDING + this.radius;
    this.x = Phaser.Math.Clamp(x, pad, CONFIG.CANVAS_WIDTH  - pad);
    this.y = Phaser.Math.Clamp(y, pad, CONFIG.CANVAS_HEIGHT - pad);

    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) this.trailHistory.shift();

    this.draw();
  }

  draw() {
    this.graphics.clear();
    const g      = this.graphics;
    const danger = this._dangerIntensity || 0;
    const pulse  = 0.5 + 0.5 * Math.sin(this._pulseAngle);
    const ageFactor = Math.min(1, this._age / 20000);
    const col = this._getTierColor();

    // Materializing echoes flicker and render as hollow rings
    const materializing = this._graceLeft > 0;
    const a = materializing
      ? this.alpha * (0.35 + 0.25 * Math.sin(this._age * 0.04))
      : this.alpha;

    // Trail — longer and brighter for higher tiers
    const tMult = this._warpSlowed ? 2.0 : 1;
    const trailBrightness = 1 + ageFactor * 0.5 + (this.tier - 1) * 0.3;
    this.trailHistory.forEach((pt, i) => {
      const prog = (i + 1) / this.trailHistory.length;
      g.fillStyle(col, Math.min(Math.pow(prog, 1.2) * 0.4 * a * tMult * trailBrightness, 0.85));
      g.fillCircle(pt.x, pt.y, this.radius * 0.8 * prog * tMult);
    });

    if (materializing) {
      const grow = 1 - this._graceLeft / CONFIG.GHOST_GRACE_MS;
      g.lineStyle(2, col, 0.8 * this.alpha);
      g.strokeCircle(this.x, this.y, this.radius * (2.6 - grow * 1.6));
      g.lineStyle(1, 0xffffff, 0.35 * this.alpha);
      g.strokeCircle(this.x, this.y, this.radius);
    }

    // Drop shadow
    g.fillStyle(0x220033, a * 0.38);
    g.fillEllipse(this.x + 3, this.y + 14, 26, 8);

    // Chromatic aberration — more intense for higher tiers
    const ca = 2.5 + danger * 3.5 + (this.tier - 1) * 1.5;
    g.fillStyle(0xff0055, a * 0.12); g.fillCircle(this.x - ca, this.y, this.radius * 0.95);
    g.fillStyle(0x00ccff, a * 0.12); g.fillCircle(this.x + ca, this.y, this.radius * 0.95);

    // Far + mid glow — brighter with age, tier and danger (glow texture radius = 64px)
    const glowMult = 1 + ageFactor * 0.6 + (this.tier - 1) * 0.35;
    const farR = 65 + danger * 35 + ageFactor * 20;
    this._glowFar.setPosition(this.x, this.y).setTint(col).setScale(farR / 64)
      .setAlpha(Math.min(1, a * (0.16 + danger * 0.2 + pulse * 0.04) * glowMult));
    const midR = this.radius * 3.4 + danger * 10 + pulse * 3 + ageFactor * 4;
    this._glowMid.setPosition(this.x, this.y).setTint(col).setScale(midR / 64)
      .setAlpha(Math.min(1, a * (0.55 + danger * 0.45) * glowMult));

    // Tier 2/3: outer energy ring
    if (this.tier >= 2) {
      g.lineStyle(1.5, col, (0.4 + pulse * 0.3) * (a / CONFIG.GHOST_ALPHA));
      g.strokeCircle(this.x, this.y, this.radius * 2.2 + pulse * 2);
    }

    // Core (3D sphere)
    g.fillStyle(col, a);
    g.fillCircle(this.x, this.y, this.radius);
    g.fillStyle(0x220033, a * 0.5);
    g.fillCircle(this.x + 2.5, this.y + 2.5, this.radius * 0.75);
    g.fillStyle(0xffffff, a * 0.3);
    g.fillCircle(this.x - 2.5, this.y - 2.5, this.radius * 0.35);

    // Void eye
    const eyeA = a * (0.4 + (danger > 0.3 ? this._eyeFlicker * 0.5 : 0));
    const eyeC = danger > 0.5 ? 0xff0000 : (this.tier >= 2 ? col : 0xffffff);
    g.lineStyle(1, eyeC, eyeA * 0.8); g.strokeCircle(this.x, this.y, this.radius * 0.52);
    g.fillStyle(eyeC, eyeA);           g.fillCircle(this.x, this.y, this.radius * 0.2);

    // Warp shimmer
    if (this._warpSlowed) {
      g.fillStyle(0x001888, 0.2 * a);       g.fillCircle(this.x, this.y, this.radius * 2.4);
      g.lineStyle(1.5, 0x0066ff, 0.55 * a); g.strokeCircle(this.x, this.y, this.radius * 1.7);
    }

    // Lured echoes show a faint tether toward the decoy
    if (this._lureW > 0.05) {
      g.lineStyle(1, 0x00ff88, 0.25 * this._lureW * a);
      g.beginPath(); g.moveTo(this.x, this.y); g.lineTo(this._lureX, this._lureY); g.strokePath();
    }
  }

  setDangerIntensity(d) { this._dangerIntensity = Phaser.Math.Clamp(d, 0, 1); }

  flashDanger() {
    this._dangerIntensity = 1;
    this.alpha = 1;
    if (this.graphics) this.draw();
  }

  destroy() {
    this.alive = false;
    if (this.graphics) { this.graphics.destroy(); this.graphics = null; }
    this._glowFar?.destroy(); this._glowMid?.destroy();
    this._glowFar = this._glowMid = null;
  }
}
