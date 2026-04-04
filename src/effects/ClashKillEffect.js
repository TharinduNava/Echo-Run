import { CONFIG } from '../config/GameConfig.js';

/** Explosion when Clash kills an echo. */
export class ClashKillEffect {
  static play(scene, x, y) {
    const W  = CONFIG.CANVAS_WIDTH;
    const H  = CONFIG.CANVAS_HEIGHT;
    const cx = W / 2, cy = H / 2;

    // ── Screen flash ──────────────────────────────────────
    const flash = scene.add.rectangle(cx, cy, W, H, 0xff6600).setAlpha(0.35).setDepth(100);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, ease: 'Power2', onComplete: () => flash.destroy() });

    // ── Shockwave ring ─────────────────────────────────────
    const ring = scene.add.graphics().setDepth(95);
    scene.tweens.add({
      targets: { t: 0 }, t: 1, duration: 450, ease: 'Power2.Out',
      onUpdate: (tw) => {
        const p = tw.targets[0].t;
        ring.clear();
        ring.lineStyle(3, 0xff6600, (1 - p) * 0.9);
        ring.strokeCircle(x, y, p * 120);
        ring.lineStyle(1.5, 0xffffff, (1 - p) * 0.5);
        ring.strokeCircle(x, y, p * 80);
      },
      onComplete: () => ring.destroy()
    });

    // ── 40 particles ──────────────────────────────────────
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 220;
      const col   = [0xff6600, 0xff3355, 0xffd700, 0xffffff][Math.floor(Math.random() * 4)];
      const size  = 2 + Math.random() * 4;
      const life  = 400 + Math.random() * 500;
      const dur   = life;

      const p = scene.add.graphics().setDepth(94);
      let px = x, py = y;
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed;
      let elapsed = 0;

      scene.time.addEvent({
        delay: 16, repeat: Math.floor(life / 16),
        callback: () => {
          elapsed += 16;
          const progress = elapsed / dur;
          px += vx * 0.016; py += vy * 0.016;
          vy += 160 * 0.016; // gravity
          vx *= 0.96;        // drag
          p.clear();
          if (progress < 1) {
            p.fillStyle(col, (1 - progress) * 0.9);
            p.fillCircle(px, py, size * (1 - progress * 0.5));
          } else {
            p.destroy();
          }
        }
      });
    }

    // ── Screen shake via camera ────────────────────────────
    scene.cameras.main.shake(350, 0.012);

    // ── Scar (fading shimmer mark on floor) ───────────────
    const scar = scene.add.graphics().setDepth(6);
    let scarAlpha = 0.6;
    const scarTimer = scene.time.addEvent({
      delay: 50, repeat: 60,
      callback: () => {
        scarAlpha -= 0.01;
        scar.clear();
        if (scarAlpha > 0) {
          scar.lineStyle(2, 0xff6600, scarAlpha * 0.7);
          scar.strokeCircle(x, y, 18 + (0.6 - scarAlpha) * 30);
          scar.lineStyle(1, 0xffd700, scarAlpha * 0.5);
          scar.strokeCircle(x, y, 10 + (0.6 - scarAlpha) * 20);
        } else {
          scar.destroy();
          scarTimer.destroy();
        }
      }
    });
  }
}
