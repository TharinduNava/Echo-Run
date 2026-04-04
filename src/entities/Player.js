import { CONFIG } from '../config/GameConfig.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.x = CONFIG.CANVAS_WIDTH / 2;
    this.y = CONFIG.CANVAS_HEIGHT / 2;
    this.vx = 0;
    this.vy = 0;
    this.radius = CONFIG.PLAYER_RADIUS;
    this.alive = true;
    this.trailHistory = [];
    this._pulseAngle = 0;
    this._isMoving = false;
    this._warpAura = false;

    this.minX = CONFIG.ARENA_PADDING + this.radius;
    this.maxX = CONFIG.CANVAS_WIDTH - CONFIG.ARENA_PADDING - this.radius;
    this.minY = CONFIG.ARENA_PADDING + this.radius;
    this.maxY = CONFIG.CANVAS_HEIGHT - CONFIG.ARENA_PADDING - this.radius;

    this.graphics = scene.add.graphics().setDepth(20);
    this.draw();

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
    this._isMoving = (dx !== 0 || dy !== 0);

    this.x = Phaser.Math.Clamp(this.x + this.vx * dt, this.minX, this.maxX);
    this.y = Phaser.Math.Clamp(this.y + this.vy * dt, this.minY, this.maxY);

    this._pulseAngle += 0.07;
    this.draw();
  }

  draw() {
    this.graphics.clear();

    // Trail
    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) this.trailHistory.shift();

    const tLen = this.trailHistory.length;
    this.trailHistory.forEach((pt, i) => {
      const prog = (i + 1) / tLen;
      this.graphics.fillStyle(CONFIG.PLAYER_COLOR, Math.pow(prog, 1.8) * 0.6);
      this.graphics.fillCircle(pt.x, pt.y, this.radius * 0.9 * prog);
    });

    const glow = 0.5 + 0.5 * Math.sin(this._pulseAngle);

    // ----- WARP AURA -----
    if (this._warpAura) {
      const wp = 0.5 + 0.5 * Math.sin(this._pulseAngle * 3);
      this.graphics.fillStyle(0x00ffcc, 0.04 + wp * 0.06);
      this.graphics.fillCircle(this.x, this.y, 90 + wp * 12);
      this.graphics.lineStyle(1.5, 0x00ffcc, 0.4 + wp * 0.4);
      this.graphics.strokeCircle(this.x, this.y, 52 + wp * 6);
      this.graphics.lineStyle(1, 0x00ffcc, 0.2 + wp * 0.25);
      this.graphics.strokeCircle(this.x, this.y, 68 + wp * 8);
    }

    // Giant far glow — illuminates the arena around the player
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 0.028 + glow * 0.018);
    this.graphics.fillCircle(this.x, this.y, 80);

    // Large glow layer
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 0.07 + glow * 0.05);
    this.graphics.fillCircle(this.x, this.y, 44);

    // Mid glow
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 0.22);
    this.graphics.fillCircle(this.x, this.y, 22);

    // Energy ring (always visible, pulsing)
    const ringA = this._warpAura ? 0.8 : (0.25 + glow * 0.3);
    const ringC = this._warpAura ? 0x00ffcc : CONFIG.PLAYER_COLOR;
    this.graphics.lineStyle(1.5, ringC, ringA);
    this.graphics.strokeCircle(this.x, this.y, 18);

    // Core
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 1);
    this.graphics.fillCircle(this.x, this.y, this.radius);

    // Inner highlight
    this.graphics.fillStyle(0xffffff, 0.85);
    this.graphics.fillCircle(this.x - 3, this.y - 3, this.radius * 0.38);

    // Inner ring
    this.graphics.lineStyle(1, 0xffffff, 0.25);
    this.graphics.strokeCircle(this.x, this.y, this.radius * 0.65);
  }

  kill() { this.alive = false; this.graphics.setVisible(false); }
  destroy() { this.graphics.destroy(); }
}
