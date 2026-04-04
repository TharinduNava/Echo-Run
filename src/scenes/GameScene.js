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

    // Background + Arena
    this.arenaGraphics = this.add.graphics();
    this._gridLines = this.add.graphics();
    this._gridOffset = 0; // for animated scan
    this.drawArena();

    // Core Systems
    this.player = new Player(this);
    this.recorder = new Recorder();
    this.ghostManager = new GhostManager(this, this.recorder, this.audioManager);
    this.uiManager = new UIManager(this);

    // Survival Time
    this.survivalTime = 0;
    this.gameStartTime = this.time.now;

    // Move sound throttle
    this._lastMoveSoundTime = 0;
    this._moveSoundInterval = 80;

    // Warning sound throttle
    this._lastWarnSoundTime = 0;
    this._warnSoundInterval = 500;

    // ---- TIME WARP SYSTEM ----
    this.timeWarpAvailable = true;
    this.timeWarpActive = false;
    this._warpCooldownStart = null;
    this._warpGridGraphics = null;
    this._warpChromaticGraphics = null;

    this.input.keyboard.on('keydown-SHIFT', () => {
      if (this.timeWarpAvailable && !this.timeWarpActive && this.state === 'PLAYING') {
        this.activateTimeWarp();
      }
    });

    // Restart inputs
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.state === 'DEAD') this.restartGame();
    });
    this.input.on('pointerdown', () => {
      if (this.state === 'DEAD') this.restartGame();
    });
  }

  // ============================================================
  //  TIME WARP
  // ============================================================
  activateTimeWarp() {
    this.timeWarpActive = true;
    this.timeWarpAvailable = false;
    this._warpCooldownStart = null;

    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;

    // --- 1. CHROMATIC ABERRATION FLASH ---
    this._triggerChromaticFlash();

    // --- 2. CAMERA TINT (subtle cool-blue) ---
    this.cameras.main.setTint(0x88aaff);
    this.time.delayedCall(300, () => {
      this.cameras.main.clearTint();
    });

    // --- 3. GRID RIPPLE ---
    this._triggerGridRipple(cx, cy);

    // --- 4. PLAYER WARP AURA ---
    this.player._warpAura = true;

    // --- 5. UI NOTIFICATION ---
    this._showWarpActivationBanner();

    // End warp after duration
    this.time.delayedCall(CONFIG.TIME_WARP_DURATION, () => {
      this.timeWarpActive = false;
      this.player._warpAura = false;

      // Remove warp grid if still visible
      if (this._warpGridGraphics) {
        this._warpGridGraphics.destroy();
        this._warpGridGraphics = null;
      }

      // Start cooldown
      this._warpCooldownStart = this.time.now;
      this.time.delayedCall(CONFIG.TIME_WARP_COOLDOWN, () => {
        this.timeWarpAvailable = true;
        this._warpCooldownStart = null;
        this._flashWarpReady();
      });
    });
  }

  _triggerChromaticFlash() {
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const cx = w / 2;
    const cy = h / 2;

    // Red channel
    const red = this.add.rectangle(cx - 8, cy, w, h, 0xff0000).setAlpha(0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
    // Green channel
    const grn = this.add.rectangle(cx, cy, w, h, 0x00ff88).setAlpha(0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
    // Blue channel
    const blu = this.add.rectangle(cx + 8, cy, w, h, 0x0044ff).setAlpha(0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);

    // Staggered RGB burst
    [red, grn, blu].forEach((rect, i) => {
      this.tweens.add({
        targets: rect,
        alpha: { from: 0.25, to: 0 },
        duration: 350,
        delay: i * 40,
        ease: 'Power2',
        onComplete: () => rect.destroy()
      });
    });

    // White flash over all
    const flash = this.add.rectangle(cx, cy, w, h, 0xffffff).setAlpha(0.18).setDepth(82);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 250,
      ease: 'Power3',
      onComplete: () => flash.destroy()
    });
  }

  _triggerGridRipple(cx, cy) {
    if (this._warpGridGraphics) this._warpGridGraphics.destroy();

    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;

    const rippleGraphics = this.add.graphics().setDepth(5);
    this._warpGridGraphics = rippleGraphics;

    let rippleRadius = 20;
    let rippleAlpha = 0.9;
    let rippleElapsed = 0;
    const RIPPLE_DURATION = 600;
    const MAX_RADIUS = Math.max(w, h);

    const rippleTicker = this.time.addEvent({
      delay: 16,
      repeat: Math.ceil(RIPPLE_DURATION / 16),
      callback: () => {
        rippleElapsed += 16;
        const progress = rippleElapsed / RIPPLE_DURATION;
        rippleRadius = 20 + (MAX_RADIUS * 0.7) * progress;
        rippleAlpha = 0.9 * (1 - progress);

        rippleGraphics.clear();
        rippleGraphics.lineStyle(2, 0x00ffcc, rippleAlpha);
        // Draw the ripple as a circle emanating from center
        rippleGraphics.strokeCircle(cx, cy, rippleRadius);

        // Secondary ripple (smaller, ahead)
        const r2 = rippleRadius * 0.7;
        rippleGraphics.lineStyle(1, 0x00f5ff, rippleAlpha * 0.5);
        rippleGraphics.strokeCircle(cx, cy, r2);

        if (progress >= 1) {
          rippleGraphics.destroy();
          this._warpGridGraphics = null;
          rippleTicker.destroy();
        }
      }
    });
  }

  _showWarpActivationBanner() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const banner = this.add.text(cx, 80, 'T I M E  W A R P', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '20px',
      color: '#00ffcc',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    this.tweens.add({
      targets: banner,
      alpha: { from: 0, to: 1 },
      y: { from: 100, to: 80 },
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          y: 60,
          duration: 400,
          delay: CONFIG.TIME_WARP_DURATION - 400,
          ease: 'Power2',
          onComplete: () => banner.destroy()
        });
      }
    });
  }

  _flashWarpReady() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const flash = this.add.text(cx, 80, 'WARP READY', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '14px',
      color: '#00f5ff',
      align: 'center'
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    this.tweens.add({
      targets: flash,
      alpha: { from: 0, to: 0.9 },
      duration: 200,
      yoyo: true,
      repeat: 1,
      onComplete: () => flash.destroy()
    });
  }

  // ============================================================
  //  ARENA DRAWING
  // ============================================================
  drawArena() {
    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;

    this.arenaGraphics.clear();

    // Deep background
    this.arenaGraphics.fillStyle(0x060d1a, 1);
    this.arenaGraphics.fillRect(0, 0, w, h);

    // Subtle inner area tint
    this.arenaGraphics.fillStyle(0x0a1628, 1);
    this.arenaGraphics.fillRect(p, p, w - p * 2, h - p * 2);

    // Grid lines
    this._drawGrid();

    // Arena border (double stroke for depth)
    this.arenaGraphics.lineStyle(1, 0x1e3a5f, 0.6);
    this.arenaGraphics.strokeRect(p + 2, p + 2, w - p * 2 - 4, h - p * 2 - 4);
    this.arenaGraphics.lineStyle(2, 0x2a5080, 1);
    this.arenaGraphics.strokeRect(p, p, w - p * 2, h - p * 2);

    // Corner accents — longer brackets with glow
    const cs = 28;
    [[p, p], [w - p, p], [p, h - p], [w - p, h - p]].forEach(([cx, cy]) => {
      const sx = cx === p ? 1 : -1;
      const sy = cy === p ? 1 : -1;
      // Glow (thick, low alpha)
      this.arenaGraphics.lineStyle(6, 0x00f5ff, 0.08);
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(cx + sx * cs, cy);
      this.arenaGraphics.lineTo(cx, cy);
      this.arenaGraphics.lineTo(cx, cy + sy * cs);
      this.arenaGraphics.strokePath();
      // Bright line
      this.arenaGraphics.lineStyle(2, 0x00f5ff, 0.6);
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(cx + sx * cs, cy);
      this.arenaGraphics.lineTo(cx, cy);
      this.arenaGraphics.lineTo(cx, cy + sy * cs);
      this.arenaGraphics.strokePath();
    });

    // Center crosshair (spatial reference)
    const ccx = w / 2;
    const ccy = h / 2;
    const chs = 12;
    this.arenaGraphics.lineStyle(1, 0x1e3a5f, 0.4);
    this.arenaGraphics.beginPath();
    this.arenaGraphics.moveTo(ccx - chs, ccy);
    this.arenaGraphics.lineTo(ccx + chs, ccy);
    this.arenaGraphics.strokePath();
    this.arenaGraphics.beginPath();
    this.arenaGraphics.moveTo(ccx, ccy - chs);
    this.arenaGraphics.lineTo(ccx, ccy + chs);
    this.arenaGraphics.strokePath();
    this.arenaGraphics.fillStyle(0x1e3a5f, 0.35);
    this.arenaGraphics.fillCircle(ccx, ccy, 3);
  }

  _drawGrid() {
    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    const gridSize = 60;

    this._gridLines.clear();
    this._gridLines.lineStyle(1, 0x1e3a5f, 0.22);

    for (let x = p + gridSize; x < w - p; x += gridSize) {
      this._gridLines.beginPath();
      this._gridLines.moveTo(x, p);
      this._gridLines.lineTo(x, h - p);
      this._gridLines.strokePath();
    }
    for (let y = p + gridSize; y < h - p; y += gridSize) {
      this._gridLines.beginPath();
      this._gridLines.moveTo(p, y);
      this._gridLines.lineTo(w - p, y);
      this._gridLines.strokePath();
    }
  }

  // ============================================================
  //  MAIN UPDATE
  // ============================================================
  update(time, delta) {
    if (this.state !== 'PLAYING') return;

    const timeWarpMultiplier = this.timeWarpActive ? CONFIG.TIME_WARP_GHOST_MULT : 1;
    const playerTimeWarpMultiplier = this.timeWarpActive ? CONFIG.TIME_WARP_PLAYER_MULT : 1;

    this.player.update(delta * playerTimeWarpMultiplier);
    this.recorder.record(this.player.x, this.player.y);
    this.ghostManager.update(timeWarpMultiplier);

    this.survivalTime = this.time.now - this.gameStartTime;

    // Work out warp cooldown progress (0 = not cooling, 1 = ready)
    let warpCooldownProgress = 1;
    if (!this.timeWarpAvailable && this._warpCooldownStart !== null) {
      const elapsed = this.time.now - this._warpCooldownStart;
      warpCooldownProgress = Math.min(1, elapsed / CONFIG.TIME_WARP_COOLDOWN);
    } else if (this.timeWarpActive) {
      warpCooldownProgress = 0;
    }

    let timeUntilNextGhost = 0;
    if (this.ghostManager.ghostCount === 0) {
      timeUntilNextGhost = CONFIG.GHOST_DELAY - this.survivalTime;
    }
    this.uiManager.update(
      this.survivalTime,
      this.ghostManager.ghostCount,
      timeUntilNextGhost,
      this.timeWarpAvailable,
      this.timeWarpActive,
      warpCooldownProgress
    );

    // Move sound
    if ((this.player.vx !== 0 || this.player.vy !== 0) &&
        this.time.now - this._lastMoveSoundTime > this._moveSoundInterval) {
      this.audioManager.playMove();
      this._lastMoveSoundTime = this.time.now;
    }

    // Proximity warning + danger glow
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

    // Collision
    const hitGhost = CollisionSystem.check(this.player, this.ghostManager.getAllGhosts());
    if (hitGhost) {
      this.onDeath(hitGhost);
    }
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

    // Full-screen flash
    const flash = this.add.rectangle(
      CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2,
      CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT,
      0xffffff
    ).setAlpha(0.9).setDepth(100);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => flash.destroy()
    });

    // Red tint pulse
    const redFlash = this.add.rectangle(
      CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2,
      CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT,
      0xff0000
    ).setAlpha(0).setDepth(99);
    this.tweens.add({
      targets: redFlash,
      alpha: { from: 0.4, to: 0 },
      duration: 600,
      delay: 100,
      ease: 'Power2',
      onComplete: () => redFlash.destroy()
    });

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

    // Backdrop panel with border
    const panelW = 420, panelH = 300;
    const panel = this.add.graphics().setDepth(90);
    panel.fillStyle(0x000000, 0.75);
    panel.fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 12);
    panel.lineStyle(1, 0x2a5080, 0.9);
    panel.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 12);
    // Corner accent on panel
    panel.lineStyle(2, 0xff3355, 0.7);
    panel.strokeRoundedRect(cx - panelW / 2 + 4, cy - panelH / 2 + 4, panelW - 8, panelH - 8, 10);

    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 300, ease: 'Power2' });

    // Glitch title helper
    const glitchTitle = (text, yPos, delay) => {
      const el = this.add.text(cx, yPos, ''.padStart(text.length, '█'), {
        fontFamily: 'Orbitron, monospace',
        fontSize: '28px',
        color: CONFIG.COLOR_DANGER,
        align: 'center'
      }).setOrigin(0.5).setDepth(95).setAlpha(0);

      this.time.delayedCall(delay, () => {
        el.setAlpha(1);
        const glitchChars = '▓▒░█▀■□▪▫';
        let glitchProgress = 0;
        const glitchTimer = this.time.addEvent({
          delay: 40,
          repeat: 12,
          callback: () => {
            glitchProgress++;
            const revealCount = Math.floor((glitchProgress / 12) * text.length);
            const revealed = text.substring(0, revealCount);
            const scrambled = Array.from({ length: text.length - revealCount }, () =>
              glitchChars[Math.floor(Math.random() * glitchChars.length)]
            ).join('');
            el.setText(revealed + scrambled);
          }
        });
      });
      return el;
    };

    glitchTitle('ECHO TERMINATED', cy - 100, 200);

    // Stats — slide up from below
    const statItems = [
      { text: `SURVIVED: ${(this.survivalTime / 1000).toFixed(2)}s`, color: CONFIG.COLOR_WHITE, delay: 550, fontSize: '20px' },
      { text: `ECHOES: ${this.ghostManager.ghostCount}`, color: CONFIG.COLOR_PURPLE, delay: 700, fontSize: '16px' },
    ];

    const best = localStorage.getItem('echorun_best') || '0';
    const isNewBest = this.survivalTime > parseFloat(best);
    if (isNewBest) {
      localStorage.setItem('echorun_best', this.survivalTime);
      statItems.push({ text: '✦  NEW BEST  ✦', color: '#ffd700', delay: 850, fontSize: '15px' });
    } else {
      const bestSec = (parseFloat(best) / 1000).toFixed(2);
      statItems.push({ text: `BEST: ${bestSec}s`, color: '#888888', delay: 850, fontSize: '14px' });
    }

    statItems.forEach(({ text, color, delay, fontSize }, i) => {
      const el = this.add.text(cx, cy - 30 + i * 38, text, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize,
        color,
        align: 'center'
      }).setOrigin(0.5).setDepth(95).setAlpha(0).setPosition(cx, cy - 10 + i * 38);

      this.time.delayedCall(delay, () => {
        this.tweens.add({
          targets: el,
          alpha: 1,
          y: cy - 30 + i * 38,
          duration: 300,
          ease: 'Back.easeOut'
        });
      });
    });

    // Restart prompt
    const prompt = this.add.text(cx, cy + 120, 'SPACE  /  TAP TO RESTART', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '13px',
      color: CONFIG.COLOR_CYAN,
      align: 'center'
    }).setOrigin(0.5).setDepth(95).setAlpha(0);

    this.time.delayedCall(1050, () => {
      prompt.setAlpha(1);
      this.tweens.add({
        targets: prompt, alpha: 0.1, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    });
  }

  restartGame() {
    this.scene.restart();
  }
}
