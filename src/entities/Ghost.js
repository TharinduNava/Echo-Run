import { CONFIG } from '../config/GameConfig.js';

export class Ghost {
  constructor(scene, path) {
    this.scene = scene;
    this.path = path;           // Array<{x, y, t}>
    this.pathIndex = 0;
    this.alive = true;
    this.alpha = 0;
    this._dangerIntensity = 0;
    this.trailHistory = [];
    this._pulseAngle = Math.random() * Math.PI * 2; // stagger pulse per ghost
    this._eyeFlicker = 0;
    this._warpSlowed = false; // set externally during time warp

    // Validate path
    if (!this.path || this.path.length < 2) {
      this.alive = false;
      return;
    }

    this.x = this.path[0].x;
    this.y = this.path[0].y;
    this.radius = CONFIG.GHOST_RADIUS;

    // Graphics
    this.graphics = scene.add.graphics();

    // Fade in tween
    scene.tweens.add({
      targets: this,
      alpha: CONFIG.GHOST_ALPHA,
      duration: CONFIG.GHOST_FADE_IN_MS,
      ease: 'Sine.easeOut'
    });

    // Spawn pulse ring effect
    this.spawnPulse();

    this.pathStartTime = scene.time.now;
    this.pathOffset = this.path[0].t;
  }

  spawnPulse() {
    // Three expanding rings on spawn for drama
    [0, 180, 380].forEach((delay, idx) => {
      this.scene.time.delayedCall(delay, () => {
        const pulse = this.scene.add.graphics();
        const color = idx === 0 ? CONFIG.GHOST_COLOR : (idx === 1 ? 0xffffff : CONFIG.GHOST_COLOR);
        pulse.lineStyle(idx === 1 ? 1 : 2, color, 0.9);
        pulse.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS);
        this.scene.tweens.add({
          targets: pulse,
          scaleX: 5 + idx,
          scaleY: 5 + idx,
          alpha: 0,
          duration: 700 + idx * 100,
          ease: 'Power2',
          onComplete: () => pulse.destroy()
        });
      });
    });
  }

  update(timeWarpMultiplier = 1) {
    if (!this.alive || !this.path || this.path.length === 0) return;

    this._warpSlowed = timeWarpMultiplier < 0.5;
    this._pulseAngle += 0.05;
    this._eyeFlicker = Math.random();

    // Adjusted for time warp multiplier
    const elapsed = (this.scene.time.now - this.pathStartTime) * timeWarpMultiplier;
    const targetT = elapsed + this.pathOffset;

    // Advance path index to match elapsed time
    while (
      this.pathIndex < this.path.length - 1 &&
      this.path[this.pathIndex + 1].t <= targetT
    ) {
      this.pathIndex++;
    }

    // Loop path if configured
    if (this.pathIndex >= this.path.length - 1) {
      if (CONFIG.GHOST_LOOP_PATH) {
        this.pathIndex = 0;
        this.pathStartTime = this.scene.time.now;
      } else {
        this.alive = false;
        this.graphics.setVisible(false);
        return;
      }
    }

    // Interpolate between frames for smooth movement
    const curr = this.path[this.pathIndex];
    const next = this.path[this.pathIndex + 1] || curr;
    const span = next.t - curr.t;
    const t = span > 0 ? (targetT - curr.t) / span : 0;
    const lerpT = Phaser.Math.Clamp(t, 0, 1);

    const prevX = this.x;
    const prevY = this.y;

    this.x = Phaser.Math.Linear(curr.x, next.x, lerpT);
    this.y = Phaser.Math.Linear(curr.y, next.y, lerpT);

    // Store movement delta for warp smear
    this._dx = this.x - prevX;
    this._dy = this.y - prevY;

    this.draw();
  }

  draw() {
    this.graphics.clear();

    const danger = this._dangerIntensity || 0;
    const pulse = 0.5 + 0.5 * Math.sin(this._pulseAngle);

    // Blend ghost color toward danger red based on proximity
    const baseColor = CONFIG.GHOST_COLOR; // 0xa855f7 (purple)
    const dangerColor = 0xff3355;

    // ----- TRAIL (longer + brighter) -----
    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) {
      this.trailHistory.shift();
    }

    // During warp: elongate trail (smear effect)
    const trailMult = this._warpSlowed ? 2.5 : 1;

    this.trailHistory.forEach((pt, i) => {
      const progress = i / this.trailHistory.length;
      const a = Math.pow(progress, 1.2) * 0.3 * this.alpha * trailMult;
      const r = this.radius * 0.7 * progress * trailMult;
      this.graphics.fillStyle(danger > 0.5 ? dangerColor : baseColor, Math.min(a, 0.6));
      this.graphics.fillCircle(pt.x, pt.y, r);
    });

    // ----- CHROMATIC ABERRATION (subtle RGB split) -----
    const caOffset = 3 + danger * 4;
    this.graphics.fillStyle(0xff0055, this.alpha * 0.12);
    this.graphics.fillCircle(this.x - caOffset, this.y, CONFIG.GHOST_RADIUS * 0.85);
    this.graphics.fillStyle(0x00ffff, this.alpha * 0.12);
    this.graphics.fillCircle(this.x + caOffset, this.y, CONFIG.GHOST_RADIUS * 0.85);

    // ----- OUTER DANGER GLOW -----
    const glowAlpha = this.alpha * (0.12 + danger * 0.5 + pulse * 0.05);
    const glowRadius = CONFIG.GHOST_RADIUS * (2.8 + danger * 3.5 + pulse * 0.6);
    const glowColor = danger > 0.4 ? dangerColor : baseColor;
    this.graphics.fillStyle(glowColor, glowAlpha);
    this.graphics.fillCircle(this.x, this.y, glowRadius);

    // ----- SECONDARY MID GLOW -----
    this.graphics.fillStyle(danger > 0.5 ? dangerColor : baseColor, this.alpha * 0.25);
    this.graphics.fillCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 1.8);

    // ----- CORE -----
    this.graphics.fillStyle(danger > 0.6 ? dangerColor : baseColor, this.alpha);
    this.graphics.fillCircle(this.x, this.y, CONFIG.GHOST_RADIUS);

    // ----- INNER VOID EYE -----
    const eyeAlpha = this.alpha * (0.3 + (danger > 0.3 ? this._eyeFlicker * 0.7 : 0));
    const eyeColor = danger > 0.5 ? 0xff0000 : 0xffffff;
    this.graphics.lineStyle(1, eyeColor, eyeAlpha * 0.9);
    this.graphics.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 0.55);
    // Bright dot at center (the "eye")
    this.graphics.fillStyle(eyeColor, eyeAlpha);
    this.graphics.fillCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 0.22);

    // ----- WARP SLOW BLUE TINT (during time warp) -----
    if (this._warpSlowed) {
      this.graphics.fillStyle(0x0044ff, 0.15);
      this.graphics.fillCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 2);
      this.graphics.lineStyle(1, 0x0088ff, 0.4);
      this.graphics.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 1.5);
    }
  }

  setDangerIntensity(danger) {
    this._dangerIntensity = Phaser.Math.Clamp(danger, 0, 1);
  }

  flashDanger() {
    const originalAlpha = this.alpha;
    this.alpha = 1;
    this._dangerIntensity = 1;
    this.scene.time.delayedCall(120, () => {
      this.alpha = originalAlpha;
      this._dangerIntensity = 0;
    });
  }

  destroy() {
    if (this.graphics) this.graphics.destroy();
  }
}
