import { CONFIG } from '../config/GameConfig.js';

export class Ghost {
  constructor(scene, path) {
    this.scene = scene;
    this.path = path;           // Array<{x, y, t}>
    this.pathIndex = 0;
    this.alive = true;
    this.alpha = 0;             // starts invisible, fades in
    this._dangerIntensity = 0; // proximity warning intensity (0–1)
    this.trailHistory = [];

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
      ease: 'Linear'
    });

    // Spawn pulse ring effect
    this.spawnPulse();

    this.pathStartTime = scene.time.now;
    this.pathOffset = this.path[0].t;
  }

  spawnPulse() {
    const pulse = this.scene.add.graphics();
    pulse.lineStyle(2, CONFIG.GHOST_COLOR, 0.8);
    pulse.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS);
    this.scene.tweens.add({
      targets: pulse,
      scaleX: 4, scaleY: 4,
      alpha: 0,
      duration: 600,
      ease: 'Power2',
      onComplete: () => pulse.destroy()
    });
  }

  update(timeWarpMultiplier = 1) {
    if (!this.alive || !this.path || this.path.length === 0) return;

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

    this.x = Phaser.Math.Linear(curr.x, next.x, lerpT);
    this.y = Phaser.Math.Linear(curr.y, next.y, lerpT);

    this.draw();
  }

  draw() {
    this.graphics.clear();
    
    // Ghost trail history
    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) {
      this.trailHistory.shift();
    }
    this.trailHistory.forEach((pt, i) => {
      const progress = i / this.trailHistory.length;
      const a = progress * 0.2 * this.alpha; // dimmer than player
      const r = this.radius * 0.5 * progress;
      this.graphics.fillStyle(CONFIG.GHOST_COLOR, a);
      this.graphics.fillCircle(pt.x, pt.y, r);
    });

    // Outer glow (amplified when player is nearby)
    const dangerBoost = (this._dangerIntensity || 0);
    const glowAlpha = this.alpha * (0.15 + dangerBoost * 0.45);
    const glowRadius = CONFIG.GHOST_RADIUS * (2.5 + dangerBoost * 2.5);
    this.graphics.fillStyle(CONFIG.GHOST_COLOR, glowAlpha);
    this.graphics.fillCircle(this.x, this.y, glowRadius);
    // Core
    this.graphics.fillStyle(CONFIG.GHOST_COLOR, this.alpha);
    this.graphics.fillCircle(this.x, this.y, CONFIG.GHOST_RADIUS);
    // Inner ring
    this.graphics.lineStyle(1, 0xffffff, this.alpha * 0.4);
    this.graphics.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 0.7);
  }

  setDangerIntensity(danger) {
    // danger: 0 (far) to 1 (touching). Amplifies glow + alpha when player is near.
    this._dangerIntensity = Phaser.Math.Clamp(danger, 0, 1);
  }

  flashDanger() {
    const originalAlpha = this.alpha;
    this.alpha = 1;
    this.scene.time.delayedCall(100, () => {
      this.alpha = originalAlpha;
    });
  }

  destroy() {
    this.graphics.destroy();
  }
}
