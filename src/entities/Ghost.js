import { CONFIG } from '../config/GameConfig.js';

export class Ghost {
  constructor(scene, path) {
    this.scene = scene;
    this.path = path;
    this.pathIndex = 0;
    this.alive = true;
    this.alpha = 0;
    this._dangerIntensity = 0;
    this.trailHistory = [];
    this._pulseAngle = Math.random() * Math.PI * 2;
    this._eyeFlicker = 0;
    this._warpSlowed = false;
    this._loopFading = false;

    if (!this.path || this.path.length < 2) { this.alive = false; return; }

    this.x = this.path[0].x;
    this.y = this.path[0].y;
    this.radius = CONFIG.GHOST_RADIUS;

    this.graphics = scene.add.graphics().setDepth(18);

    // ---- CRITICAL: delta-based path time ----
    // We track _pathT as the current position IN THE RECORDED PATH (in ms).
    // We increment it by (delta * multiplier) each frame — never compute it from absolute time.
    // This means warp only slows future advancement, never jumps the ghost backwards.
    this._pathT = this.path[0].t;

    // Fade in
    scene.tweens.add({
      targets: this,
      alpha: CONFIG.GHOST_ALPHA,
      duration: CONFIG.GHOST_FADE_IN_MS,
      ease: 'Sine.easeOut'
    });

    // Single spawn pulse
    this._doSpawnPulse();
  }

  _doSpawnPulse() {
    const pulse = this.scene.add.graphics().setDepth(17);
    pulse.lineStyle(2, CONFIG.GHOST_COLOR, 0.9);
    pulse.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS);
    this.scene.tweens.add({
      targets: pulse,
      scaleX: 6, scaleY: 6,
      alpha: 0,
      duration: 700,
      ease: 'Power2.Out',
      onComplete: () => pulse.destroy()
    });
  }

  /**
   * @param {number} timeWarpMultiplier  - 1 = normal, 0.2 = slow
   * @param {number} delta               - frame delta in ms (from Phaser update)
   */
  update(timeWarpMultiplier = 1, delta = 16) {
    if (!this.alive || !this.path || this.path.length === 0) return;

    this._warpSlowed = timeWarpMultiplier < 0.5;
    this._pulseAngle += 0.05;
    this._eyeFlicker = Math.random();

    // Cap delta to 50ms — prevents huge jumps on lag frames (e.g. when a new ghost spawns)
    const safeDelta = Math.min(delta, 50);

    // Advance path position by exactly (delta * multiplier) ms
    this._pathT += safeDelta * timeWarpMultiplier;

    // ---- PATH END / LOOP ----
    const maxT = this.path[this.path.length - 1].t;
    if (this._pathT >= maxT) {
      if (CONFIG.GHOST_LOOP_PATH) {
        // Wrap: carry overflow forward so timing is smooth
        const overflow = this._pathT - maxT;
        this._pathT = this.path[0].t + Math.min(overflow, 100); // cap overflow
        this.pathIndex = 0;
        this.trailHistory = []; // clear trail — prevents rubber-band line from end→start

        // Quick re-materialise flash instead of hard teleport
        if (!this._loopFading) {
          this._loopFading = true;
          const prevAlpha = this.alpha;
          this.alpha = 0.05;
          this.scene.tweens.add({
            targets: this,
            alpha: prevAlpha,
            duration: 350,
            ease: 'Power2',
            onComplete: () => { this._loopFading = false; }
          });
        }
      } else {
        this.alive = false;
        this.graphics.setVisible(false);
        return;
      }
    }

    // ---- ADVANCE pathIndex to match _pathT ----
    while (
      this.pathIndex < this.path.length - 1 &&
      this.path[this.pathIndex + 1].t <= this._pathT
    ) {
      this.pathIndex++;
    }

    // ---- INTERPOLATE position ----
    const curr  = this.path[this.pathIndex];
    const next  = this.path[Math.min(this.pathIndex + 1, this.path.length - 1)];
    const span  = next.t - curr.t;
    const lerpT = span > 0 ? Phaser.Math.Clamp((this._pathT - curr.t) / span, 0, 1) : 0;

    this.x = Phaser.Math.Linear(curr.x, next.x, lerpT);
    this.y = Phaser.Math.Linear(curr.y, next.y, lerpT);

    this.draw();
  }

  draw() {
    this.graphics.clear();

    const danger = this._dangerIntensity || 0;
    const pulse  = 0.5 + 0.5 * Math.sin(this._pulseAngle);
    const dangerColor = 0xff3355;
    const baseColor   = CONFIG.GHOST_COLOR;
    const activeColor = danger > 0.5 ? dangerColor : baseColor;

    // Trail
    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) this.trailHistory.shift();

    const tMult = this._warpSlowed ? 2.0 : 1;
    this.trailHistory.forEach((pt, i) => {
      const prog = (i + 1) / this.trailHistory.length;
      const a = Math.pow(prog, 1.2) * 0.35 * this.alpha * tMult;
      this.graphics.fillStyle(activeColor, Math.min(a, 0.7));
      this.graphics.fillCircle(pt.x, pt.y, this.radius * 0.75 * prog * tMult);
    });

    // Chromatic aberration (lightweight: 2 offset fills)
    const caOff = 2.5 + danger * 3.5;
    this.graphics.fillStyle(0xff0055, this.alpha * 0.1);
    this.graphics.fillCircle(this.x - caOff, this.y, this.radius * 0.9);
    this.graphics.fillStyle(0x00ccff, this.alpha * 0.1);
    this.graphics.fillCircle(this.x + caOff, this.y, this.radius * 0.9);

    // Far glow
    this.graphics.fillStyle(activeColor, this.alpha * (0.04 + danger * 0.06) + pulse * 0.02);
    this.graphics.fillCircle(this.x, this.y, 60 + danger * 30);

    // Mid glow
    this.graphics.fillStyle(activeColor, this.alpha * (0.15 + danger * 0.4));
    this.graphics.fillCircle(this.x, this.y, this.radius * 2.8 + danger * 8 + pulse * 2);

    // Core
    this.graphics.fillStyle(activeColor, this.alpha);
    this.graphics.fillCircle(this.x, this.y, this.radius);

    // Void eye
    const eyeA = this.alpha * (0.4 + (danger > 0.3 ? this._eyeFlicker * 0.5 : 0));
    const eyeC = danger > 0.5 ? 0xff0000 : 0xffffff;
    this.graphics.lineStyle(1, eyeC, eyeA * 0.8);
    this.graphics.strokeCircle(this.x, this.y, this.radius * 0.52);
    this.graphics.fillStyle(eyeC, eyeA);
    this.graphics.fillCircle(this.x, this.y, this.radius * 0.2);

    // Warp slow shimmer
    if (this._warpSlowed) {
      this.graphics.fillStyle(0x002288, 0.18);
      this.graphics.fillCircle(this.x, this.y, this.radius * 2.2);
      this.graphics.lineStyle(1.5, 0x0066ff, 0.5);
      this.graphics.strokeCircle(this.x, this.y, this.radius * 1.6);
    }
  }

  setDangerIntensity(d) { this._dangerIntensity = Phaser.Math.Clamp(d, 0, 1); }

  flashDanger() {
    const orig = this.alpha;
    this.alpha = 1;
    this._dangerIntensity = 1;
    this.scene.time.delayedCall(120, () => { this.alpha = orig; this._dangerIntensity = 0; });
  }

  destroy() { if (this.graphics) this.graphics.destroy(); }
}
