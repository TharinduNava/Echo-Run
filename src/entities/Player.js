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

  draw() {
    this.graphics.clear();
    const g    = this.graphics;
    const r    = this.radius;
    const glow = 0.5 + 0.5 * Math.sin(this._pulseAngle);

    // ---- TRAIL ----
    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) this.trailHistory.shift();

    const tLen = this.trailHistory.length;
    this.trailHistory.forEach((pt, i) => {
      const prog = (i + 1) / tLen;
      g.fillStyle(CONFIG.PLAYER_COLOR, Math.pow(prog, 1.6) * 0.65);
      g.fillCircle(pt.x, pt.y, r * 0.95 * prog);
    });

    // ---- WARP AURA ----
    if (this._warpAura) {
      const wp = 0.5 + 0.5 * Math.sin(this._pulseAngle * 2.8);
      // Outer shimmer
      g.fillStyle(0x00ffcc, 0.04 + wp * 0.05);
      g.fillCircle(this.x, this.y, 96 + wp * 10);
      // Double rotating rings
      g.lineStyle(1.5, 0x00ffcc, 0.5 + wp * 0.35);
      g.strokeCircle(this.x, this.y, 56 + wp * 5);
      g.lineStyle(1, 0x00ffcc, 0.25 + wp * 0.2);
      g.strokeCircle(this.x, this.y, 72 + wp * 7);
      // Dashed outer ring simulation (small dots at intervals)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const px = this.x + Math.cos(a + this._pulseAngle * 0.4) * (80 + wp * 8);
        const py = this.y + Math.sin(a + this._pulseAngle * 0.4) * (80 + wp * 8);
        g.fillStyle(0x00ffcc, 0.45 + wp * 0.3);
        g.fillCircle(px, py, 1.5);
      }
    }

    // ---- ARENA ILLUMINATION (very large, ultra faint) ----
    g.fillStyle(CONFIG.PLAYER_COLOR, 0.025 + glow * 0.015);
    g.fillCircle(this.x, this.y, 100);

    // ---- GLOW LAYERS ----
    g.fillStyle(CONFIG.PLAYER_COLOR, 0.08 + glow * 0.05);
    g.fillCircle(this.x, this.y, 48);
    g.fillStyle(CONFIG.PLAYER_COLOR, 0.20);
    g.fillCircle(this.x, this.y, 24);

    // ---- ORBIT RING (always visible) ----
    const ringColor = this._warpAura ? 0x00ffcc : CONFIG.PLAYER_COLOR;
    const ringAlpha = this._warpAura ? 0.85 : (0.28 + glow * 0.32);
    g.lineStyle(1.5, ringColor, ringAlpha);
    g.strokeCircle(this.x, this.y, 18);

    // ---- 3D SPHERE CORE ----
    // Base sphere
    g.fillStyle(CONFIG.PLAYER_COLOR, 1);
    g.fillCircle(this.x, this.y, r);

    // 3D shading — darker half-circle bottom-right (shadow)
    g.fillStyle(0x003355, 0.5);
    g.fillCircle(this.x + r * 0.25, this.y + r * 0.25, r * 0.75);

    // 3D specular highlight — bright dot top-left
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(this.x - r * 0.33, this.y - r * 0.33, r * 0.32);

    // Soft secondary highlight
    g.fillStyle(0xaaffff, 0.4);
    g.fillCircle(this.x - r * 0.1, this.y - r * 0.1, r * 0.18);

    // Inner ring (depth indicator)
    g.lineStyle(1, 0xffffff, 0.22);
    g.strokeCircle(this.x, this.y, r * 0.62);
  }

  kill()    { this.alive = false; this.graphics.setVisible(false); }
  destroy() { this.graphics.destroy(); }
}
