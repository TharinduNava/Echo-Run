import { CONFIG } from '../config/GameConfig.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x060d1a, 1);
    bg.fillRect(0, 0, w, h);

    // Grid lines
    bg.lineStyle(1, 0x1e3a5f, 0.2);
    const gridSize = 60;
    const p = CONFIG.ARENA_PADDING;
    for (let x = 0; x < w; x += gridSize) {
      bg.beginPath();
      bg.moveTo(x, 0);
      bg.lineTo(x, h);
      bg.strokePath();
    }
    for (let y = 0; y < h; y += gridSize) {
      bg.beginPath();
      bg.moveTo(0, y);
      bg.lineTo(w, y);
      bg.strokePath();
    }

    // Arena border
    bg.lineStyle(2, 0x1e3a5f, 1);
    bg.strokeRect(p, p, w - p * 2, h - p * 2);

    // Corner accents
    bg.lineStyle(3, 0x00f5ff, 0.3);
    const cs = 20;
    [[p, p], [w - p, p], [p, h - p], [w - p, h - p]].forEach(([bx, by]) => {
      const sx = bx === p ? 1 : -1;
      const sy = by === p ? 1 : -1;
      bg.beginPath();
      bg.moveTo(bx + sx * cs, by);
      bg.lineTo(bx, by);
      bg.lineTo(bx, by + sy * cs);
      bg.strokePath();
    });

    // Decorative ghost trails (static demo)
    this._drawDemoTrails();

    // Title: ECHO
    this.add.text(cx, cy - 120, 'ECHO', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '72px',
      fontStyle: 'bold',
      color: CONFIG.COLOR_CYAN,
      align: 'center'
    }).setOrigin(0.5).setDepth(10);

    // Title: RUN
    this.add.text(cx, cy - 50, 'RUN', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '72px',
      fontStyle: 'bold',
      color: CONFIG.COLOR_PURPLE,
      align: 'center'
    }).setOrigin(0.5).setDepth(10);

    // Tagline
    this.add.text(cx, cy + 20, '"Your past is your greatest enemy."', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '14px',
      color: '#888888',
      align: 'center'
    }).setOrigin(0.5).setDepth(10);

    // Controls hint
    this.add.text(cx, cy + 70, 'WASD / ARROWS — MOVE        SHIFT — TIME WARP', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '11px',
      color: '#445566',
      align: 'center'
    }).setOrigin(0.5).setDepth(10);

    // Best time
    const best = localStorage.getItem('echorun_best');
    if (best && parseFloat(best) > 0) {
      const bestSec = (parseFloat(best) / 1000).toFixed(2);
      this.add.text(cx, cy + 105, `BEST: ${bestSec}s`, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '13px',
        color: CONFIG.COLOR_GOLD,
        align: 'center'
      }).setOrigin(0.5).setDepth(10);
    }

    // Start prompt (blinking)
    const prompt = this.add.text(cx, cy + 145, 'PRESS SPACE OR CLICK TO BEGIN', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '15px',
      color: CONFIG.COLOR_CYAN,
      align: 'center'
    }).setOrigin(0.5).setDepth(10);

    this.tweens.add({
      targets: prompt,
      alpha: 0.1,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Animated cyan player dot
    this._spawnDemoPlayer(cx, cy);

    // Input handlers
    this.input.keyboard.once('keydown-SPACE', () => this._startGame());
    this.input.once('pointerdown', () => this._startGame());
  }

  _drawDemoTrails() {
    const g = this.add.graphics().setDepth(2).setAlpha(0.15);
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;

    // Draw a few curved "ghost path" lines for atmosphere
    const paths = [
      [{ x: 150, y: 200 }, { x: 300, y: 150 }, { x: 450, y: 300 }, { x: 350, y: 450 }, { x: 200, y: 400 }],
      [{ x: 600, y: 180 }, { x: 750, y: 280 }, { x: 700, y: 420 }, { x: 550, y: 480 }],
    ];
    g.lineStyle(2, CONFIG.GHOST_COLOR, 1);
    paths.forEach(pts => {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i].x, pts[i].y);
      }
      g.strokePath();
    });
  }

  _spawnDemoPlayer(cx, cy) {
    const dot = this.add.graphics().setDepth(15);
    let angle = 0;
    const radius = 60;

    this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        angle += 0.02;
        const x = cx + Math.cos(angle) * radius;
        const y = cy - 20 + Math.sin(angle) * radius * 0.4;
        dot.clear();
        dot.fillStyle(CONFIG.PLAYER_COLOR, 0.2);
        dot.fillCircle(x, y, 18);
        dot.fillStyle(CONFIG.PLAYER_COLOR, 1);
        dot.fillCircle(x, y, 7);
        dot.fillStyle(0xffffff, 0.6);
        dot.fillCircle(x - 2, y - 2, 2.5);
      }
    });
  }

  _startGame() {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });
  }
}
