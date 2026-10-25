import Phaser from 'phaser';
import { CONFIG } from '../config/GameConfig.js';

/**
 * Generates the few shared textures the game uses (everything else is procedural Graphics).
 * Soft glows as textures are far cheaper than large tessellated circles every frame.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    this._radial('glow', 128, [
      [0.0,  'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,255,255,0.55)'],
      [0.6,  'rgba(255,255,255,0.15)'],
      [1.0,  'rgba(255,255,255,0)'],
    ]);
    this._radial('dot', 32, [
      [0.0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(255,255,255,0.6)'],
      [1.0, 'rgba(255,255,255,0)'],
    ]);
    this._vignette();
    this.scene.start('MenuScene');
  }

  _radial(key, size, stops) {
    if (this.textures.exists(key)) return;
    const tex = this.textures.createCanvas(key, size, size);
    const ctx = tex.getContext();
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(([o, c]) => grad.addColorStop(o, c));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  _vignette() {
    if (this.textures.exists('vignette')) return;
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const tex = this.textures.createCanvas('vignette', W, H);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    tex.refresh();
  }
}
