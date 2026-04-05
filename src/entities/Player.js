import { CONFIG } from '../config/GameConfig.js';

export class Player {
  constructor(scene) {
    this.scene    = scene;
    this.x        = CONFIG.CANVAS_WIDTH / 2;
    this.y        = CONFIG.CANVAS_HEIGHT / 2;
    this.vx       = 0;
    this.vy       = 0;
    this.radius   = CONFIG.PLAYER_RADIUS;
    this.alive    = true;
    this.trailHistory = [];
    this._pulseAngle  = 0;
    this._warpAura    = false;

    // Nerve color shift state (set externally by GameScene)
    this.nerveLevel = 0;  // 0–1, drives color shift cyan→gold

    this.minX = CONFIG.ARENA_PADDING + this.radius;
    this.maxX = CONFIG.CANVAS_WIDTH  - CONFIG.ARENA_PADDING - this.radius;
    this.minY = CONFIG.ARENA_PADDING + this.radius;
    this.maxY = CONFIG.CANVAS_HEIGHT - CONFIG.ARENA_PADDING - this.radius;

    this.graphics = scene.add.graphics().setDepth(20);

    this.keys = scene.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w:     Phaser.Input.Keyboard.KeyCodes.W,
      a:     Phaser.Input.Keyboard.KeyCodes.A,
      s:     Phaser.Input.Keyboard.KeyCodes.S,
      d:     Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.draw();
  }

  update(delta) {
    if (!this.alive) return;
    const dt = delta / 1000;
    let dx = 0, dy = 0;

    if (this.keys.left.isDown  || this.keys.a.isDown) dx -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) dx += 1;
    if (this.keys.up.isDown    || this.keys.w.isDown) dy -= 1;
    if (this.keys.down.isDown  || this.keys.s.isDown) dy += 1;

    if (dx !== 0 && dy !== 0) { const l = Math.sqrt(dx*dx + dy*dy); dx /= l; dy /= l; }

    this.vx = dx * CONFIG.PLAYER_SPEED;
    this.vy = dy * CONFIG.PLAYER_SPEED;

    this.x = Phaser.Math.Clamp(this.x + this.vx * dt, this.minX, this.maxX);
    this.y = Phaser.Math.Clamp(this.y + this.vy * dt, this.minY, this.maxY);

    this._pulseAngle += 0.065;
    this.draw();
  }

  /** Interpolate between two hex colors by t (0–1) */
  _lerpColor(colA, colB, t) {
    const ar = (colA >> 16) & 0xff, ag = (colA >> 8) & 0xff, ab = colA & 0xff;
    const br = (colB >> 16) & 0xff, bg = (colB >> 8) & 0xff, bb = colB & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g2 = Math.round(ag + (bg - ag) * t);
    const b = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g2 << 8) | b;
  }

  draw() {
    this.graphics.clear();
    const g    = this.graphics;
    const r    = this.radius;
    const glow = 0.5 + 0.5 * Math.sin(this._pulseAngle);

    // Nerve-driven color shift: cyan → gold at max nerve
    const baseColor = CONFIG.PLAYER_COLOR;           // 0x00f5ff cyan
    const peakColor = 0xffd700;                       // gold
    const playerCol = this._lerpColor(baseColor, peakColor, this.nerveLevel);

    // ---- TRAIL ----
    // Directional motion blur: trail dots offset in movement direction
    this.trailHistory.push({ x: this.x, y: this.y, vx: this.vx, vy: this.vy });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) this.trailHistory.shift();

    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = CONFIG.PLAYER_SPEED;
    const blurStretch = Math.min(speed / maxSpeed, 1) * 0.6;

    const tLen = this.trailHistory.length;
    this.trailHistory.forEach((pt, i) => {
      const prog = (i + 1) / tLen;
      // Stretch trail ellipse along movement direction
      const ptSpeed = Math.hypot(pt.vx, pt.vy);
      if (ptSpeed > 10 && blurStretch > 0.05) {
        const angle = Math.atan2(pt.vy, pt.vx);
        const stretch = 1 + blurStretch * (1 - prog) * 2.5;
        g.save();
        g.translateCanvas(pt.x, pt.y);
        g.rotateCanvas(angle);
        g.fillStyle(playerCol, Math.pow(prog, 1.6) * 0.65);
        g.fillEllipse(0, 0, r * 0.95 * prog * stretch * 2, r * 0.95 * prog * 2);
        g.restore();
      } else {
        g.fillStyle(playerCol, Math.pow(prog, 1.6) * 0.65);
        g.fillCircle(pt.x, pt.y, r * 0.95 * prog);
      }
    });

    // ---- WARP AURA ----
    if (this._warpAura) {
      const wp = 0.5 + 0.5 * Math.sin(this._pulseAngle * 2.8);
      g.fillStyle(0x00ffcc, 0.04 + wp * 0.05);
      g.fillCircle(this.x, this.y, 96 + wp * 10);
      g.lineStyle(1.5, 0x00ffcc, 0.5 + wp * 0.35);
      g.strokeCircle(this.x, this.y, 56 + wp * 5);
      g.lineStyle(1, 0x00ffcc, 0.25 + wp * 0.2);
      g.strokeCircle(this.x, this.y, 72 + wp * 7);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const px = this.x + Math.cos(a + this._pulseAngle * 0.4) * (80 + wp * 8);
        const py = this.y + Math.sin(a + this._pulseAngle * 0.4) * (80 + wp * 8);
        g.fillStyle(0x00ffcc, 0.45 + wp * 0.3);
        g.fillCircle(px, py, 1.5);
      }
    }

    // ---- ARENA ILLUMINATION ----
    g.fillStyle(playerCol, 0.025 + glow * 0.015);
    g.fillCircle(this.x, this.y, 100);

    // ---- NERVE GLOW — expands at high nerve ----
    const nerveGlow = 0.08 + this.nerveLevel * 0.12;
    g.fillStyle(playerCol, nerveGlow + glow * 0.05);
    g.fillCircle(this.x, this.y, 48 + this.nerveLevel * 20);
    g.fillStyle(playerCol, 0.20 + this.nerveLevel * 0.15);
    g.fillCircle(this.x, this.y, 24);

    // ---- ORBIT RING ----
    const ringColor = this._warpAura ? 0x00ffcc : playerCol;
    const ringAlpha = this._warpAura ? 0.85 : (0.28 + glow * 0.32 + this.nerveLevel * 0.3);
    g.lineStyle(1.5 + this.nerveLevel, ringColor, ringAlpha);
    g.strokeCircle(this.x, this.y, 18 + this.nerveLevel * 4);

    // ---- 3D SPHERE CORE ----
    g.fillStyle(playerCol, 1);
    g.fillCircle(this.x, this.y, r);

    g.fillStyle(0x003355, 0.5);
    g.fillCircle(this.x + r * 0.25, this.y + r * 0.25, r * 0.75);

    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(this.x - r * 0.33, this.y - r * 0.33, r * 0.32);

    g.fillStyle(0xaaffff, 0.4);
    g.fillCircle(this.x - r * 0.1, this.y - r * 0.1, r * 0.18);

    g.lineStyle(1, 0xffffff, 0.22);
    g.strokeCircle(this.x, this.y, r * 0.62);
  }

  kill()    { this.alive = false; this.graphics.setVisible(false); }
  destroy() { this.graphics.destroy(); }
}
