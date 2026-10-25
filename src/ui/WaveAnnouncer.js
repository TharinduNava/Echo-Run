import { CONFIG } from '../config/GameConfig.js';

const MESSAGES = [
  'ECHO #{n} — DELTA SIGNATURE DETECTED',
  'ECHO #{n} — TEMPORAL TRACE ACTIVE',
  'ECHO #{n} — SHADOW PROTOCOL ENGAGED',
  'ECHO #{n} — PAST SELF MANIFESTING',
  'ECHO #{n} — CHRONOLOCK RELEASED',
];

const TIER_STYLE = {
  1: { color: CONFIG.COLOR_PURPLE, hex: 0xa855f7, tag: '// ECHO SYSTEM //' },
  2: { color: CONFIG.COLOR_WARN,   hex: 0xff8c00, tag: '// ACCELERATED ECHO //' },
  3: { color: CONFIG.COLOR_DANGER, hex: 0xff3355, tag: '// LETHAL ECHO //' },
};

export class WaveAnnouncer {
  constructor(scene) {
    this.scene = scene;
    this._current = null;
  }

  announce(ghostNumber, tier = 1) {
    const W  = CONFIG.CANVAS_WIDTH;
    const H  = CONFIG.CANVAS_HEIGHT;
    const p  = CONFIG.ARENA_PADDING;
    const by = H - p - 92;   // sits above the bottom HUD panels
    const style = TIER_STYLE[tier] || TIER_STYLE[1];
    const msg = MESSAGES[(ghostNumber - 1) % MESSAGES.length].replace('{n}', ghostNumber);

    // Replace any banner still on screen instead of stacking
    if (this._current) this._current.forEach(o => { this.scene.tweens.killTweensOf(o); o.destroy(); });

    const banner = this.scene.add.graphics().setDepth(70).setAlpha(0);
    banner.fillStyle(0x000000, 0.7);
    banner.fillRect(p, by - 20, W - p * 2, 40);
    banner.lineStyle(1, style.hex, 0.45);
    banner.beginPath(); banner.moveTo(p, by - 20); banner.lineTo(W - p, by - 20); banner.strokePath();
    banner.beginPath(); banner.moveTo(p, by + 20); banner.lineTo(W - p, by + 20); banner.strokePath();

    const label = this.scene.add.text(W / 2, by + 5, msg, {
      fontFamily: 'Orbitron, monospace', fontSize: '13px',
      color: style.color, align: 'center',
      stroke: '#000000', strokeThickness: 5
    }).setOrigin(0.5).setDepth(71).setAlpha(0);

    const tag = this.scene.add.text(W / 2, by - 11, style.tag, {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '9px',
      color: '#667788', align: 'center'
    }).setOrigin(0.5).setDepth(71).setAlpha(0);

    const parts = [banner, label, tag];
    this._current = parts;

    this.scene.tweens.add({
      targets: parts, alpha: 1, duration: 180, ease: 'Power2',
      onComplete: () => {
        this.scene.tweens.add({
          targets: parts, alpha: 0, delay: 1600, duration: 350,
          onComplete: () => {
            parts.forEach(o => o.destroy());
            if (this._current === parts) this._current = null;
          }
        });
      }
    });
  }
}
