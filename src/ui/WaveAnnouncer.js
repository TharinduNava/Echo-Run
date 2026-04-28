import { CONFIG } from '../config/GameConfig.js';

const MESSAGES = [
  'ECHO #{n} — DELTA SIGNATURE DETECTED',
  'ECHO #{n} — TEMPORAL TRACE ACTIVE',
  'ECHO #{n} — SHADOW PROTOCOL ENGAGED',
  'ECHO #{n} — PAST SELF MANIFESTING',
  'ECHO #{n} — CHRONOLOCK RELEASED',
];

export class WaveAnnouncer {
  constructor(scene) {
    this.scene = scene;
  }

  announce(ghostNumber) {
    const W   = CONFIG.CANVAS_WIDTH;
    const H   = CONFIG.CANVAS_HEIGHT;
    const p   = CONFIG.ARENA_PADDING;
    const by  = H - p - 50;
    const msg = MESSAGES[(ghostNumber - 1) % MESSAGES.length].replace('{n}', ghostNumber);

    // Dark sweep banner at bottom strip
    const banner = this.scene.add.graphics().setDepth(70);
    banner.fillStyle(0x000000, 0.7);
    banner.fillRect(0, by - 20, W, 40);
    banner.lineStyle(1, 0xa855f7, 0.4);
    banner.beginPath(); banner.moveTo(0, by - 20); banner.lineTo(W, by - 20); banner.strokePath();
    banner.beginPath(); banner.moveTo(0, by + 20); banner.lineTo(W, by + 20); banner.strokePath();

    // Text
    const label = this.scene.add.text(W / 2, by, msg, {
      fontFamily: 'Orbitron, monospace', fontSize: '13px',
      color: CONFIG.COLOR_PURPLE, align: 'center',
      stroke: '#000000', strokeThickness: 6
    }).setOrigin(0.5).setDepth(71).setAlpha(0);

    const echoPfx = this.scene.add.text(W / 2, by - 12, `// ECHO SYSTEM //`, {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '9px',
      color: '#334455', align: 'center'
    }).setOrigin(0.5).setDepth(71).setAlpha(0);

    this.scene.tweens.add({
      targets: [banner, label, echoPfx], alpha: 1, duration: 180, ease: 'Power2',
      onComplete: () => {
        this.scene.time.delayedCall(1600, () => {
          this.scene.tweens.add({
            targets: [banner, label, echoPfx], alpha: 0, duration: 350,
            onComplete: () => { banner.destroy(); label.destroy(); echoPfx.destroy(); }
          });
        });
      }
    });
  }
}
