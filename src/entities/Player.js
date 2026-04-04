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
    this._energyRingRadius = 0;
    this._isMoving = false;
    this._warpAura = false; // set externally during time warp

    // Bounds
    this.minX = CONFIG.ARENA_PADDING + this.radius;
    this.maxX = CONFIG.CANVAS_WIDTH - CONFIG.ARENA_PADDING - this.radius;
    this.minY = CONFIG.ARENA_PADDING + this.radius;
    this.maxY = CONFIG.CANVAS_HEIGHT - CONFIG.ARENA_PADDING - this.radius;

    // Graphics
    this.graphics = scene.add.graphics();
    this.draw();

    // Input
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
    let dx = 0;
    let dy = 0;

    if (this.keys.left.isDown  || this.keys.a.isDown) dx -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) dx += 1;
    if (this.keys.up.isDown    || this.keys.w.isDown) dy -= 1;
    if (this.keys.down.isDown  || this.keys.s.isDown) dy += 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    this.vx = dx * CONFIG.PLAYER_SPEED;
    this.vy = dy * CONFIG.PLAYER_SPEED;
    this._isMoving = (dx !== 0 || dy !== 0);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Clamp to arena
    this.x = Phaser.Math.Clamp(this.x, this.minX, this.maxX);
    this.y = Phaser.Math.Clamp(this.y, this.minY, this.maxY);

    this._pulseAngle += 0.07;

    this.draw();
  }

  draw() {
    this.graphics.clear();

    // ----- TRAIL -----
    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) {
      this.trailHistory.shift();
    }

    const trailLen = this.trailHistory.length;
    this.trailHistory.forEach((pt, i) => {
      const progress = i / trailLen;
      const a = Math.pow(progress, 1.5) * 0.55;
      const r = this.radius * 0.9 * progress;
      this.graphics.fillStyle(CONFIG.PLAYER_COLOR, a);
      this.graphics.fillCircle(pt.x, pt.y, r);
    });

    // ----- WARP AURA (during time warp) -----
    if (this._warpAura) {
      const warpPulse = 0.5 + 0.5 * Math.sin(this._pulseAngle * 2.5);
      this.graphics.fillStyle(0x00ffcc, 0.06 + warpPulse * 0.08);
      this.graphics.fillCircle(this.x, this.y, this.radius * 5.5 + warpPulse * 6);
      this.graphics.lineStyle(1.5, 0x00ffcc, 0.35 + warpPulse * 0.35);
      this.graphics.strokeCircle(this.x, this.y, this.radius * 4.2 + warpPulse * 4);
    }

    // ----- OUTER SOFT GLOW -----
    const glowPulse = 0.5 + 0.5 * Math.sin(this._pulseAngle);
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 0.06 + glowPulse * 0.06);
    this.graphics.fillCircle(this.x, this.y, this.radius * 4.5);

    // ----- MID GLOW -----
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 0.18);
    this.graphics.fillCircle(this.x, this.y, this.radius * 2.4);

    // ----- ENERGY RING (moving only) -----
    if (this._isMoving || this._warpAura) {
      const ringAlpha = this._warpAura ? 0.7 : (0.3 + glowPulse * 0.25);
      const ringColor = this._warpAura ? 0x00ffcc : CONFIG.PLAYER_COLOR;
      this.graphics.lineStyle(1.5, ringColor, ringAlpha);
      this.graphics.strokeCircle(this.x, this.y, this.radius * 1.8);
    }

    // ----- CORE -----
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 1);
    this.graphics.fillCircle(this.x, this.y, this.radius);

    // ----- INNER HIGHLIGHT -----
    this.graphics.fillStyle(0xffffff, 0.75);
    this.graphics.fillCircle(this.x - 3, this.y - 3, this.radius * 0.38);

    // ----- SECONDARY INNER RING -----
    this.graphics.lineStyle(1, 0xffffff, 0.2);
    this.graphics.strokeCircle(this.x, this.y, this.radius * 0.65);
  }

  kill() {
    this.alive = false;
    this.graphics.setVisible(false);
  }

  destroy() {
    this.graphics.destroy();
  }
}
