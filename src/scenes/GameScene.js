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
    
    // Un-suspend Audio on first input
    this.input.on('pointerdown', () => this.audioManager.resume());
    this.input.keyboard.on('keydown', () => this.audioManager.resume());

    // Draw arena & setup
    this.arenaGraphics = this.add.graphics();
    this.drawArena();

    // Core Systems
    this.player = new Player(this);
    this.recorder = new Recorder();
    this.ghostManager = new GhostManager(this, this.recorder, this.audioManager);
    this.uiManager = new UIManager(this);

    // Survival Time
    this.survivalTime = 0;
    this.gameStartTime = this.time.now;

    // Advanced: Time Warp System
    this.timeWarpAvailable = true;
    this.timeWarpActive = false;
    this.timeWarpCooldown = 8000;

    this.input.keyboard.on('keydown-SHIFT', () => {
      if (this.timeWarpAvailable && !this.timeWarpActive && this.state === 'PLAYING') {
        this.activateTimeWarp();
      }
    });

    // Inputs for Restart
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.state === 'DEAD') {
        this.restartGame();
      }
    });
    this.input.on('pointerdown', () => {
      if (this.state === 'DEAD') {
        this.restartGame();
      }
    });
  }

  activateTimeWarp() {
    this.timeWarpActive = true;
    this.timeWarpAvailable = false;
    
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;
    
    // Time warp visual effect 
    const warpOverlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000)
      .setAlpha(0)
      .setDepth(40)
      .setBlendMode(Phaser.BlendModes.COLOR);
      
    this.tweens.add({
      targets: warpOverlay,
      alpha: 0.5,
      yoyo: true,
      hold: 2000,
      duration: 300,
      onComplete: () => warpOverlay.destroy()
    });

    this.time.delayedCall(2000, () => {
      this.timeWarpActive = false;
      this.time.delayedCall(this.timeWarpCooldown, () => {
        this.timeWarpAvailable = true;
      });
    });
  }

  drawArena() {
    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;

    this.arenaGraphics.clear();
    // Background fill
    this.arenaGraphics.fillStyle(0x0f172a, 1);
    this.arenaGraphics.fillRect(0, 0, w, h);

    // Grid details
    this.arenaGraphics.lineStyle(1, 0x1e3a5f, 0.3);
    const gridSize = 60;
    for (let x = p + gridSize; x < w - p; x += gridSize) {
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(x, p);
      this.arenaGraphics.lineTo(x, h - p);
      this.arenaGraphics.strokePath();
    }
    for (let y = p + gridSize; y < h - p; y += gridSize) {
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(p, y);
      this.arenaGraphics.lineTo(w - p, y);
      this.arenaGraphics.strokePath();
    }

    // Arena border
    this.arenaGraphics.lineStyle(2, 0x1e3a5f, 1);
    this.arenaGraphics.strokeRect(p, p, w - p * 2, h - p * 2);
    // Corner accents
    this.arenaGraphics.lineStyle(3, 0x00f5ff, 0.3);
    const cs = 20; // corner size
    [[p, p], [w-p, p], [p, h-p], [w-p, h-p]].forEach(([cx, cy]) => {
      const sx = cx === p ? 1 : -1;
      const sy = cy === p ? 1 : -1;
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(cx + sx * cs, cy);
      this.arenaGraphics.lineTo(cx, cy);
      this.arenaGraphics.lineTo(cx, cy + sy * cs);
      this.arenaGraphics.strokePath();
    });
  }

  update(time, delta) {
    if (this.state !== 'PLAYING') return;

    // Time warp slows player slightly, slows ghosts immensely (30%)
    const timeWarpMultiplier = this.timeWarpActive ? 0.3 : 1;
    const playerTimeWarpMultiplier = this.timeWarpActive ? 0.7 : 1; 

    // Update Entities
    this.player.update(delta * playerTimeWarpMultiplier);
    this.recorder.record(this.player.x, this.player.y);
    this.ghostManager.update(timeWarpMultiplier);

    // Update time 
    this.survivalTime = this.time.now - this.gameStartTime;

    // Update UI 
    let timeUntilNextGhost = 0;
    if (this.ghostManager.ghostCount === 0) {
      timeUntilNextGhost = CONFIG.GHOST_DELAY - this.survivalTime;
    }
    this.uiManager.update(this.survivalTime, this.ghostManager.ghostCount, timeUntilNextGhost);

    // Check Audio Move 
    if (this.player.vx !== 0 || this.player.vy !== 0) {
      this.audioManager.playMove(); // Too frequent depending on game, skipped for now or throttled
    }

    // Check Collisions
    const hitGhost = CollisionSystem.check(this.player, this.ghostManager.getAllGhosts());
    if (hitGhost) {
      this.onDeath(hitGhost);
    }
  }

  onDeath(ghost) {
    if (this.state !== 'PLAYING') return;
    this.state = 'DYING';

    this.audioManager.playDeath();
    this.ghostManager.stop();
    this.player.kill();

    // Death Visuals
    DeathEffect.play(this, this.player.x, this.player.y);
    this.ghostManager.getAllGhosts().forEach(g => g.flashDanger());

    const flash = this.add.rectangle(
      CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2,
      CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT,
      0xffffff
    ).setAlpha(0.8).setDepth(100);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy()
    });

    this.cameras.main.shake(CONFIG.SCREEN_SHAKE_MS, CONFIG.SCREEN_SHAKE_INT / 1000);

    // Transition to dead state
    this.time.delayedCall(CONFIG.DEATH_HOLD_MS, () => {
      this.state = 'DEAD';
      this.showDeathScreen();
    });
  }

  showDeathScreen() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const cy = CONFIG.CANVAS_HEIGHT / 2;

    const overlay = this.add.rectangle(cx, cy, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT, 0x000000, 0.6).setDepth(90);

    this.add.text(cx, cy - 80, 'ECHO TERMINATED', {
      fontFamily: 'monospace', fontSize: '32px', color: CONFIG.COLOR_DANGER, align: 'center'
    }).setOrigin(0.5).setDepth(91);

    const seconds = (this.survivalTime / 1000).toFixed(2);
    this.add.text(cx, cy - 20, `SURVIVED: ${seconds}s`, {
      fontFamily: 'monospace', fontSize: '22px', color: CONFIG.COLOR_WHITE, align: 'center'
    }).setOrigin(0.5).setDepth(91);

    this.add.text(cx, cy + 20, `GHOSTS: ${this.ghostManager.ghostCount}`, {
      fontFamily: 'monospace', fontSize: '18px', color: CONFIG.COLOR_PURPLE, align: 'center'
    }).setOrigin(0.5).setDepth(91);

    const best = localStorage.getItem('echorun_best') || '0';
    const bestSec = (parseFloat(best) / 1000).toFixed(2);
    
    if (this.survivalTime > parseFloat(best)) {
      localStorage.setItem('echorun_best', this.survivalTime);
      this.add.text(cx, cy + 60, '✦ NEW BEST ✦', {
        fontFamily: 'monospace', fontSize: '16px', color: '#ffd700', align: 'center'
      }).setOrigin(0.5).setDepth(91);
    } else {
      this.add.text(cx, cy + 60, `BEST: ${bestSec}s`, {
        fontFamily: 'monospace', fontSize: '16px', color: '#888888', align: 'center'
      }).setOrigin(0.5).setDepth(91);
    }

    const prompt = this.add.text(cx, cy + 110, 'SPACE / TAP TO RESTART', {
      fontFamily: 'monospace', fontSize: '14px', color: CONFIG.COLOR_CYAN, align: 'center'
    }).setOrigin(0.5).setDepth(91);

    this.tweens.add({
      targets: prompt, alpha: 0, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  restartGame() {
    this.scene.restart();
  }
}
