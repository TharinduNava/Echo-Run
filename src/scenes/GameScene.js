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

    this.audioManager = new AudioManager();
    this.input.on('pointerdown', () => this.audioManager.resume());
    this.input.keyboard.on('keydown', () => this.audioManager.resume());

    // Graphics layers — ordered by depth
    this._bgGraphics      = this.add.graphics().setDepth(0);  // deep background
    this._perspGrid       = this.add.graphics().setDepth(1);  // 3D perspective grid
    this._gridGraphics    = this.add.graphics().setDepth(2);  // flat grid overlay
    this._arenaGraphics   = this.add.graphics().setDepth(3);  // arena border / frame
    this._ambientGraphics = this.add.graphics().setDepth(4);  // floating particles
    this._depthGraphics   = this.add.graphics().setDepth(9);  // entity drop shadows

    this._drawBackground();
    this._drawPerspectiveGrid();
    this._drawFlatGrid();
    this._drawArenaFrame();

    // Ambient particles
    this._ambientParticles = this._createAmbientParticles();

    // Warp overlay state
    this._warpOverlay   = null;
    this._warpScanLine  = null;
    this._warpGridGfx   = null;

    // Core systems
    this.player      = new Player(this);
    this.recorder    = new Recorder();
    this.ghostManager= new GhostManager(this, this.recorder, this.audioManager);
    this.uiManager   = new UIManager(this);

    this.survivalTime       = 0;
    this.gameStartTime      = this.time.now;
    this._lastMoveSoundTime = 0;
    this._lastWarnSoundTime = 0;
    this._moveSoundInterval = 80;
    this._warnSoundInterval = 500;

    // Time Warp
    this.timeWarpAvailable  = true;
    this.timeWarpActive     = false;
    this._warpCooldownStart = null;

    // Input
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

  // ================================================================
  //  BACKGROUND — deep 3D space feel
  // ================================================================
  _drawBackground() {
    const W = CONFIG.CANVAS_WIDTH;
    const H = CONFIG.CANVAS_HEIGHT;
    const cx = W / 2, cy = H / 2;
    const g  = this._bgGraphics;
    g.clear();

    // Base
    g.fillStyle(0x030810, 1);
    g.fillRect(0, 0, W, H);

    // Radial depth: concentric ellipses get darker toward edges
    for (let i = 9; i >= 0; i--) {
      const t = i / 9;
      g.fillStyle(0x000000, (1 - t) * 0.65);
      g.fillEllipse(cx, cy, W * (0.2 + t * 0.9), H * (0.2 + t * 0.9));
    }

    // Arena subtle inner lit zone
    const p = CONFIG.ARENA_PADDING;
    for (let i = 6; i >= 1; i--) {
      const t = i / 6;
      g.fillStyle(0x071828, t * 0.28);
      g.fillRect(
        p + (W - p*2)*(1-t)*0.25,
        p + (H - p*2)*(1-t)*0.25,
        (W - p*2)*(0.5 + t*0.5),
        (H - p*2)*(0.5 + t*0.5)
      );
    }
  }

  // ================================================================
  //  3D PERSPECTIVE GRID — lines converge to vanishing point
  // ================================================================
  _drawPerspectiveGrid() {
    const W  = CONFIG.CANVAS_WIDTH;
    const H  = CONFIG.CANVAS_HEIGHT;
    const p  = CONFIG.ARENA_PADDING;
    const cx = W / 2;
    const cy = H / 2;
    const g  = this._perspGrid;
    g.clear();

    const left   = p;
    const right  = W - p;
    const top    = p;
    const bottom = H - p;

    // Radial lines from vanishing point (center) to edges
    const LINES = 24;
    for (let i = 0; i < LINES; i++) {
      const angle = (i / LINES) * Math.PI * 2;
      // Find intersection with arena rectangle boundary
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let tx, ty;
      if (Math.abs(cos) * (H - p*2) > Math.abs(sin) * (W - p*2)) {
        tx = cos > 0 ? right : left;
        ty = cy + sin * Math.abs((tx - cx) / cos);
      } else {
        ty = sin > 0 ? bottom : top;
        tx = cx + cos * Math.abs((ty - cy) / sin);
      }
      ty = Phaser.Math.Clamp(ty, top, bottom);
      tx = Phaser.Math.Clamp(tx, left, right);

      const dist = Math.sqrt((tx-cx)*(tx-cx) + (ty-cy)*(ty-cy));
      const maxDist = Math.sqrt(((W-p*2)/2)**2 + ((H-p*2)/2)**2);
      const alpha = 0.06 + (dist / maxDist) * 0.04;

      g.lineStyle(1, 0x0d3060, alpha);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(tx, ty);
      g.strokePath();
    }

    // Concentric perspective "depth rings" — ellipses that simulate 3D floor
    const RINGS = 7;
    for (let r = 1; r <= RINGS; r++) {
      const t = r / RINGS;
      const rw = (right - left) * t;
      const rh = (bottom - top) * t;
      const alpha = 0.04 + t * 0.06;
      // Flatten vertically to simulate perspective tilt
      g.lineStyle(1, 0x0d3060, alpha);
      g.strokeEllipse(cx, cy, rw, rh * 0.65);
    }

    // Center vanishing point dot
    g.fillStyle(0x1a4080, 0.4);
    g.fillCircle(cx, cy, 3);
  }

  // ================================================================
  //  FLAT GRID overlay (lighter, denser)
  // ================================================================
  _drawFlatGrid() {
    const p    = CONFIG.ARENA_PADDING;
    const W    = CONFIG.CANVAS_WIDTH;
    const H    = CONFIG.CANVAS_HEIGHT;
    const g    = this._gridGraphics;
    const size = 60;
    g.clear();
    g.lineStyle(1, 0x112240, 0.22);
    for (let x = p + size; x < W - p; x += size) {
      g.beginPath(); g.moveTo(x, p); g.lineTo(x, H-p); g.strokePath();
    }
    for (let y = p + size; y < H - p; y += size) {
      g.beginPath(); g.moveTo(p, y); g.lineTo(W-p, y); g.strokePath();
    }
  }

  // ================================================================
  //  ARENA FRAME — 3D extrusion effect on the border
  // ================================================================
  _drawArenaFrame() {
    const p  = CONFIG.ARENA_PADDING;
    const W  = CONFIG.CANVAS_WIDTH;
    const H  = CONFIG.CANVAS_HEIGHT;
    const cx = W / 2, cy = H / 2;
    const g  = this._arenaGraphics;
    g.clear();

    // 3D extrusion shadow: offset filled rect to simulate depth/thickness
    const DEPTH = 6;
    g.fillStyle(0x001030, 0.7);
    g.fillRect(p + DEPTH, p + DEPTH, W - p*2, H - p*2);

    // Outer glow halo
    g.lineStyle(18, 0x00f5ff, 0.04);
    g.strokeRect(p, p, W - p*2, H - p*2);
    g.lineStyle(8, 0x00f5ff, 0.07);
    g.strokeRect(p, p, W - p*2, H - p*2);

    // Outer border
    g.lineStyle(1, 0x1e3a5f, 0.7);
    g.strokeRect(p + 3, p + 3, W - p*2 - 6, H - p*2 - 6);

    // Main border
    g.lineStyle(2, 0x2a6090, 1);
    g.strokeRect(p, p, W - p*2, H - p*2);

    // Inner edge line (3D inner rim)
    g.lineStyle(1, 0x0a2040, 0.9);
    g.strokeRect(p + 2, p + 2, W - p*2 - 4, H - p*2 - 4);

    // Corner brackets — L-shaped, bright
    const cs = 36;
    const corners = [[p, p], [W-p, p], [p, H-p], [W-p, H-p]];
    corners.forEach(([bx, by]) => {
      const sx = bx === p ? 1 : -1;
      const sy = by === p ? 1 : -1;
      // Outer glow sweep
      g.lineStyle(10, 0x00f5ff, 0.08);
      g.beginPath(); g.moveTo(bx + sx*cs, by); g.lineTo(bx, by); g.lineTo(bx, by + sy*cs); g.strokePath();
      // Mid bracket
      g.lineStyle(3, 0x00f5ff, 0.5);
      g.beginPath(); g.moveTo(bx + sx*cs, by); g.lineTo(bx, by); g.lineTo(bx, by + sy*cs); g.strokePath();
      // Bright inner line
      g.lineStyle(1.5, 0x00f5ff, 1.0);
      g.beginPath(); g.moveTo(bx + sx*(cs-2), by); g.lineTo(bx + sx*2, by); g.lineTo(bx + sx*2, by + sy*(cs-2)); g.strokePath();
      // Corner dot
      g.fillStyle(0x00f5ff, 1);
      g.fillCircle(bx, by, 3.5);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(bx, by, 1.5);
    });

    // Center crosshair
    const chs = 16;
    g.lineStyle(1, 0x1e3a5f, 0.55);
    g.beginPath(); g.moveTo(cx - chs, cy); g.lineTo(cx + chs, cy); g.strokePath();
    g.beginPath(); g.moveTo(cx, cy - chs); g.lineTo(cx, cy + chs); g.strokePath();
    g.fillStyle(0x1e3a5f, 0.6);
    g.fillCircle(cx, cy, 2.5);
  }

  // ================================================================
  //  AMBIENT PARTICLES
  // ================================================================
  _createAmbientParticles() {
    const p = CONFIG.ARENA_PADDING + 12;
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const pts = [];
    for (let i = 0; i < 40; i++) {
      pts.push({
        x: p + Math.random() * (W - p * 2),
        y: p + Math.random() * (H - p * 2),
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.4 + 0.4,
        alpha: Math.random() * 0.22 + 0.04,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() > 0.55 ? 0xa855f7 : 0x00f5ff
      });
    }
    return pts;
  }

  _updateAmbientParticles() {
    const p   = CONFIG.ARENA_PADDING + 6;
    const W   = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const g   = this._ambientGraphics;
    const now = this.time.now;
    g.clear();
    this._ambientParticles.forEach(pt => {
      pt.x += pt.vx; pt.y += pt.vy;
      if (pt.x < p)   pt.x = W - p;
      if (pt.x > W-p) pt.x = p;
      if (pt.y < p)   pt.y = H - p;
      if (pt.y > H-p) pt.y = p;
      const twinkle = 0.5 + 0.5 * Math.sin(now * 0.0009 + pt.phase);
      g.fillStyle(pt.color, pt.alpha * twinkle);
      g.fillCircle(pt.x, pt.y, pt.r);
    });
  }

  // ================================================================
  //  ENTITY 3D DROP SHADOWS (drawn each frame before entities render)
  // ================================================================
  _drawEntityShadows() {
    const g = this._depthGraphics;
    g.clear();

    // Player shadow
    if (this.player && this.player.alive) {
      const sx = this.player.x + 10;
      const sy = this.player.y + 16;
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(sx, sy, 22, 7);
    }
  }

  // ================================================================
  //  TIME WARP
  // ================================================================
  activateTimeWarp() {
    this.timeWarpActive    = true;
    this.timeWarpAvailable = false;
    this._warpCooldownStart = null;

    const W  = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const cx = W / 2, cy = H / 2;

    // 1. RGB chromatic flash
    this._triggerChromaticFlash();

    // 2. Persistent warp overlay — dark blue tint for full duration
    const overlay = this.add.rectangle(cx, cy, W, H, 0x000e22).setDepth(35).setAlpha(0);
    this.tweens.add({ targets: overlay, alpha: 0.2, duration: 250, ease: 'Power2' });
    this._warpOverlay = overlay;

    // 3. Scan lines graphics
    this._warpScanLine = this.add.graphics().setDepth(36);

    // 4. Grid ripple
    this._triggerGridRipple(cx, cy);

    // 5. Player aura
    this.player._warpAura = true;

    // 6. Banner
    this._showWarpBanner();

    // End warp
    this.time.delayedCall(CONFIG.TIME_WARP_DURATION, () => {
      this.timeWarpActive   = false;
      this.player._warpAura = false;

      if (this._warpOverlay) {
        this.tweens.add({
          targets: this._warpOverlay,
          alpha: 0,
          duration: 350,
          onComplete: () => { this._warpOverlay && this._warpOverlay.destroy(); this._warpOverlay = null; }
        });
      }
      if (this._warpScanLine) { this._warpScanLine.destroy(); this._warpScanLine = null; }
      if (this._warpGridGfx)  { this._warpGridGfx.destroy();  this._warpGridGfx  = null; }

      this._warpCooldownStart = this.time.now;
      this.time.delayedCall(CONFIG.TIME_WARP_COOLDOWN, () => {
        this.timeWarpAvailable  = true;
        this._warpCooldownStart = null;
        this._flashWarpReady();
      });
    });
  }

  _updateWarpScanLines() {
    if (!this._warpScanLine) return;
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const g = this._warpScanLine;
    const t = this.time.now;
    g.clear();

    // Moving horizontal scan lines
    const gap    = 16;
    const offset = (t * 0.075) % gap;
    g.lineStyle(1, 0x00ffcc, 0.07);
    for (let y = offset; y < H; y += gap) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath();
    }

    // Vertical drift band
    const bx = (Math.sin(t * 0.0014) * 0.5 + 0.5) * W;
    g.fillStyle(0x0033aa, 0.04);
    g.fillRect(bx - 90, 0, 180, H);

    // Chromatic edge fringe
    g.fillStyle(0xff0000, 0.022);
    g.fillRect(0, 0, 5, H);
    g.fillStyle(0x0000ff, 0.022);
    g.fillRect(W - 5, 0, 5, H);
  }

  _triggerChromaticFlash() {
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const cx = W/2, cy = H/2;
    [{ c: 0xff0000, dx: -8, delay: 0 }, { c: 0x0044ff, dx: 8, delay: 45 }].forEach(({ c, dx, delay }) => {
      const r = this.add.rectangle(cx + dx, cy, W + 20, H, c).setAlpha(0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: r, alpha: { from: 0.28, to: 0 }, duration: 400, delay, ease: 'Power3', onComplete: () => r.destroy() });
    });
    const flash = this.add.rectangle(cx, cy, W, H, 0xffffff).setAlpha(0.18).setDepth(82);
    this.tweens.add({ targets: flash, alpha: 0, duration: 180, ease: 'Power3', onComplete: () => flash.destroy() });
  }

  _triggerGridRipple(cx, cy) {
    if (this._warpGridGfx) this._warpGridGfx.destroy();
    const r   = this.add.graphics().setDepth(6);
    this._warpGridGfx = r;
    let elapsed = 0;

    const ev = this.time.addEvent({
      delay: 16, repeat: 44,
      callback: () => {
        elapsed += 16;
        const prog  = elapsed / 700;
        const rad   = 20 + Math.max(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT) * 0.85 * prog;
        const alpha = 0.85 * (1 - prog);
        r.clear();
        r.lineStyle(2.5, 0x00ffcc, alpha);
        r.strokeCircle(cx, cy, rad);
        r.lineStyle(1.5, 0x00f5ff, alpha * 0.5);
        r.strokeCircle(cx, cy, rad * 0.62);
        if (prog >= 1) { r.destroy(); this._warpGridGfx = null; ev.destroy(); }
      }
    });
  }

  _showWarpBanner() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const banner = this.add.text(cx, 82, '⟳  T I M E   W A R P  ⟳', {
      fontFamily: 'Orbitron, monospace', fontSize: '17px',
      color: '#00ffcc', stroke: '#000000', strokeThickness: 5
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    this.tweens.add({
      targets: banner, alpha: 1, y: { from: 100, to: 82 },
      duration: 210, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner, alpha: 0.35,
          duration: 480, yoyo: true,
          repeat: Math.ceil(CONFIG.TIME_WARP_DURATION / 960),
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.tweens.add({ targets: banner, alpha: 0, y: 62, duration: 260, ease: 'Power2', onComplete: () => banner.destroy() });
          }
        });
      }
    });
  }

  _flashWarpReady() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const t = this.add.text(cx, 82, 'WARP READY', {
      fontFamily: 'Orbitron, monospace', fontSize: '13px', color: '#00f5ff'
    }).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: t, alpha: { from: 0, to: 1 }, duration: 200, yoyo: true, repeat: 1, onComplete: () => t.destroy() });
  }

  // ================================================================
  //  UPDATE
  // ================================================================
  update(time, delta) {
    if (this.state !== 'PLAYING') return;

    const ghostMult  = this.timeWarpActive ? CONFIG.TIME_WARP_GHOST_MULT  : 1;
    const playerMult = this.timeWarpActive ? CONFIG.TIME_WARP_PLAYER_MULT : 1;

    this.player.update(delta * playerMult);
    this.recorder.record(this.player.x, this.player.y);
    this.ghostManager.update(ghostMult, delta);

    this.survivalTime = this.time.now - this.gameStartTime;

    // Visual updates
    this._updateAmbientParticles();
    this._drawEntityShadows();
    if (this.timeWarpActive) this._updateWarpScanLines();

    // Warp cooldown progress
    let warpProgress = 1;
    if (!this.timeWarpAvailable && this._warpCooldownStart !== null) {
      warpProgress = Math.min(1, (this.time.now - this._warpCooldownStart) / CONFIG.TIME_WARP_COOLDOWN);
    } else if (this.timeWarpActive) {
      warpProgress = 0;
    }

    // Next echo countdown
    const timeUntilNextSpawn = this.ghostManager.getTimeUntilNextSpawn();
    const nextGhostNumber    = this.ghostManager.nextGhostNumber;
    const isOverdrive        = this.ghostManager.isOverdrive;

    this.uiManager.update(
      this.survivalTime, this.ghostManager.ghostCount,
      timeUntilNextSpawn, nextGhostNumber, isOverdrive,
      this.timeWarpAvailable, this.timeWarpActive, warpProgress
    );

    // Move sound
    if ((this.player.vx !== 0 || this.player.vy !== 0) &&
        this.time.now - this._lastMoveSoundTime > this._moveSoundInterval) {
      this.audioManager.playMove();
      this._lastMoveSoundTime = this.time.now;
    }

    // Danger proximity
    const WARN_DIST = 65;
    let anyNear = false;
    this.ghostManager.getAllGhosts().forEach(ghost => {
      const dx   = this.player.x - ghost.x;
      const dy   = this.player.y - ghost.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < WARN_DIST) {
        ghost.setDangerIntensity(1 - dist / WARN_DIST);
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

  // ================================================================
  //  DEATH
  // ================================================================
  onDeath(ghost) {
    if (this.state !== 'PLAYING') return;
    this.state = 'DYING';

    this.audioManager.playDeath();
    this.ghostManager.stop();
    this.player.kill();

    DeathEffect.play(this, this.player.x, this.player.y);
    this.ghostManager.getAllGhosts().forEach(g => g.flashDanger());

    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const cx = W / 2, cy = H / 2;

    const flash = this.add.rectangle(cx, cy, W, H, 0xffffff).setAlpha(0.9).setDepth(100);
    this.tweens.add({ targets: flash, alpha: 0, duration: 450, ease: 'Power2', onComplete: () => flash.destroy() });

    const red = this.add.rectangle(cx, cy, W, H, 0xff0000).setAlpha(0).setDepth(99);
    this.tweens.add({ targets: red, alpha: { from: 0.42, to: 0 }, duration: 650, delay: 80, ease: 'Power2', onComplete: () => red.destroy() });

    this.cameras.main.shake(CONFIG.SCREEN_SHAKE_MS, CONFIG.SCREEN_SHAKE_INT / 1000);

    this.time.delayedCall(CONFIG.DEATH_HOLD_MS, () => {
      this.state = 'DEAD';
      this._showDeathScreen();
    });
  }

  _showDeathScreen() {
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const cx = W / 2, cy = H / 2;
    const pw = 440, ph = 320;

    // Panel with 3D effect (offset fill + main panel)
    const panel = this.add.graphics().setDepth(90).setAlpha(0);
    // 3D shadow offset
    panel.fillStyle(0x000000, 0.7);
    panel.fillRoundedRect(cx - pw/2 + 8, cy - ph/2 + 8, pw, ph, 14);
    // Main panel
    panel.fillStyle(0x000000, 0.88);
    panel.fillRoundedRect(cx - pw/2, cy - ph/2, pw, ph, 14);
    // Inner glow border
    panel.lineStyle(1, 0x2a5080, 0.8);
    panel.strokeRoundedRect(cx - pw/2, cy - ph/2, pw, ph, 14);
    // Danger border
    panel.lineStyle(2, 0xff3355, 0.85);
    panel.strokeRoundedRect(cx - pw/2 + 4, cy - ph/2 + 4, pw - 8, ph - 8, 11);
    this.tweens.add({ targets: panel, alpha: 1, duration: 320, ease: 'Power2' });

    // Glitch title
    const GLYPHS = '█▓▒░▀■□▪▫◆◇';
    const TARGET = 'ECHO TERMINATED';
    const titleEl = this.add.text(cx, cy - 112, '█'.repeat(TARGET.length), {
      fontFamily: 'Orbitron, monospace', fontSize: '28px',
      color: CONFIG.COLOR_DANGER, align: 'center'
    }).setOrigin(0.5).setDepth(95).setAlpha(0);

    this.time.delayedCall(200, () => {
      titleEl.setAlpha(1);
      let step = 0;
      this.time.addEvent({
        delay: 42, repeat: 15,
        callback: () => {
          step++;
          const n  = Math.floor((step / 15) * TARGET.length);
          const scramble = Array.from({ length: TARGET.length - n }, () =>
            GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
          ).join('');
          titleEl.setText(TARGET.slice(0, n) + scramble);
        }
      });
    });

    const bestStr = localStorage.getItem('echorun_best') || '0';
    const isNewBest = this.survivalTime > parseFloat(bestStr);
    if (isNewBest) localStorage.setItem('echorun_best', String(this.survivalTime));

    const stats = [
      { text: `SURVIVED: ${(this.survivalTime / 1000).toFixed(2)}s`, color: '#ffffff',  size: '21px' },
      { text: `ECHOES: ${this.ghostManager.ghostCount}`,              color: '#a855f7',  size: '16px' },
      { text: isNewBest ? '✦  NEW BEST  ✦' : `BEST: ${(parseFloat(bestStr)/1000).toFixed(2)}s`,
                                                                       color: isNewBest ? '#ffd700' : '#556677', size: '15px' },
    ];
    stats.forEach(({ text, color, size }, i) => {
      const el = this.add.text(cx, cy + 5 + i * 42, text, {
        fontFamily: 'Share Tech Mono, monospace', fontSize: size, color, align: 'center'
      }).setOrigin(0.5).setDepth(95).setAlpha(0).setY(cy + 22 + i * 42);

      this.time.delayedCall(480 + i * 160, () => {
        this.tweens.add({ targets: el, alpha: 1, y: cy + 5 + i * 42, duration: 260, ease: 'Back.easeOut' });
      });
    });

    const prompt = this.add.text(cx, cy + 132, 'SPACE  /  TAP TO RESTART', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '13px', color: '#00f5ff'
    }).setOrigin(0.5).setDepth(95).setAlpha(0);

    this.time.delayedCall(960, () => {
      prompt.setAlpha(1);
      this.tweens.add({ targets: prompt, alpha: 0.1, duration: 680, yoyo: true, repeat: -1 });
    });
  }

  restartGame() { this.scene.restart(); }
}
