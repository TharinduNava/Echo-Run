import { CONFIG } from '../config/GameConfig.js';

export class DeathEffect {
  static play(scene, x, y) {
    // ---- SHOCKWAVE RING ----
    const shockwave = scene.add.graphics().setDepth(96);
    shockwave.lineStyle(3, CONFIG.PLAYER_COLOR, 1);
    shockwave.strokeCircle(x, y, CONFIG.PLAYER_RADIUS);
    scene.tweens.add({
      targets: shockwave,
      scaleX: 9, scaleY: 9,
      alpha: 0,
      duration: 600,
      ease: 'Power3',
      onComplete: () => shockwave.destroy()
    });

    // Second shockwave (ghost color, delayed)
    scene.time.delayedCall(120, () => {
      const sw2 = scene.add.graphics().setDepth(95);
      sw2.lineStyle(2, CONFIG.GHOST_COLOR, 0.9);
      sw2.strokeCircle(x, y, CONFIG.GHOST_RADIUS);
      scene.tweens.add({
        targets: sw2,
        scaleX: 12, scaleY: 12,
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => sw2.destroy()
      });
    });

    // ---- PRIMARY PARTICLE BURST ----
    const PARTICLE_COUNT = 40;
    const graphics = scene.add.graphics().setDepth(95);
    const particles = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const speed = Phaser.Math.Between(100, 280);
      const isGhost = i % 3 === 0;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Phaser.Math.Between(2, 6),
        alpha: 1,
        gravity: Phaser.Math.Between(40, 100),
        color: isGhost ? CONFIG.GHOST_COLOR : CONFIG.PLAYER_COLOR,
        trail: isGhost // ghost-colored particles leave a micro-trail
      });
    }

    // ---- SPIRAL INWARD GHOST PARTICLES ----
    const SPIRAL_COUNT = 12;
    const spiralParticles = [];
    for (let i = 0; i < SPIRAL_COUNT; i++) {
      const angle = (i / SPIRAL_COUNT) * Math.PI * 2;
      const dist = Phaser.Math.Between(60, 130);
      spiralParticles.push({
        angle,
        dist,
        targetDist: 0,
        y: 0,
        alpha: 0.8,
        color: CONFIG.GHOST_COLOR
      });
    }

    let elapsed = 0;
    const duration = 900;

    const ticker = scene.time.addEvent({
      delay: 16,
      repeat: Math.floor((duration + 200) / 16),
      callback: () => {
        elapsed += 16;
        const progress = elapsed / duration;
        graphics.clear();

        // Primary burst
        particles.forEach(p => {
          p.x += p.vx * 0.016;
          p.y += p.vy * 0.016;
          p.vy += p.gravity * 0.016;
          p.vx *= 0.985; // slight drag
          p.alpha = Math.max(0, 1 - progress * 1.1);
          const size = p.radius * (1 - progress * 0.4);
          graphics.fillStyle(p.color, p.alpha);
          graphics.fillCircle(p.x, p.y, size);
        });

        // Spiral inward particles
        if (progress < 0.7) {
          const spiralProgress = progress / 0.7;
          spiralParticles.forEach((sp, i) => {
            sp.angle += 0.05 + spiralProgress * 0.08;
            sp.dist = Phaser.Math.Linear(sp.dist, 0, spiralProgress * 0.08);
            const sx = x + Math.cos(sp.angle) * sp.dist;
            const sy = y + Math.sin(sp.angle) * sp.dist;
            sp.alpha = 0.7 * (1 - spiralProgress);
            graphics.fillStyle(sp.color, sp.alpha * 0.6);
            graphics.fillCircle(sx, sy, 3 * (1 - spiralProgress * 0.5));
          });
        }

        if (progress >= 1) {
          graphics.destroy();
          ticker.destroy();
        }
      }
    });
  }
}
