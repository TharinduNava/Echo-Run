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

    // ---- DEEP BACKGROUND ----
    const bg = this.add.graphics();
    bg.fillStyle(0x030912, 1);
    bg.fillRect(0, 0, w, h);

    // ---- STARFIELD ----
    this._stars = [];
    this._starGraphics = this.add.graphics().setDepth(1);
    const STAR_COUNT = 90;
    for (let i = 0; i < STAR_COUNT; i++) {
      this._stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3,
        alpha: Math.random() * 0.6 + 0.2,
        twinkleSpeed: 0.01 + Math.random() * 0.03,
        twinklePhase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.08
      });
    }

    // ---- GRID LINES ----
    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(1, 0x1e3a5f, 0.2);
    const gridSize = 60;
    for (let x = 0; x < w; x += gridSize) {
      grid.beginPath(); grid.moveTo(x, 0); grid.lineTo(x, h); grid.strokePath();
    }
    for (let y = 0; y < h; y += gridSize) {
      grid.beginPath(); grid.moveTo(0, y); grid.lineTo(w, y); grid.strokePath();
    }

    // ---- ARENA BORDER ----
    const arena = this.add.graphics().setDepth(3);
    const p = CONFIG.ARENA_PADDING;
    arena.lineStyle(2, 0x2a5080, 1);
    arena.strokeRect(p, p, w - p * 2, h - p * 2);
    arena.lineStyle(1, 0x1e3a5f, 0.5);
    arena.strokeRect(p + 2, p + 2, w - p * 2 - 4, h - p * 2 - 4);

    // Corner accents (animated separately below)
    this._cornerGraphics = this.add.graphics().setDepth(4);
    this._cornerPulse = 0;
    this._drawCorners(0);

    // ---- ANIMATED DEMO GHOST TRAILS ----
    this._trailGraphics = this.add.graphics().setDepth(5);
    this._trailPaths = [
      { pts: [{ x: 150, y: 170 }, { x: 310, y: 130 }, { x: 460, y: 230 }, { x: 380, y: 410 }, { x: 200, y: 380 }, { x: 150, y: 250 }], progress: 0, speed: 0.004, color: CONFIG.GHOST_COLOR },
      { pts: [{ x: 610, y: 160 }, { x: 760, y: 260 }, { x: 720, y: 430 }, { x: 560, y: 490 }, { x: 470, y: 360 }], progress: 0.5, speed: 0.003, color: 0x7c3aed },
      { pts: [{ x: 200, y: 480 }, { x: 340, y: 520 }, { x: 500, y: 480 }, { x: 640, y: 520 }, { x: 740, y: 460 }], progress: 0.3, speed: 0.0025, color: 0x5b21b6 },
    ];

    // ---- PULSING TITLE GLOW RING ----
    this._titleRingGraphics = this.add.graphics().setDepth(8);
    this._titleRingPulse = 0;

    // ---- TITLE LETTERS (staggered reveal) ----
    this._buildTitle(cx, cy);

    // Tagline
    const tagline = this.add.text(cx, cy + 26, '"Your past is your greatest enemy."', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '13px',
      color: '#4a6080',
      align: 'center'
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.time.delayedCall(900, () => {
      this.tweens.add({ targets: tagline, alpha: 1, duration: 500 });
    });

    // Controls hint
    const ctrlHint = this.add.text(cx, cy + 68, 'WASD / ARROWS — MOVE        SHIFT — TIME WARP', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '11px',
      color: '#334455',
      align: 'center'
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.time.delayedCall(1100, () => {
      this.tweens.add({ targets: ctrlHint, alpha: 1, duration: 400 });
    });

    // Best time
    const best = localStorage.getItem('echorun_best');
    if (best && parseFloat(best) > 0) {
      const bestSec = (parseFloat(best) / 1000).toFixed(2);
      const bestText = this.add.text(cx, cy + 100, `BEST: ${bestSec}s`, {
        fontFamily: 'Orbitron, monospace',
        fontSize: '13px',
        color: CONFIG.COLOR_GOLD,
        align: 'center'
      }).setOrigin(0.5).setDepth(10).setAlpha(0);
      this.time.delayedCall(1300, () => {
        this.tweens.add({ targets: bestText, alpha: 1, duration: 400 });
      });
    }

    // Start prompt
    const prompt = this.add.text(cx, cy + 148, 'PRESS  SPACE  OR  CLICK  TO  BEGIN', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '14px',
      color: CONFIG.COLOR_CYAN,
      align: 'center'
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.time.delayedCall(1500, () => {
      this.tweens.add({
        targets: prompt, alpha: 1, duration: 300, onComplete: () => {
          this.tweens.add({ targets: prompt, alpha: 0.1, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
      });
    });

    // ---- ANIMATED DEMO PLAYER ----
    this._demoGraphics = this.add.graphics().setDepth(15);
    this._demoAngle = 0;
    this._demoTrailHistory = [];
    this._demoOrbitRadius = 65;

    // ---- MAIN UPDATE LOOP ----
    this.time.addEvent({ delay: 16, loop: true, callback: this._tick, callbackScope: this });

    // Input
    this.input.keyboard.once('keydown-SPACE', () => this._startGame());
    this.input.once('pointerdown', () => this._startGame());
  }

  _buildTitle(cx, cy) {
    // Draw "ECHO" and "RUN" with staggered letter-by-letter reveal
    const echoLetters = 'ECHO'.split('');
    const runLetters  = 'RUN'.split('');
    const echoWidth = 75;
    const runWidth  = 75;

    const echoStartX = cx - ((echoLetters.length - 1) * echoWidth) / 2;
    const runStartX  = cx - ((runLetters.length - 1) * runWidth) / 2;

    echoLetters.forEach((ch, i) => {
      const el = this.add.text(echoStartX + i * echoWidth, cy - 115, ch, {
        fontFamily: 'Orbitron, monospace',
        fontSize: '72px',
        fontStyle: 'bold',
        color: CONFIG.COLOR_CYAN,
        align: 'center'
      }).setOrigin(0.5).setDepth(10).setAlpha(0).setY(cy - 85);

      this.time.delayedCall(200 + i * 120, () => {
        this.tweens.add({
          targets: el,
          alpha: 1,
          y: cy - 115,
          duration: 400,
          ease: 'Back.easeOut'
        });
      });
    });

    runLetters.forEach((ch, i) => {
      const el = this.add.text(runStartX + i * runWidth, cy - 40, ch, {
        fontFamily: 'Orbitron, monospace',
        fontSize: '72px',
        fontStyle: 'bold',
        color: CONFIG.COLOR_PURPLE,
        align: 'center'
      }).setOrigin(0.5).setDepth(10).setAlpha(0).setY(cy - 10);

      this.time.delayedCall(700 + i * 120, () => {
        this.tweens.add({
          targets: el,
          alpha: 1,
          y: cy - 40,
          duration: 400,
          ease: 'Back.easeOut'
        });
      });
    });
  }

  _drawCorners(pulseAlpha) {
    const g = this._cornerGraphics;
    g.clear();
    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const cs = 28;

    [[p, p], [w - p, p], [p, h - p], [w - p, h - p]].forEach(([cx, cy]) => {
      const sx = cx === p ? 1 : -1;
      const sy = cy === p ? 1 : -1;
      g.lineStyle(6, 0x00f5ff, 0.05 + pulseAlpha * 0.06);
      g.beginPath();
      g.moveTo(cx + sx * cs, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * cs);
      g.strokePath();
      g.lineStyle(2, 0x00f5ff, 0.4 + pulseAlpha * 0.4);
      g.beginPath();
      g.moveTo(cx + sx * cs, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * cs);
      g.strokePath();
    });
  }

  _tick() {
    const now = this.time.now;

    // ---- STARFIELD TWINKLE ----
    this._starGraphics.clear();
    this._stars.forEach(star => {
      star.x += star.drift;
      if (star.x > CONFIG.CANVAS_WIDTH) star.x = 0;
      if (star.x < 0) star.x = CONFIG.CANVAS_WIDTH;
      const twinkle = 0.5 + 0.5 * Math.sin(now * star.twinkleSpeed + star.twinklePhase);
      this._starGraphics.fillStyle(0xffffff, star.alpha * twinkle);
      this._starGraphics.fillCircle(star.x, star.y, star.r);
    });

    // ---- CORNER PULSE ----
    this._cornerPulse = 0.5 + 0.5 * Math.sin(now / 1200);
    this._drawCorners(this._cornerPulse);

    // ---- TITLE GLOW RING ----
    this._titleRingPulse = 0.5 + 0.5 * Math.sin(now / 900);
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const cy = CONFIG.CANVAS_HEIGHT / 2;
    this._titleRingGraphics.clear();
    this._titleRingGraphics.lineStyle(30, 0x00f5ff, 0.025 + this._titleRingPulse * 0.03);
    this._titleRingGraphics.strokeEllipse(cx, cy - 78, 300, 100);

    // ---- ANIMATED GHOST TRAILS ----
    this._trailGraphics.clear();
    this._trailPaths.forEach(trail => {
      trail.progress = (trail.progress + trail.speed) % 1;
      const pts = trail.pts;
      const totalPts = pts.length - 1;
      const rawT = trail.progress * totalPts;
      const idx = Math.floor(rawT);
      const t = rawT - idx;

      const curr = pts[idx];
      const next = pts[Math.min(idx + 1, totalPts)];
      const hx = curr.x + (next.x - curr.x) * t;
      const hy = curr.y + (next.y - curr.y) * t;

      // Draw full trail path at low alpha
      this._trailGraphics.lineStyle(1.5, trail.color, 0.1);
      this._trailGraphics.beginPath();
      this._trailGraphics.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        this._trailGraphics.lineTo(pts[i].x, pts[i].y);
      }
      this._trailGraphics.strokePath();

      // Draw animated ghost dot
      this._trailGraphics.fillStyle(trail.color, 0.12);
      this._trailGraphics.fillCircle(hx, hy, 18);
      this._trailGraphics.fillStyle(trail.color, 0.55);
      this._trailGraphics.fillCircle(hx, hy, 8);
      this._trailGraphics.fillStyle(0xffffff, 0.25);
      this._trailGraphics.fillCircle(hx - 2, hy - 2, 2.5);
    });

    // ---- DEMO PLAYER (orbiting) ----
    this._demoAngle += 0.018;
    const dorb = this._demoOrbitRadius;
    const dx = cx + Math.cos(this._demoAngle) * dorb;
    const dy = cy - 78 + Math.sin(this._demoAngle) * dorb * 0.45;

    this._demoTrailHistory.push({ x: dx, y: dy });
    if (this._demoTrailHistory.length > 20) this._demoTrailHistory.shift();

    this._demoGraphics.clear();
    this._demoTrailHistory.forEach((pt, i) => {
      const prog = i / this._demoTrailHistory.length;
      this._demoGraphics.fillStyle(CONFIG.PLAYER_COLOR, prog * 0.35);
      this._demoGraphics.fillCircle(pt.x, pt.y, 7 * prog);
    });

    // Glow
    this._demoGraphics.fillStyle(CONFIG.PLAYER_COLOR, 0.1);
    this._demoGraphics.fillCircle(dx, dy, 24);
    // Core
    this._demoGraphics.fillStyle(CONFIG.PLAYER_COLOR, 1);
    this._demoGraphics.fillCircle(dx, dy, 7);
    this._demoGraphics.fillStyle(0xffffff, 0.75);
    this._demoGraphics.fillCircle(dx - 2, dy - 2, 2.5);
  }

  _startGame() {
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });
  }
}
