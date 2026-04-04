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

    const dt = delta / 1000; // convert ms to seconds
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

    this.x += dx * CONFIG.PLAYER_SPEED * dt;
    this.y += dy * CONFIG.PLAYER_SPEED * dt;

    // Clamp to arena
    this.x = Phaser.Math.Clamp(this.x, this.minX, this.maxX);
    this.y = Phaser.Math.Clamp(this.y, this.minY, this.maxY);

    this.draw();
  }

  draw() {
    this.graphics.clear();

    // Update trail history
    this.trailHistory.push({ x: this.x, y: this.y });
    if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) {
      this.trailHistory.shift();
    }

    // Draw trail before core circle:
    this.trailHistory.forEach((pt, i) => {
      const progress = i / this.trailHistory.length;
      const a = progress * 0.4;
      const r = this.radius * 0.5 * progress;
      this.graphics.fillStyle(CONFIG.PLAYER_COLOR, a);
      this.graphics.fillCircle(pt.x, pt.y, r);
    });

    // Outer glow
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 0.2);
    this.graphics.fillCircle(this.x, this.y, this.radius * 2.5);
    // Core
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 1);
    this.graphics.fillCircle(this.x, this.y, this.radius);
    // Inner highlight
    this.graphics.fillStyle(0xffffff, 0.6);
    this.graphics.fillCircle(this.x - 3, this.y - 3, this.radius * 0.35);
  }

  kill() {
    this.alive = false;
    this.graphics.setVisible(false);
  }

  destroy() {
    this.graphics.destroy();
  }
}
