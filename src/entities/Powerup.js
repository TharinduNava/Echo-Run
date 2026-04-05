import { CONFIG } from '../config/GameConfig.js';

export class Powerup {
  constructor(scene, type, x, y) {
    this.scene  = scene;
    this.type   = type;   // 'clash' | 'phase' | 'decoy'
    this.x      = x;
    this.y      = y;
    this.alive  = true;
    this._phase = Math.random() * Math.PI * 2;
    this._gfx   = scene.add.graphics().setDepth(8);

    const labelMap = { clash: '💀 CLASH', phase: '🛡 PHASE', decoy: '👁 DECOY' };
    const colorMap = { clash: CONFIG.COLOR_CLASH, phase: CONFIG.COLOR_PHASE, decoy: CONFIG.COLOR_DECOY };
    this._label = scene.add.text(x, y - 26, labelMap[type] || type.toUpperCase(), {
      fontFamily: 'Orbitron, monospace', fontSize: '9px',
      color: colorMap[type] || CONFIG.COLOR_CYAN,
      align: 'center'
    }).setOrigin(0.5).setDepth(9).setAlpha(0);
    scene.tweens.add({ targets: this._label, alpha: 1, duration: 400 });

    this._despawnTimer = scene.time.delayedCall(CONFIG.POWERUP_DESPAWN_MS, () => {
      if (this.alive) this._fadeOut();
    });
  }

  update() {
    if (!this.alive) return;
    const now   = this.scene.time.now;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004 + this._phase);
    const spin  = now * 0.002;

    const colorMap = { clash: 0xff6600, phase: 0x00ccff, decoy: 0x00ff88 };
    const col  = colorMap[this.type] || 0x00f5ff;
    const size = 11;
    const g    = this._gfx;
    g.clear();

    // Far glow
    g.fillStyle(col, 0.06 + pulse * 0.06);
    g.fillCircle(this.x, this.y, 38);

    // Mid glow
    g.fillStyle(col, 0.16 + pulse * 0.12);
    g.fillCircle(this.x, this.y, 20);

    // Decoy: spinning triangle instead of diamond
    if (this.type === 'decoy') {
      g.fillStyle(col, 0.7 + pulse * 0.3);
      for (let i = 0; i < 3; i++) {
        const a1 = spin + (i / 3) * Math.PI * 2;
        const a2 = spin + ((i + 1) / 3) * Math.PI * 2;
        g.fillTriangle(
          this.x + Math.cos(a1) * size, this.y + Math.sin(a1) * size,
          this.x + Math.cos(a2) * size, this.y + Math.sin(a2) * size,
          this.x, this.y
        );
      }
      // Counter-rotating inner ring
      g.lineStyle(1.5, col, 0.5 + pulse * 0.3);
      g.strokeCircle(this.x, this.y, 8 + pulse * 2);
    } else {
      // Rotating diamond (4 points)
      g.fillStyle(col, 0.7 + pulse * 0.3);
      const pts = [];
      for (let i = 0; i < 4; i++) {
        const a = spin + (i / 4) * Math.PI * 2;
        pts.push({ x: this.x + Math.cos(a) * size, y: this.y + Math.sin(a) * size * 0.7 });
      }
      g.fillTriangle(pts[0].x, pts[0].y, pts[1].x, pts[1].y, this.x, this.y - size * 0.7);
      g.fillTriangle(pts[1].x, pts[1].y, pts[2].x, pts[2].y, this.x, this.y + size * 0.7);
      g.fillTriangle(pts[2].x, pts[2].y, pts[3].x, pts[3].y, this.x, this.y + size * 0.7);
      g.fillTriangle(pts[3].x, pts[3].y, pts[0].x, pts[0].y, this.x, this.y - size * 0.7);
    }

    // Core dot
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(this.x, this.y, 3);

    // Orbit ring
    g.lineStyle(1, col, 0.3 + pulse * 0.3);
    g.strokeCircle(this.x, this.y, 16 + pulse * 3);
  }

  overlaps(px, py, radius = 22) {
    return Math.hypot(px - this.x, py - this.y) < radius;
  }

  _fadeOut() {
    this.alive = false;
    this.scene.tweens.add({
      targets: [this._gfx, this._label], alpha: 0, duration: 500,
      onComplete: () => { this._gfx.destroy(); this._label.destroy(); }
    });
  }

  collect() {
    this._despawnTimer.remove();
    this._fadeOut();
  }

  destroy() {
    this._despawnTimer?.remove();
    this._gfx.destroy();
    this._label.destroy();
  }
}
