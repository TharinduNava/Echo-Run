import { CONFIG } from '../config/GameConfig.js';

export class DeathEffect {
  static play(scene, x, y) {
    const PARTICLE_COUNT = 20;
    const graphics = scene.add.graphics().setDepth(95);
    const particles = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const speed = Phaser.Math.Between(80, 200);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Phaser.Math.Between(2, 5),
        alpha: 1,
        color: i % 3 === 0 ? CONFIG.PLAYER_COLOR : CONFIG.GHOST_COLOR
      });
    }

    let elapsed = 0;
    const duration = 800;

    const ticker = scene.time.addEvent({
      delay: 16,
      repeat: Math.floor(duration / 16),
      callback: () => {
        elapsed += 16;
        const progress = elapsed / duration;
        graphics.clear();

        particles.forEach(p => {
          p.x += p.vx * 0.016;
          p.y += p.vy * 0.016;
          p.vy += 80 * 0.016; // gravity
          p.alpha = 1 - progress;
          graphics.fillStyle(p.color, p.alpha);
          graphics.fillCircle(p.x, p.y, p.radius * (1 - progress * 0.5));
        });

        if (progress >= 1) {
          graphics.destroy();
          ticker.destroy();
        }
      }
    });
  }
}
