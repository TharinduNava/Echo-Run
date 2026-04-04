import { CONFIG } from '../config/GameConfig.js';
import { Player } from '../entities/Player.js';
import { Recorder } from '../systems/Recorder.js';
import { GhostManager } from '../systems/GhostManager.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { UIManager } from '../ui/UIManager.js';
import { DeathEffect } from '../effects/DeathEffect.js';
import { AudioManager } from '../systems/AudioManager.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.state = 'PLAYING';

    // Audio
    this.audioManager = new AudioManager();
    this.input.on('pointerdown', () => this.audioManager.resume());
    this.input.keyboard.on('keydown', () => this.audioManager.resume());

    // Background layers
    this._bgGraphics   = this.add.graphics().setDepth(0);
    this._gridGraphics = this.add.graphics().setDepth(1);
    this._arenaGraphics = this.add.graphics().setDepth(2);
    this._ambientGraphics = this.add.graphics().setDepth(3);

    this._drawBackground();
    this._drawGrid();
    this._drawArenaFrame();

    // Ambient floating particles
    this._ambientParticles = this._createAmbientParticles();
    this._ambientTick = 0;

    // Warp overlay (persistent during active warp)
    this._warpOverlay = null;
    this._warpScanLine = null;

    // Core
    this.player = new Player(this);
    this.recorder = new Recorder();
    this.ghostManager = new GhostManager(this, this.recorder, this.audioManager);
    this.uiManager = new UIManager(this);

    this.survivalTime = 0;
    this.gameStartTime = this.time.now;

    this._lastMoveSoundTime = 0;
    this._moveSoundInterval = 80;
    this._lastWarnSoundTime = 0;
    this._warnSoundInterval = 500;

    // Time Warp state
    this.timeWarpAvailable = true;
    this.timeWarpActive    = false;
    this._warpCooldownStart = null;
    this._warpGridGraphics  = null;

    this.input.keyboard.on('keydown-SHIFT', () => {
      if (this.timeWarpAvailable && !this.timeWarpActive && this.state === 'PLAYING') {
        this.activateTimeWarp();
      }
    });

    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.state === 'DEAD') this.restartGame();
    });
    this.input.on('pointerdown', () => {
      if (this.state === 'DEAD') this.restartGame();
    });
  }

  // ============================================================
  //  BACKGROUND & ARENA
  // ============================================================
  _drawBackground() {
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;
    const g  = this._bgGraphics;
    g.clear();

    // Base fill
    g.fillStyle(0x040b14, 1);
    g.fillRect(0, 0, w, h);

    // Radial vignette: concentric ovals, darker at edges
    const STEPS = 8;
    for (let i = STEPS; i >= 0; i--) {
      const t = i / STEPS;
      const alpha = (1 - t) * 0.55; // dark at edges
      g.fillStyle(0x000000, alpha);
      g.fillEllipse(cx, cy, w * (0.4 + t * 0.8), h * (0.4 + t * 0.8));
    }

    // Subtle inner arena glow (brighter centre)
    const p = CONFIG.ARENA_PADDING;
    for (let i = 5; i >= 1; i--) {
      const t = i / 5;
      g.fillStyle(0x0a1e35, t * 0.35);
      g.fillRect(
        p + (w - p * 2) * (1 - t) * 0.3,
        p + (h - p * 2) * (1 - t) * 0.3,
        (w - p * 2) * (0.4 + t * 0.6),
        (h - p * 2) * (0.4 + t * 0.6)
      );
    }
  }

  _drawGrid() {
    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const g = this._gridGraphics;
    g.clear();
    g.lineStyle(1, 0x1e3a5f, 0.25);
    const gridSize = 60;
    for (let x = p + gridSize; x < w - p; x += gridSize) {
      g.beginPath(); g.moveTo(x, p); g.lineTo(x, h - p); g.strokePath();
    }
    for (let y = p + gridSize; y < h - p; y += gridSize) {
      g.beginPath(); g.moveTo(p, y); g.lineTo(w - p, y); g.strokePath();
    }
  }

  _drawArenaFrame() {
    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;
    const g  = this._arenaGraphics;
    g.clear();

    // Inner glow border (thick, soft)
    g.lineStyle(12, 0x00f5ff, 0.05);
    g.strokeRect(p, p, w - p * 2, h - p * 2);
    // Outer stroke
    g.lineStyle(1, 0x1e3a5f, 0.7);
    g.strokeRect(p + 3, p + 3, w - p * 2 - 6, h - p * 2 - 6);
    // Main border
    g.lineStyle(2, 0x2a5a80, 1);
    g.strokeRect(p, p, w - p * 2, h - p * 2);

    // Corner brackets
    const cs = 32;
    [[p, p], [w - p, p], [p, h - p], [w - p, h - p]].forEach(([bx, by]) => {
      const sx = bx === p ? 1 : -1;
      const sy = by === p ? 1 : -1;
      // Glow
      g.lineStyle(8, 0x00f5ff, 0.12);
      g.beginPath(); g.moveTo(bx + sx * cs, by); g.lineTo(bx, by); g.lineTo(bx, by + sy * cs); g.strokePath();
      // Bright line
      g.lineStyle(2.5, 0x00f5ff, 0.8);
      g.beginPath(); g.moveTo(bx + sx * cs, by); g.lineTo(bx, by); g.lineTo(bx, by + sy * cs); g.strokePath();
      // Inner tip dots
      g.fillStyle(0x00f5ff, 0.9);
      g.fillCircle(bx, by, 3);
    });

    // Center crosshair
    const chs = 14;
    g.lineStyle(1, 0x2a5a80, 0.5);
    g.beginPath(); g.moveTo(cx - chs, cy); g.lineTo(cx + chs, cy); g.strokePath();
    g.beginPath(); g.moveTo(cx, cy - chs); g.lineTo(cx, cy + chs); g.strokePath();
    g.fillStyle(0x2a5a80, 0.5);
    g.fillCircle(cx, cy, 2.5);
  }

  _createAmbientParticles() {
    const p    = CONFIG.ARENA_PADDING + 10;
    const w    = CONFIG.CANVAS_WIDTH;
    const h    = CONFIG.CANVAS_HEIGHT;
    const particles = [];
    for (let i = 0; i < 35; i++) {
      particles.push({
        x: p + Math.random() * (w - p * 2),
        y: p + Math.random() * (h - p * 2),
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.25 + 0.05,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() > 0.6 ? 0xa855f7 : 0x00f5ff
      });
    }
    return particles;
  }

  _updateAmbientParticles(dt) {
    const p = CONFIG.ARENA_PADDING + 5;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const g = this._ambientGraphics;
    const now = this.time.now;
    g.clear();

    this._ambientParticles.forEach(pt => {
      pt.x += pt.vx;
      pt.y += pt.vy;
      // Wrap within arena
      if (pt.x < p) pt.x = w - p;
      if (pt.x > w - p) pt.x = p;
      if (pt.y < p) pt.y = h - p;
      if (pt.y > h - p) pt.y = p;

      const twinkle = 0.5 + 0.5 * Math.sin(now * 0.001 + pt.phase);
      g.fillStyle(pt.color, pt.alpha * twinkle);
      g.fillCircle(pt.x, pt.y, pt.r);
    });
  }

  // ============================================================
  //  TIME WARP
  // ============================================================
  activateTimeWarp() {
    this.timeWarpActive    = true;
    this.timeWarpAvailable = false;
    this._warpCooldownStart = null;

    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;

    // --- 1. CHROMATIC ABERRATION FLASH ---
    this._triggerChromaticFlash();

    // --- 2. PERSISTENT WARP OVERLAY (full duration) ---
    // This is the main "it's active" visual — a constant screen effect
    const warpRect = this.add.rectangle(cx, cy, w, h, 0x001122).setDepth(35).setAlpha(0);
    this.tweens.add({ targets: warpRect, alpha: 0.18, duration: 300, ease: 'Power2' });
    this._warpOverlay = warpRect;

    // Animated horizontal scan lines during warp
    this._warpScanLine = this.add.graphics().setDepth(36);
    this._warpScanTick = 0;

    // --- 3. GRID RIPPLE ---
    this._triggerGridRipple(cx, cy);

    // --- 4. PLAYER WARP AURA ---
    this.player._warpAura = true;

    // --- 5. ACTIVATION BANNER ---
    this._showWarpActivationBanner();

    // End after duration
    this.time.delayedCall(CONFIG.TIME_WARP_DURATION, () => {
      this.timeWarpActive    = false;
      this.player._warpAura  = false;

      // Fade out overlay
      if (this._warpOverlay) {
        this.tweens.add({
          targets: this._warpOverlay,
          alpha: 0,
          duration: 400,
          onComplete: () => { this._warpOverlay && this._warpOverlay.destroy(); this._warpOverlay = null; }
        });
      }
      if (this._warpScanLine) {
        this._warpScanLine.destroy();
        this._warpScanLine = null;
      }
      if (this._warpGridGraphics) {
        this._warpGridGraphics.destroy();
        this._warpGridGraphics = null;
      }

      this._warpCooldownStart = this.time.now;
      this.time.delayedCall(CONFIG.TIME_WARP_COOLDOWN, () => {
        this.timeWarpAvailable = true;
        this._warpCooldownStart = null;
        this._flashWarpReady();
      });
    });
  }

  _updateWarpScanLines() {
    if (!this._warpScanLine) return;
    const g = this._warpScanLine;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const now = this.time.now;
    g.clear();

    // Moving horizontal scan lines
    const lineSpacing = 18;
    const movingOffset = (now * 0.08) % lineSpacing;
    g.lineStyle(1, 0x00ffcc, 0.08);
    for (let y = movingOffset; y < h; y += lineSpacing) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.strokePath();
    }

    // Slow vertical blue shimmering bands
    const bandX = (Math.sin(now * 0.0015) * 0.5 + 0.5) * w;
    // Left band
    g.fillStyle(0x0044ff, 0.04);
    g.fillRect(bandX - 80, 0, 160, h);
    // Chromatic fringe at edges
    g.fillStyle(0xff0000, 0.025);
    g.fillRect(0, 0, 6, h);
    g.fillStyle(0x0000ff, 0.025);
    g.fillRect(w - 6, 0, 6, h);
  }

  _triggerChromaticFlash() {
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;

    const red = this.add.rectangle(cx - 10, cy, w + 10, h, 0xff0000).setAlpha(0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
    const blu = this.add.rectangle(cx + 10, cy, w + 10, h, 0x0044ff).setAlpha(0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
    [red, blu].forEach((r, i) => {
      this.tweens.add({
        targets: r,
        alpha: { from: 0.3, to: 0 },
        duration: 400,
        delay: i * 50,
        ease: 'Power3',
        onComplete: () => r.destroy()
      });
    });
    const flash = this.add.rectangle(cx, cy, w, h, 0xffffff).setAlpha(0.2).setDepth(82);
    this.tweens.add({ targets: flash, alpha: 0, duration: 200, ease: 'Power3', onComplete: () => flash.destroy() });
  }

  _triggerGridRipple(cx, cy) {
    if (this._warpGridGraphics) this._warpGridGraphics.destroy();
    const ripple = this.add.graphics().setDepth(6);
    this._warpGridGraphics = ripple;
    let elapsed = 0;

    const ticker = this.time.addEvent({
      delay: 16,
      repeat: Math.ceil(700 / 16),
      callback: () => {
        elapsed += 16;
        const progress = elapsed / 700;
        const rad = 20 + Math.max(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT) * 0.85 * progress;
        const alpha = 0.85 * (1 - progress);
        ripple.clear();
        ripple.lineStyle(2.5, 0x00ffcc, alpha);
        ripple.strokeCircle(cx, cy, rad);
        ripple.lineStyle(1.5, 0x00f5ff, alpha * 0.5);
        ripple.strokeCircle(cx, cy, rad * 0.65);
        if (progress >= 1) { ripple.destroy(); this._warpGridGraphics = null; ticker.destroy(); }
      }
    });
  }

  _showWarpActivationBanner() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const banner = this.add.text(cx, 78, '⟳  T I M E   W A R P  ⟳', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '18px',
      color: '#00ffcc',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    this.tweens.add({
      targets: banner,
      alpha: 1,
      y: { from: 95, to: 78 },
      duration: 220,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Pulse the banner while warp is active
        this.tweens.add({
          targets: banner,
          alpha: 0.4,
          duration: 500,
          yoyo: true,
          repeat: Math.floor(CONFIG.TIME_WARP_DURATION / 1000) + 1,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.tweens.add({
              targets: banner, alpha: 0, y: 60, duration: 300,
              ease: 'Power2', onComplete: () => banner.destroy()
            });
          }
        });
      }
    });
  }

  _flashWarpReady() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const flash = this.add.text(cx, 78, 'WARP READY', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '13px',
      color: '#00f5ff',
      align: 'center'
    }).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: flash, alpha: { from: 0, to: 1 }, duration: 200, yoyo: true, repeat: 1, onComplete: () => flash.destroy() });
  }

  // ============================================================
  //  UPDATE
  // ============================================================
  update(time, delta) {
    if (this.state !== 'PLAYING') return;

    const timeWarpMultiplier       = this.timeWarpActive ? CONFIG.TIME_WARP_GHOST_MULT  : 1;
    const playerTimeWarpMultiplier = this.timeWarpActive ? CONFIG.TIME_WARP_PLAYER_MULT : 1;

    this.player.update(delta * playerTimeWarpMultiplier);
    this.recorder.record(this.player.x, this.player.y);
    this.ghostManager.update(timeWarpMultiplier);

    this.survivalTime = this.time.now - this.gameStartTime;

    // Ambient particles
    this._updateAmbientParticles(delta);

    // Warp scan lines (while warp active)
    if (this.timeWarpActive) this._updateWarpScanLines();

    // Cooldown progress
    let warpCooldownProgress = 1;
    if (!this.timeWarpAvailable && this._warpCooldownStart !== null) {
      warpCooldownProgress = Math.min(1, (this.time.now - this._warpCooldownStart) / CONFIG.TIME_WARP_COOLDOWN);
    } else if (this.timeWarpActive) {
      warpCooldownProgress = 0;
    }

    let timeUntilNextGhost = 0;
    if (this.ghostManager.ghostCount === 0) {
      timeUntilNextGhost = CONFIG.GHOST_DELAY - this.survivalTime;
    }
    this.uiManager.update(
      this.survivalTime, this.ghostManager.ghostCount,
      timeUntilNextGhost, this.timeWarpAvailable,
      this.timeWarpActive, warpCooldownProgress
    );

    // Move sound
    if ((this.player.vx !== 0 || this.player.vy !== 0) &&
        this.time.now - this._lastMoveSoundTime > this._moveSoundInterval) {
      this.audioManager.playMove();
      this._lastMoveSoundTime = this.time.now;
    }

    // Proximity danger
    const WARN_DISTANCE = 65;
    let anyNear = false;
    this.ghostManager.getAllGhosts().forEach(ghost => {
      const dx = this.player.x - ghost.x;
      const dy = this.player.y - ghost.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < WARN_DISTANCE) {
        ghost.setDangerIntensity(1 - (dist / WARN_DISTANCE));
        anyNear = true;
      } else {
        ghost.setDangerIntensity(0);
      }
    });

    if (anyNear && this.time.now - this._lastWarnSoundTime > this._warnSoundInterval) {
      this.audioManager.playWarning();
      this._lastWarnSoundTime = this.time.now;
    }

    const hitGhost = CollisionSystem.check(this.player, this.ghostManager.getAllGhosts());
    if (hitGhost) this.onDeath(hitGhost);
  }

  // ============================================================
  //  DEATH
  // ============================================================
  onDeath(ghost) {
    if (this.state !== 'PLAYING') return;
    this.state = 'DYING';

    this.audioManager.playDeath();
    this.ghostManager.stop();
    this.player.kill();

    DeathEffect.play(this, this.player.x, this.player.y);
    this.ghostManager.getAllGhosts().forEach(g => g.flashDanger());

    const cx = CONFIG.CANVAS_WIDTH / 2;
    const cy = CONFIG.CANVAS_HEIGHT / 2;

    const flash = this.add.rectangle(cx, cy, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT, 0xffffff)
      .setAlpha(0.9).setDepth(100);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, ease: 'Power2', onComplete: () => flash.destroy() });

    const redPulse = this.add.rectangle(cx, cy, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT, 0xff0000)
      .setAlpha(0).setDepth(99);
    this.tweens.add({ targets: redPulse, alpha: { from: 0.45, to: 0 }, duration: 700, delay: 80, ease: 'Power2', onComplete: () => redPulse.destroy() });

    this.cameras.main.shake(CONFIG.SCREEN_SHAKE_MS, CONFIG.SCREEN_SHAKE_INT / 1000);

    this.time.delayedCall(CONFIG.DEATH_HOLD_MS, () => {
      this.state = 'DEAD';
      this.showDeathScreen();
    });
  }

  // ============================================================
  //  DEATH SCREEN
  // ============================================================
  showDeathScreen() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const cy = CONFIG.CANVAS_HEIGHT / 2;

    const panelW = 430, panelH = 310;
    const panel = this.add.graphics().setDepth(90).setAlpha(0);
    panel.fillStyle(0x000000, 0.82);
    panel.fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 14);
    panel.lineStyle(1, 0x2a5080, 0.9);
    panel.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 14);
    panel.lineStyle(2, 0xff3355, 0.8);
    panel.strokeRoundedRect(cx - panelW / 2 + 4, cy - panelH / 2 + 4, panelW - 8, panelH - 8, 11);
    this.tweens.add({ targets: panel, alpha: 1, duration: 350, ease: 'Power2' });

    // Glitch title
    const glitchStr = '█▓▒░▀■□▪▫';
    const titleEl = this.add.text(cx, cy - 105, ''.padStart(16, '█'), {
      fontFamily: 'Orbitron, monospace', fontSize: '28px', color: CONFIG.COLOR_DANGER, align: 'center'
    }).setOrigin(0.5).setDepth(95).setAlpha(0);

    this.time.delayedCall(220, () => {
      titleEl.setAlpha(1);
      let step = 0;
      const TARGET = 'ECHO TERMINATED';
      const t = this.time.addEvent({
        delay: 45, repeat: 14, callback: () => {
          step++;
          const n = Math.floor((step / 14) * TARGET.length);
          titleEl.setText(TARGET.substring(0, n) + Array.from({ length: TARGET.length - n }, () => glitchStr[Math.floor(Math.random() * glitchStr.length)]).join(''));
        }
      });
    });

    const best = localStorage.getItem('echorun_best') || '0';
    const isNewBest = this.survivalTime > parseFloat(best);
    if (isNewBest) localStorage.setItem('echorun_best', this.survivalTime);

    const stats = [
      { text: `SURVIVED: ${(this.survivalTime / 1000).toFixed(2)}s`, color: CONFIG.COLOR_WHITE, fontSize: '20px' },
      { text: `ECHOES: ${this.ghostManager.ghostCount}`, color: CONFIG.COLOR_PURPLE, fontSize: '16px' },
      { text: isNewBest ? '✦  NEW BEST  ✦' : `BEST: ${(parseFloat(best) / 1000).toFixed(2)}s`, color: isNewBest ? '#ffd700' : '#667788', fontSize: '15px' },
    ];

    stats.forEach(({ text, color, fontSize }, i) => {
      const el = this.add.text(cx, cy - 30 + i * 40, text, {
        fontFamily: 'Share Tech Mono, monospace', fontSize, color, align: 'center'
      }).setOrigin(0.5).setDepth(95).setAlpha(0).setY(cy - 10 + i * 40);

      this.time.delayedCall(500 + i * 160, () => {
        this.tweens.add({ targets: el, alpha: 1, y: cy - 30 + i * 40, duration: 280, ease: 'Back.easeOut' });
      });
    });

    const prompt = this.add.text(cx, cy + 125, 'SPACE  /  TAP TO RESTART', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '13px', color: CONFIG.COLOR_CYAN, align: 'center'
    }).setOrigin(0.5).setDepth(95).setAlpha(0);

    this.time.delayedCall(1000, () => {
      prompt.setAlpha(1);
      this.tweens.add({ targets: prompt, alpha: 0.1, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  }

  restartGame() {
    this.scene.restart();
  }
}
