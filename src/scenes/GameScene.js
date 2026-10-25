import Phaser from 'phaser';
import { CONFIG, POWERUP_INFO } from '../config/GameConfig.js';
import { Player }          from '../entities/Player.js';
import { Recorder }        from '../systems/Recorder.js';
import { GhostManager }    from '../systems/GhostManager.js';
import { PowerupManager }  from '../systems/PowerupManager.js';
import { ScoreSystem }     from '../systems/ScoreSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { AudioManager }    from '../systems/AudioManager.js';
import { Settings }        from '../systems/Settings.js';
import { Leaderboard }     from '../systems/Leaderboard.js';
import { UIManager }       from '../ui/UIManager.js';
import { WaveAnnouncer }   from '../ui/WaveAnnouncer.js';
import { TouchControls }   from '../ui/TouchControls.js';
import { Button, bindButtonNav } from '../ui/Button.js';
import { DeathEffect }     from '../effects/DeathEffect.js';
import { ClashKillEffect } from '../effects/ClashKillEffect.js';

/**
 * States:
 *   PLAYING  — simulation runs
 *   PAUSED   — pause menu; scene clock frozen
 *   CHOOSING — milestone banner / buff choice; scene clock frozen
 *   DYING    — death animation
 *   DEAD     — results screen
 * All gameplay timing (survival time, recorder, warp, combos) advances only in PLAYING.
 */
const S = { PLAYING: 'PLAYING', PAUSED: 'PAUSED', CHOOSING: 'CHOOSING', DYING: 'DYING', DEAD: 'DEAD' };

const BUFF_BY_KEY = Object.fromEntries(CONFIG.BUFFS.map(b => [b.key, b]));

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  init(data) {
    const diff = (data && data.difficulty) || Settings.get('difficulty');
    this._difficulty = CONFIG.DIFFICULTIES[diff] ? diff : 'normal';
    this._preset     = CONFIG.DIFFICULTIES[this._difficulty];
  }

  create() {
    this.state = S.PLAYING;
    this._leaving = false;
    this.time.paused = false;   // the clock plugin survives restarts
    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.audioManager = AudioManager.get();
    this.audioManager.resume();
    this.input.on('pointerdown', () => this.audioManager.resume());
    this.input.keyboard.on('keydown', () => this.audioManager.resume());

    // Static arena art is drawn once and baked into a texture
    if (!this.textures.exists('arena-bg')) {
      const bake = this.make.graphics({ add: false });
      this._bgGraphics = this._perspGrid = this._gridGraphics = this._arenaGraphics = bake;
      this._drawBackground();
      this._drawPerspectiveGrid();
      this._drawFlatGrid();
      this._drawArenaFrame();
      bake.generateTexture('arena-bg', CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
      bake.destroy();
    }
    this.add.image(0, 0, 'arena-bg').setOrigin(0).setDepth(0);

    // Dynamic layers
    this._ambientGraphics = this.add.graphics().setDepth(4);
    this._depthGraphics   = this.add.graphics().setDepth(9);
    this._vignetteImg     = this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(34).setAlpha(0);
    this._vignetteGfx     = this.add.graphics().setDepth(34);
    this._borderPulseGfx  = this.add.graphics().setDepth(35);
    this._warpTintGfx     = this.add.graphics().setDepth(37);

    this._ambientParticles = this._createAmbientParticles();

    // Scene instances are reused across restarts — reset every per-run reference
    this._warpOverlay  = null;
    this._warpScanLine = null;
    this._warpGridGfx  = null;
    this._menuSoundBtn = null;
    this._result       = null;
    this._floaters     = [];

    this.recorder       = new Recorder();
    this.scoreSystem    = new ScoreSystem(this, this._preset.scoreMult);
    this.waveAnnouncer  = new WaveAnnouncer(this);
    this.ghostManager   = new GhostManager(this, this.recorder, this.audioManager, this.waveAnnouncer, this._preset);
    this.touchControls  = new TouchControls(this);
    this.player         = new Player(this);
    this.powerupManager = new PowerupManager(this, this.audioManager, this.scoreSystem);
    this.uiManager      = new UIManager(this, { touch: this.touchControls.isTouch });

    this.touchControls.addRegion(this.uiManager.powerupRect, () => this._usePowerup());
    this.touchControls.addRegion(this.uiManager.warpRect,    () => this._tryWarp());

    this._buildTopBar();

    this.survivalTime  = 0;
    this._milestoneIdx = 0;
    this._buffs        = new Set();

    this._warp = { state: 'ready', left: 0, total: CONFIG.TIME_WARP_COOLDOWN };

    this._lastMoveSoundAt = 0;
    this._lastWarnSoundAt = 0;
    this._nearMissTracked = new Set();
    this._nearMissLast    = new Map();   // ghost -> survivalTime of its last near-miss
    this._peakFlashShown  = false;

    this._menu = null;   // active overlay menu { objects, unbind }
    this._invulnLeft = 0;
    this.godMode = false;  // debug/test hook: disables echo collisions

    // ── Input ──────────────────────────────────────────
    const kb = this.input.keyboard;
    kb.addCapture(['SPACE', 'SHIFT', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    kb.on('keydown-SHIFT', () => this._tryWarp());
    kb.on('keydown-E',     () => this._usePowerup());
    kb.on('keydown-ESC',   () => this._onBackKey());
    kb.on('keydown-P',     () => this._togglePause());
    kb.on('keydown-M',     () => this._toggleMute());
    kb.on('keydown-SPACE', () => {
      if (this.state === S.DEAD) this.restartGame();
      else if (this.state === S.PAUSED) this._resume();
    });
    kb.on('keydown-R', () => { if (this.state === S.PAUSED || this.state === S.DEAD) this.restartGame(); });
    kb.on('keydown-Q', () => { if (this.state === S.PAUSED || this.state === S.DEAD) this._quitToMenu(); });

    // Auto-pause when the window loses focus or the tab is hidden
    this.game.events.on(Phaser.Core.Events.BLUR, this._onBlur, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this._onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._onShutdown, this);

    this._showIntroHint();
    this.time.delayedCall(500, () => this.audioManager.startAdaptiveBg());
  }

  _onShutdown() {
    this.game.events.off(Phaser.Core.Events.BLUR, this._onBlur, this);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this._onBlur, this);
    this.touchControls.destroy();
    this.audioManager.stopAdaptiveBg();
    this.audioManager.setMusicPaused(false);
    this.time.paused = false;
  }

  _onBlur() { if (this.state === S.PLAYING) this._pause(); }

  _onBackKey() {
    if (this.state === S.PLAYING) this._pause();
    else if (this.state === S.PAUSED) this._resume();
    else if (this.state === S.DEAD) this._quitToMenu();
  }

  _togglePause() {
    if (this.state === S.PLAYING) this._pause();
    else if (this.state === S.PAUSED) this._resume();
  }

  _toggleMute() {
    const muted = this.audioManager.toggleMute();
    this._soundBtn?.setLabel(muted ? 'SOUND OFF' : 'SOUND ON');
    this._menuSoundBtn?.setLabel(muted ? 'SOUND: OFF' : 'SOUND: ON');
  }

  // ================================================================= TOP BAR
  _buildTopBar() {
    const p = CONFIG.ARENA_PADDING, W = CONFIG.CANVAS_WIDTH, y = p / 2;
    this.add.text(p, y, `ECHO RUN  //  ${this._preset.label}`, {
      fontFamily: 'Orbitron, monospace', fontSize: '10px', color: '#5a7090',
    }).setOrigin(0, 0.5).setDepth(60);

    this._pauseBtn = new Button(this, W - p - 45, y, 'II  PAUSE', {
      width: 90, height: 26, fontSize: '10px', depth: 60, color: '#7b94b5',
      onClick: () => this._togglePause(),
    });
    this._soundBtn = new Button(this, W - p - 150, y, Settings.get('muted') ? 'SOUND OFF' : 'SOUND ON', {
      width: 104, height: 26, fontSize: '10px', depth: 60, color: '#7b94b5',
      onClick: () => this._toggleMute(),
    });
  }

  _showIntroHint() {
    const cx = CONFIG.CANVAS_WIDTH / 2, cy = CONFIG.CANVAS_HEIGHT / 2;
    const lines = [
      'YOUR PATH IS BEING RECORDED',
      `ECHO #1 WILL REPLAY IT IN ${Math.round(this._preset.ghostDelay / 1000)}s`,
      this.touchControls.isTouch ? 'DRAG ANYWHERE OR USE WASD / ARROWS TO MOVE' : 'WASD / ARROWS TO MOVE',
    ];
    lines.forEach((line, i) => {
      const t = this.add.text(cx, cy + 70 + i * 20, line, {
        fontFamily: i === 0 ? 'Orbitron, monospace' : 'Share Tech Mono, monospace',
        fontSize: i === 0 ? '13px' : '12px',
        color: i === 0 ? CONFIG.COLOR_CYAN : '#8899bb',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(60).setAlpha(0);
      this.tweens.add({
        targets: t, alpha: 1, delay: 300 + i * 250, duration: 300,
        onComplete: () => this.tweens.add({
          targets: t, alpha: 0, delay: 3200 - i * 250, duration: 500, onComplete: () => t.destroy(),
        }),
      });
    });
  }

  // ================================================================= BACKGROUND
  _drawBackground() {
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const cx = W/2, cy = H/2;
    const g  = this._bgGraphics;
    g.fillStyle(0x030810, 1);
    g.fillRect(0, 0, W, H);
    for (let i = 9; i >= 0; i--) {
      const t = i / 9;
      g.fillStyle(0x000000, (1-t) * 0.65);
      g.fillEllipse(cx, cy, W*(0.2+t*0.9), H*(0.2+t*0.9));
    }
    const p = CONFIG.ARENA_PADDING;
    for (let i = 6; i >= 1; i--) {
      const t = i/6;
      g.fillStyle(0x071828, t*0.28);
      g.fillRect(p+(W-p*2)*(1-t)*0.25, p+(H-p*2)*(1-t)*0.25, (W-p*2)*(0.5+t*0.5), (H-p*2)*(0.5+t*0.5));
    }
  }

  _drawPerspectiveGrid() {
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, p=CONFIG.ARENA_PADDING;
    const cx=W/2, cy=H/2;
    const left=p, right=W-p, top=p, bottom=H-p;
    const g=this._perspGrid;
    for (let i=0;i<24;i++) {
      const angle=(i/24)*Math.PI*2;
      const cos=Math.cos(angle), sin=Math.sin(angle);
      let tx, ty;
      if (Math.abs(cos)*(H-p*2)>Math.abs(sin)*(W-p*2)) {
        tx=cos>0?right:left; ty=cy+sin*Math.abs((tx-cx)/cos);
      } else {
        ty=sin>0?bottom:top; tx=cx+cos*Math.abs((ty-cy)/sin);
      }
      ty=Phaser.Math.Clamp(ty,top,bottom); tx=Phaser.Math.Clamp(tx,left,right);
      const dist=Math.hypot(tx-cx,ty-cy);
      const maxDist=Math.hypot((W-p*2)/2,(H-p*2)/2);
      g.lineStyle(1,0x0d3060,0.06+(dist/maxDist)*0.04);
      g.beginPath(); g.moveTo(cx,cy); g.lineTo(tx,ty); g.strokePath();
    }
    for (let r=1;r<=7;r++) {
      const t=r/7;
      g.lineStyle(1,0x0d3060,0.04+t*0.06);
      g.strokeEllipse(cx,cy,(right-left)*t,(bottom-top)*t*0.65);
    }
    g.fillStyle(0x1a4080,0.4); g.fillCircle(cx,cy,3);
  }

  _drawFlatGrid() {
    const p=CONFIG.ARENA_PADDING, W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    const g=this._gridGraphics, size=60;
    g.lineStyle(1,0x112240,0.22);
    for(let x=p+size;x<W-p;x+=size){g.beginPath();g.moveTo(x,p);g.lineTo(x,H-p);g.strokePath();}
    for(let y=p+size;y<H-p;y+=size){g.beginPath();g.moveTo(p,y);g.lineTo(W-p,y);g.strokePath();}
  }

  _drawArenaFrame() {
    const p=CONFIG.ARENA_PADDING, W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    const cx=W/2, cy=H/2, g=this._arenaGraphics, DEPTH=6;
    g.fillStyle(0x001030,0.7); g.fillRect(p+DEPTH,p+DEPTH,W-p*2,H-p*2);
    g.lineStyle(18,0x00f5ff,0.04); g.strokeRect(p,p,W-p*2,H-p*2);
    g.lineStyle(8,0x00f5ff,0.07);  g.strokeRect(p,p,W-p*2,H-p*2);
    g.lineStyle(1,0x1e3a5f,0.7);   g.strokeRect(p+3,p+3,W-p*2-6,H-p*2-6);
    g.lineStyle(2,0x2a6090,1);     g.strokeRect(p,p,W-p*2,H-p*2);
    const cs=36;
    [[p,p],[W-p,p],[p,H-p],[W-p,H-p]].forEach(([bx,by])=>{
      const sx=bx===p?1:-1, sy=by===p?1:-1;
      g.lineStyle(10,0x00f5ff,0.08); g.beginPath();g.moveTo(bx+sx*cs,by);g.lineTo(bx,by);g.lineTo(bx,by+sy*cs);g.strokePath();
      g.lineStyle(3,0x00f5ff,0.5);   g.beginPath();g.moveTo(bx+sx*cs,by);g.lineTo(bx,by);g.lineTo(bx,by+sy*cs);g.strokePath();
      g.fillStyle(0x00f5ff,1);g.fillCircle(bx,by,3.5);
      g.fillStyle(0xffffff,0.6);g.fillCircle(bx,by,1.5);
    });
    g.lineStyle(1,0x1e3a5f,0.55);
    g.beginPath();g.moveTo(cx-16,cy);g.lineTo(cx+16,cy);g.strokePath();
    g.beginPath();g.moveTo(cx,cy-16);g.lineTo(cx,cy+16);g.strokePath();
  }

  _createAmbientParticles() {
    const p=CONFIG.ARENA_PADDING+12, W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    return Array.from({length:40},()=>({
      x:p+Math.random()*(W-p*2), y:p+Math.random()*(H-p*2),
      vx:(Math.random()-0.5)*0.22, vy:(Math.random()-0.5)*0.22,
      r:Math.random()*1.4+0.4, alpha:Math.random()*0.22+0.04,
      phase:Math.random()*Math.PI*2,
      color:Math.random()>0.55?0xa855f7:0x00f5ff
    }));
  }

  _updateAmbientParticles(dt) {
    const p=CONFIG.ARENA_PADDING+6, W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    const g=this._ambientGraphics, now=this.time.now, k=dt/16;
    g.clear();
    this._ambientParticles.forEach(pt=>{
      pt.x+=pt.vx*k; pt.y+=pt.vy*k;
      if(pt.x<p)pt.x=W-p; if(pt.x>W-p)pt.x=p;
      if(pt.y<p)pt.y=H-p; if(pt.y>H-p)pt.y=p;
      const tw=0.5+0.5*Math.sin(now*0.0009+pt.phase);
      g.fillStyle(pt.color,pt.alpha*tw);
      g.fillRect(pt.x-pt.r,pt.y-pt.r,pt.r*2,pt.r*2);  // tiny quads: far cheaper than circles
    });
  }

  _drawEntityShadows() {
    const g=this._depthGraphics; g.clear();
    if(this.player&&this.player.alive){g.fillStyle(0x000000,0.3);g.fillEllipse(this.player.x+10,this.player.y+16,22,7);}
  }

  // Tension vignette — darkens and reddens as ghost count rises
  _updateVignette(tension) {
    const g = this._vignetteGfx;
    g.clear();
    this._vignetteImg.setAlpha(tension < 0.1 ? 0 : tension * 0.75);
    if (tension < 0.1) return;
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    if (tension > 0.5) {
      const redAlpha = (tension - 0.5) * 0.28;
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 300);
      g.fillStyle(0xff0000, Settings.flash(redAlpha * (0.7 + pulse * 0.3)));
      g.fillRect(0, 0, W, 6);
      g.fillRect(0, H - 6, W, 6);
      g.fillRect(0, 0, 6, H);
      g.fillRect(W - 6, 0, 6, H);
    }
  }

  _updateWarpTint() {
    const g = this._warpTintGfx;
    g.clear();
    if (this._warp.state !== 'active') return;
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    g.fillStyle(0x0a1a2e, 0.18);
    g.fillRect(0, 0, W, H);
    g.lineStyle(8, 0x00ffcc, 0.12);
    g.strokeRect(0, 0, W, H);
  }

  _updateBorderPulse(nearbyDanger) {
    const g=this._borderPulseGfx; g.clear();
    if(!nearbyDanger) return;
    const t=(0.5+0.5*Math.sin(this.time.now/120));
    const p=CONFIG.ARENA_PADDING, W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    g.lineStyle(8,0xff3355,Settings.flash(t*0.18));
    g.strokeRect(p,p,W-p*2,H-p*2);
    g.lineStyle(3,0xff8c00,t*0.35);
    g.strokeRect(p,p,W-p*2,H-p*2);
  }

  _screenFlash(color, alpha, duration, depth = 88, delay = 0) {
    const a = Settings.flash(alpha);
    if (a < 0.01) return;
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const r = this.add.rectangle(W / 2, H / 2, W, H, color).setAlpha(0).setDepth(depth);
    this.tweens.add({ targets: r, alpha: { from: a, to: 0 }, delay, duration, ease: 'Power2', onComplete: () => r.destroy() });
  }

  // =============================================================== FLOATING TEXT
  _showFloatingText(x, y, text, color = '#ffffff', fontSize = '12px') {
    const pad = CONFIG.ARENA_PADDING;
    const cx  = Phaser.Math.Clamp(x, pad + 90, CONFIG.CANVAS_WIDTH  - pad - 90);
    let   cy  = Phaser.Math.Clamp(y, pad + 80, CONFIG.CANVAS_HEIGHT - pad - 80);

    // Stack instead of overlapping texts that are still near their start position
    this._floaters = (this._floaters || []).filter(f => f.active && f.alpha > 0.4);
    for (let guard = 0; guard < 6; guard++) {
      const hit = this._floaters.find(f => Math.abs(f.x - cx) < 140 && Math.abs(f.y - cy) < 20);
      if (!hit) break;
      cy = hit.y - 22;
    }

    const t = this.add.text(cx, cy, text, {
      fontFamily: 'Orbitron, monospace', fontSize, color,
      stroke: '#000000', strokeThickness: 4, align: 'center'
    }).setOrigin(0.5).setDepth(89);
    this._floaters.push(t);
    this.tweens.add({
      targets: t, alpha: { from: 1, to: 0 },
      y: { from: cy, to: cy - 50 },
      duration: 1100, ease: 'Power2',
      onComplete: () => t.destroy()
    });
  }

  // =============================================================== POWERUPS
  _usePowerup() {
    if (this.state !== S.PLAYING) return;
    const type = this.powerupManager.activate();
    if (!type) { this.audioManager.playEmpty(); return; }
    const info = POWERUP_INFO[type];
    this._showFloatingText(this.player.x, this.player.y - 34, info.label, info.color, '13px');
  }

  _clashKill(ghost) {
    ClashKillEffect.play(this, ghost.x, ghost.y);
    const chain = this.powerupManager.registerClashKill();
    this.ghostManager.killGhost(ghost);
    this._nearMissTracked.delete(ghost);
    this._nearMissLast.delete(ghost);
    const pts = Math.round(CONFIG.CLASH_KILL_POINTS * this._preset.scoreMult);
    this._showFloatingText(ghost.x, ghost.y - 20, chain >= 2 ? `×${chain} CHAIN  +${pts}` : `ECHO DESTROYED  +${pts}`, '#ffd700', '13px');
  }

  // =============================================================== TIME WARP
  _tryWarp() {
    if (this.state !== S.PLAYING) return;
    if (this._warp.state !== 'ready') { this.audioManager.playEmpty(); return; }
    this._activateTimeWarp();
  }

  _activateTimeWarp() {
    this._warp.state = 'active';
    this._warp.left  = CONFIG.TIME_WARP_DURATION;
    this.scoreSystem.recordWarpUse();
    this.audioManager.playWarp();

    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    this._triggerChromaticFlash();
    this._warpOverlay = this.add.rectangle(cx,cy,W,H,0x000e22).setDepth(35).setAlpha(0);
    this.tweens.add({targets:this._warpOverlay,alpha:0.2,duration:250,ease:'Power2'});
    this._warpScanLine = this.add.graphics().setDepth(36);
    this._triggerGridRipple(this.player.x, this.player.y);
    this.player._warpAura = true;
    this._showWarpBanner();
  }

  _clearWarpVisuals() {
    this.player._warpAura = false;
    if (this._warpOverlay) {
      const o = this._warpOverlay; this._warpOverlay = null;
      this.tweens.killTweensOf(o);
      this.tweens.add({ targets: o, alpha: 0, duration: 350, onComplete: () => o.destroy() });
    }
    if (this._warpScanLine) { this._warpScanLine.destroy(); this._warpScanLine = null; }
    this._warpTintGfx.clear();
  }

  _endTimeWarp() {
    this._clearWarpVisuals();
    this._warp.state = 'cooldown';
    this._warp.total = CONFIG.TIME_WARP_COOLDOWN * (this._buffs.has('warpRecharge') ? 0.65 : 1);
    this._warp.left  = this._warp.total;
  }

  _updateWarp(dt) {
    const w = this._warp;
    if (w.state === 'active') {
      w.left -= dt;
      if (w.left <= 0) this._endTimeWarp();
    } else if (w.state === 'cooldown') {
      w.left -= dt;
      if (w.left <= 0) {
        w.state = 'ready'; w.left = 0;
        this.audioManager.playWarpReady();
        this._flashWarpReady();
      }
    }
  }

  get _warpProgress() {
    const w = this._warp;
    if (w.state === 'ready')  return 1;
    if (w.state === 'active') return 0;
    return Phaser.Math.Clamp(1 - w.left / w.total, 0, 1);
  }

  _updateWarpScanLines() {
    if(!this._warpScanLine) return;
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    const g=this._warpScanLine, t=this.time.now;
    g.clear();
    const gap=16, offset=(t*0.075)%gap;
    g.lineStyle(1,0x00ffcc,0.07);
    for(let y=offset;y<H;y+=gap){g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.strokePath();}
    const bx=(Math.sin(t*0.0014)*0.5+0.5)*W;
    g.fillStyle(0x0033aa,0.04); g.fillRect(bx-90,0,180,H);
    g.fillStyle(0xff0000,0.022); g.fillRect(0,0,5,H);
    g.fillStyle(0x0000ff,0.022); g.fillRect(W-5,0,5,H);
  }

  _triggerChromaticFlash() {
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    [{c:0xff0000,dx:-8,delay:0},{c:0x0044ff,dx:8,delay:45}].forEach(({c,dx,delay})=>{
      const r=this.add.rectangle(cx+dx,cy,W+20,H,c).setAlpha(0).setDepth(80).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({targets:r,alpha:{from:Settings.flash(0.28),to:0},duration:400,delay,ease:'Power3',onComplete:()=>r.destroy()});
    });
    this._screenFlash(0xffffff, 0.18, 180, 82);
  }

  _triggerGridRipple(cx,cy) {
    if(this._warpGridGfx) this._warpGridGfx.destroy();
    const r=this.add.graphics().setDepth(6); this._warpGridGfx=r;
    this.tweens.addCounter({
      from: 0, to: 1, duration: 700, ease: 'Linear',
      onUpdate: (tw) => {
        const prog = tw.getValue();
        const rad = 20 + Math.max(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT) * 0.85 * prog;
        const alpha = 0.85 * (1 - prog);
        r.clear();
        r.lineStyle(2.5,0x00ffcc,alpha); r.strokeCircle(cx,cy,rad);
        r.lineStyle(1.5,0x00f5ff,alpha*0.5); r.strokeCircle(cx,cy,rad*0.62);
      },
      onComplete: () => { r.destroy(); if (this._warpGridGfx === r) this._warpGridGfx = null; },
    });
  }

  _showWarpBanner() {
    const cx=CONFIG.CANVAS_WIDTH/2;
    const banner=this.add.text(cx,128,'<<  T I M E   W A R P  >>',{fontFamily:'Orbitron, monospace',fontSize:'17px',color:'#00ffcc',stroke:'#000000',strokeThickness:5}).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.tweens.chain({
      targets: banner,
      tweens: [
        { alpha: 1, y: { from: 146, to: 128 }, duration: 210, ease: 'Back.easeOut' },
        { alpha: 0.35, duration: 480, yoyo: true, repeat: Math.max(0, Math.ceil(CONFIG.TIME_WARP_DURATION / 960) - 1), ease: 'Sine.easeInOut' },
        { alpha: 0, y: 108, duration: 260, ease: 'Power2' },
      ],
      onComplete: () => banner.destroy(),
    });
  }

  _flashWarpReady() {
    const cx=CONFIG.CANVAS_WIDTH/2;
    const t=this.add.text(cx,128,'WARP READY',{fontFamily:'Orbitron, monospace',fontSize:'13px',color:'#00f5ff',stroke:'#000000',strokeThickness:4}).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.tweens.add({targets:t,alpha:{from:0,to:1},duration:200,yoyo:true,repeat:1,onComplete:()=>t.destroy()});
  }

  // ============================================================== OVERLAY MENUS
  _closeMenu() {
    if (!this._menu) return;
    this._menu.unbind?.();
    this._menu.objects.forEach(o => o.destroy());
    this._menu = null;
    this._menuSoundBtn = null;
  }

  _panel(w, h, color, depth = 201) {
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    const overlay = this.add.rectangle(cx, cy, W, H, 0x000000).setAlpha(0.6).setDepth(depth - 1);
    const panel = this.add.graphics().setDepth(depth);
    panel.fillStyle(0x000000, 0.92); panel.fillRoundedRect(cx - w/2, cy - h/2, w, h, 12);
    panel.lineStyle(2, color, 0.6);  panel.strokeRoundedRect(cx - w/2, cy - h/2, w, h, 12);
    return [overlay, panel];
  }

  // ============================================================== PAUSE
  _freeze() {
    this.time.paused = true;
    this.touchControls.setEnabled(false);
    this.audioManager.setMusicPaused(true);
  }

  _unfreeze() {
    this.time.paused = false;
    this.touchControls.setEnabled(true);
    this.audioManager.setMusicPaused(false);
    this.state = S.PLAYING;
    this._invulnLeft = CONFIG.RESUME_GRACE_MS;  // never resume straight into a collision
  }

  _pause() {
    if (this.state !== S.PLAYING) return;
    this.state = S.PAUSED;
    this._freeze();

    const cx = CONFIG.CANVAS_WIDTH / 2, cy = CONFIG.CANVAS_HEIGHT / 2;
    const objects = this._panel(340, 430, 0x00f5ff);
    const title = this.add.text(cx, cy - 180, 'PAUSED', { fontFamily: 'Orbitron, monospace', fontSize: '24px', color: CONFIG.COLOR_CYAN }).setOrigin(0.5).setDepth(202);
    const warpStr = this._warp.state === 'ready' ? 'READY' : this._warp.state === 'active' ? 'ACTIVE' : `${Math.floor(this._warpProgress * 100)}%`;
    const held = this.powerupManager.heldType ? POWERUP_INFO[this.powerupManager.heldType].label : 'NONE';
    const stats = this.add.text(cx, cy - 128,
      `TIME ${(this.survivalTime/1000).toFixed(2)}s   SCORE ${Math.floor(this.scoreSystem.score).toLocaleString('en-US')}\n` +
      `ECHOES ${this.ghostManager.ghostCount}   WARP ${warpStr}   HELD ${held}`,
      { fontFamily: 'Share Tech Mono, monospace', fontSize: '12px', color: '#aabbcc', align: 'center', lineSpacing: 6 }).setOrigin(0.5).setDepth(202);
    objects.push(title, stats);

    const a = this.audioManager;
    const opts = { width: 220, height: 36, depth: 203, audio: a };
    const buttons = [
      new Button(this, cx, cy - 62, 'RESUME',    { ...opts, onClick: () => this._resume() }),
      new Button(this, cx, cy - 16, 'RESTART',   { ...opts, color: '#ff8c00', onClick: () => this.restartGame() }),
      new Button(this, cx, cy + 30, Settings.get('muted') ? 'SOUND: OFF' : 'SOUND: ON', { ...opts, color: '#a8bddd', onClick: () => this._toggleMute() }),
      new Button(this, cx, cy + 76, Settings.get('reducedFlash') ? 'FLASHING: REDUCED' : 'FLASHING: FULL', { ...opts, color: '#a8bddd', onClick: () => {
        const reduced = Settings.toggle('reducedFlash');
        buttons[3].setLabel(reduced ? 'FLASHING: REDUCED' : 'FLASHING: FULL');
      } }),
      new Button(this, cx, cy + 122, 'MAIN MENU', { ...opts, color: '#ff3355', onClick: () => this._quitToMenu() }),
    ];
    this._menuSoundBtn = buttons[2];
    const hint = this.add.text(cx, cy + 180, 'ESC RESUME  ·  R RESTART  ·  M SOUND  ·  Q MENU', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '11px', color: '#556677',
    }).setOrigin(0.5).setDepth(202);
    objects.push(hint, ...buttons);

    this._menu = { objects, unbind: bindButtonNav(this, buttons, { audio: a }) };
  }

  _resume() {
    if (this.state !== S.PAUSED) return;
    this._closeMenu();
    this._unfreeze();
  }

  // ============================================================== MILESTONES
  _checkMilestones() {
    const m = CONFIG.MILESTONES[this._milestoneIdx];
    if (!m || this.survivalTime < m.ms) return false;
    this._milestoneIdx++;
    this._triggerMilestone(m);
    return true;
  }

  _triggerMilestone(m) {
    this.state = S.CHOOSING;
    this._freeze();
    this.audioManager.playMilestone();
    const pts = this.scoreSystem.applyMilestoneBonus();

    const cx = CONFIG.CANVAS_WIDTH / 2, cy = CONFIG.CANVAS_HEIGHT / 2;
    this._screenFlash(0xffd700, 0.22, 500, 73);
    this.tweens.add({ targets: this.cameras.main, zoom: 1.018, duration: 200, yoyo: true, ease: 'Power2' });

    const title = this.add.text(cx, cy - 12, `//  ${m.label}  //`, {
      fontFamily: 'Orbitron, monospace', fontSize: '22px', color: CONFIG.COLOR_GOLD,
      stroke: '#000000', strokeThickness: 6, align: 'center'
    }).setOrigin(0.5).setDepth(75).setAlpha(0);
    const sub = this.add.text(cx, cy + 20, `${Math.round(m.ms / 1000)}s SURVIVED  ·  +${pts}  ·  SCORE ×1.15`, {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '13px', color: '#ffe680',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(75).setAlpha(0);

    this.tweens.chain({
      targets: [title, sub],
      tweens: [
        { alpha: 1, y: '-=12', duration: 400, ease: 'Back.easeOut' },
        { alpha: 0, delay: 1200, duration: 350 },
      ],
      onComplete: () => {
        title.destroy(); sub.destroy();
        if (this.state === S.CHOOSING) this._showBuffChoice();
      },
    });
  }

  /** Offer up to 3 buffs not yet taken this run. */
  _showBuffChoice() {
    const pool = Phaser.Utils.Array.Shuffle(CONFIG.BUFFS.filter(b => !this._buffs.has(b.key))).slice(0, 3);
    if (!pool.length) { this._unfreeze(); return; }

    const cx = CONFIG.CANVAS_WIDTH / 2, cy = CONFIG.CANVAS_HEIGHT / 2;
    const objects = this._panel(520, 290, 0xffd700);
    objects.push(this.add.text(cx, cy - 118, 'CHOOSE A BUFF', { fontFamily: 'Orbitron, monospace', fontSize: '17px', color: '#ffd700' }).setOrigin(0.5).setDepth(202));

    const choose = (key) => {
      this.audioManager.playUiSelect();
      this._closeMenu();
      this._applyBuff(key);
      this._showFloatingText(this.player.x, this.player.y - 34, BUFF_BY_KEY[key].label, BUFF_BY_KEY[key].color, '13px');
      this._unfreeze();
    };

    const cards = [];
    const spacing = 160, startX = cx - ((pool.length - 1) * spacing) / 2;
    pool.forEach((b, i) => {
      const bx = startX + i * spacing, by = cy + 5;
      const col = Phaser.Display.Color.HexStringToColor(b.color).color;
      const bg = this.add.graphics().setDepth(202);
      const draw = (lit) => {
        bg.clear();
        bg.fillStyle(lit ? 0x1a1a1a : 0x0d0d0d, 0.95); bg.fillRoundedRect(bx - 70, by - 70, 140, 150, 10);
        bg.lineStyle(lit ? 3 : 2, col, lit ? 1 : 0.6); bg.strokeRoundedRect(bx - 70, by - 70, 140, 150, 10);
      };
      draw(false);
      const num = this.add.text(bx, by - 46, `[${i + 1}]`, { fontFamily: 'Orbitron, monospace', fontSize: '14px', color: b.color }).setOrigin(0.5).setDepth(203);
      const lbl = this.add.text(bx, by - 8, b.label, { fontFamily: 'Orbitron, monospace', fontSize: '13px', color: b.color, align: 'center', wordWrap: { width: 128 } }).setOrigin(0.5).setDepth(203);
      const dsc = this.add.text(bx, by + 34, b.desc, { fontFamily: 'Share Tech Mono, monospace', fontSize: '12px', color: '#c0ccdd', align: 'center', wordWrap: { width: 120 } }).setOrigin(0.5).setDepth(203);
      const hit = this.add.rectangle(bx, by + 5, 140, 150, 0x000000, 0).setDepth(204).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { draw(true); this.audioManager.playUiMove(); });
      hit.on('pointerout',  () => draw(false));
      hit.on('pointerdown', () => choose(b.key));
      cards.push({ draw, key: b.key });
      objects.push(bg, num, lbl, dsc, hit);
    });

    objects.push(this.add.text(cx, cy + 122, 'PRESS 1-3 OR CLICK A CARD', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '11px', color: '#667788',
    }).setOrigin(0.5).setDepth(202));

    const keys = ['ONE', 'TWO', 'THREE'], numpad = ['NUMPAD_ONE', 'NUMPAD_TWO', 'NUMPAD_THREE'];
    const handlers = pool.map(b => () => choose(b.key));
    const kb = this.input.keyboard;
    handlers.forEach((h, i) => { kb.on(`keydown-${keys[i]}`, h); kb.on(`keydown-${numpad[i]}`, h); });
    const unbind = () => handlers.forEach((h, i) => { kb.off(`keydown-${keys[i]}`, h); kb.off(`keydown-${numpad[i]}`, h); });

    this._menu = { objects, unbind };
  }

  _applyBuff(key) {
    this._buffs.add(key);
    switch (key) {
      case 'nerveDecay':    this.scoreSystem.setNerveDecayMult(0.6); break;
      case 'warpRecharge':
        if (this._warp.state === 'cooldown') {
          this._warp.left *= 0.65; this._warp.total *= 0.65;
        }
        break;
      case 'clashDuration': this.powerupManager.addClashBonus(3000); break;
      case 'phaseDuration': this.powerupManager.addPhaseBonus(2000); break;
      case 'magnet':        this.powerupManager.enableMagnet(); break;
      case 'zoneBoost':     this.scoreSystem.setZoneMult(3.0); break;
    }
  }

  // ============================================================== MAIN UPDATE
  update(time, rawDelta) {
    if (this.state !== S.PLAYING) return;
    const dt = Math.min(rawDelta, CONFIG.MAX_FRAME_DELTA);

    const warpActive = this._warp.state === 'active';
    const ghostMult  = warpActive ? CONFIG.TIME_WARP_GHOST_MULT  : 1;
    const playerMult = warpActive ? CONFIG.TIME_WARP_PLAYER_MULT : 1;

    this.player.update(dt * playerMult);
    this.recorder.record(this.player.x, this.player.y, dt);
    this.ghostManager.setLure(this.powerupManager.decoyPosition);
    this.ghostManager.update(ghostMult, dt);
    this.powerupManager.update(this.player.x, this.player.y);

    this.survivalTime += dt;
    this._updateWarp(dt);

    const ghostsNow = this.ghostManager.getAllGhosts();
    const scoreMult = this.scoreSystem.update(this.player.x, this.player.y, ghostsNow, dt);

    // Visual updates
    this._updateAmbientParticles(dt);
    this._drawEntityShadows();
    if (this._warp.state === 'active') this._updateWarpScanLines();

    const tension = Math.min(1, this.ghostManager.ghostCount / CONFIG.MAX_GHOSTS);
    this.audioManager.setTension(tension);
    this._updateVignette(tension);
    this._updateWarpTint();

    // ── Danger proximity + near-miss ──────────────────────
    const WARN = CONFIG.WARN_DIST, NEAR = CONFIG.NEAR_MISS_DIST + 12;
    const inPhase = this.powerupManager.phaseActive;
    let anyDanger = false;
    const nextNear = new Set();

    for (const ghost of ghostsNow) {
      const dist = Math.hypot(this.player.x - ghost.x, this.player.y - ghost.y);
      if (ghost.harmful && dist < WARN) { ghost.setDangerIntensity(1 - dist / WARN); anyDanger = true; }
      else ghost.setDangerIntensity(0);
      if (ghost.harmful && !inPhase && dist < NEAR) nextNear.add(ghost);
    }

    for (const g of this._nearMissTracked) {
      if (nextNear.has(g) || !g.harmful) continue;
      const last = this._nearMissLast.get(g);
      if (last !== undefined && this.survivalTime - last < 1500) continue;
      this._nearMissLast.set(g, this.survivalTime);
      this._onNearMiss(g);
    }
    this._nearMissTracked = nextNear;
    for (const g of this._nearMissLast.keys()) if (!g.alive) this._nearMissLast.delete(g);

    this._updateBorderPulse(anyDanger);

    if (anyDanger && time - this._lastWarnSoundAt > 500) {
      this.audioManager.playWarning(); this._lastWarnSoundAt = time;
    }
    if (this.player.isMoving && time - this._lastMoveSoundAt > 80) {
      this.audioManager.playMove(); this._lastMoveSoundAt = time;
    }

    // Nerve colour shift
    const nerveLevel = (this.scoreSystem.nerveMultiplier - 1) / (CONFIG.NERVE_MAX_MULT - 1);
    this.player.nerveLevel = Phaser.Math.Clamp(nerveLevel, 0, 1);

    if (this.scoreSystem.peakActive && !this._peakFlashShown) {
      this._peakFlashShown = true;
      this._showFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2 - 40, 'PEAK BONUS ×2', '#ffd700', '16px');
    } else if (!this.scoreSystem.peakActive) {
      this._peakFlashShown = false;
    }

    this._updateHud(scoreMult);

    // ── Collision ─────────────────────────────────────────
    if (this._invulnLeft > 0) this._invulnLeft -= dt;
    const invuln = this._invulnLeft > 0;
    this.player.graphics.setAlpha(inPhase ? 0.45 : invuln ? (Math.floor(time / 80) % 2 ? 0.35 : 1) : 1);
    if (!inPhase && !invuln && !this.godMode) {
      const hitGhost = CollisionSystem.check(this.player, ghostsNow);
      if (hitGhost) {
        if (this.powerupManager.clashActive) this._clashKill(hitGhost);
        else { this.onDeath(hitGhost); return; }
      }
    }

    this._checkMilestones();
  }

  _updateHud(scoreMult = this.scoreSystem.multiplier) {
    this.uiManager.update({
      survivalMs:      this.survivalTime,
      score:           this.scoreSystem.score,
      mult:            scoreMult,
      ghostCount:      this.ghostManager.ghostCount,
      nextSpawnMs:     this.ghostManager.getTimeUntilNextSpawn(),
      nextGhostNumber: this.ghostManager.nextGhostNumber,
      overdrive:       this.ghostManager.isOverdrive,
      warpState:       this._warp.state,
      warpProgress:    this._warpProgress,
      nerve:           this.scoreSystem.nerveMultiplier,
      held:            this.powerupManager.heldType,
      activeType:      this.powerupManager.activeType,
      activeProgress:  this.powerupManager.activeProgress,
      buffs:           [...this._buffs].map(k => BUFF_BY_KEY[k].label),
    });
  }

  _onNearMiss(g) {
    const combo = this.scoreSystem.recordNearMiss();
    const dist = Math.hypot(this.player.x - g.x, this.player.y - g.y);
    const closeness = Math.max(0, 1 - dist / (CONFIG.NEAR_MISS_DIST + 12));
    this.audioManager.playNearMiss(closeness);

    // Near-misses shave time off the warp cooldown
    if (this._warp.state === 'cooldown') {
      this._warp.left = Math.max(0, this._warp.left - this._warp.total * CONFIG.WARP_NEAR_MISS_REFUND);
      this._showFloatingText(this.player.x, this.player.y + 30, 'WARP -20%', '#00ffcc', '10px');
    }

    const pts = Math.round(CONFIG.NEAR_MISS_POINTS * combo * this._preset.scoreMult);
    if (combo >= 2) {
      this._showFloatingText(this.player.x, this.player.y - 30, `×${combo} DODGE  +${pts}`, '#ffd700', '13px');
    } else {
      this._screenFlash(0xffffff, 0.10, 200, 88);
      this._showFloatingText(g.x, g.y - 20, `CLOSE CALL  +${pts}`, '#ffffff', '12px');
    }
  }

  // ============================================================== DEATH
  onDeath() {
    if (this.state !== S.PLAYING) return;
    this.state = S.DYING;
    this.touchControls.setEnabled(false);
    this.audioManager.playDeath(this.survivalTime);
    this.audioManager.stopAdaptiveBg();
    this.ghostManager.stop();
    this.powerupManager.stop();
    this._clearWarpVisuals();
    this._borderPulseGfx.clear();
    this.player.kill();
    this._pauseBtn.setVisible(false);
    this.uiManager.showDead();

    DeathEffect.play(this, this.player.x, this.player.y);
    this.ghostManager.getAllGhosts().forEach(g => g.flashDanger());

    this._screenFlash(0xffffff, 0.9, 450, 100);
    this._screenFlash(0xff0000, 0.42, 650, 99, 80);
    Settings.shake(this.cameras.main, CONFIG.SCREEN_SHAKE_MS, CONFIG.SCREEN_SHAKE_INT / 1000);

    // Save the run immediately so it isn't lost if the player quits during the animation
    const score = Math.floor(this.scoreSystem.score);
    const prevBest = Leaderboard.best(this._difficulty);
    this._result = {
      score,
      prevBest,
      ...Leaderboard.add(this._difficulty, {
        score, time: Math.round(this.survivalTime), echoes: this.ghostManager.totalSpawned, date: Date.now(),
      }),
    };

    this.time.delayedCall(CONFIG.DEATH_HOLD_MS, () => { this.state = S.DEAD; this._showDeathScreen(); });
  }

  _showDeathScreen() {
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    const pw=540, ph=450;
    const r = this._result, st = this.scoreSystem.stats;

    const panel=this.add.graphics().setDepth(90).setAlpha(0);
    panel.fillStyle(0x000000,0.7); panel.fillRoundedRect(cx-pw/2+8,cy-ph/2+8,pw,ph,14);
    panel.fillStyle(0x000000,0.92); panel.fillRoundedRect(cx-pw/2,cy-ph/2,pw,ph,14);
    panel.lineStyle(1,0x2a5080,0.8); panel.strokeRoundedRect(cx-pw/2,cy-ph/2,pw,ph,14);
    panel.lineStyle(2,0xff3355,0.85); panel.strokeRoundedRect(cx-pw/2+4,cy-ph/2+4,pw-8,ph-8,11);
    this.tweens.add({targets:panel,alpha:1,duration:320,ease:'Power2'});

    const TARGET='ECHO TERMINATED';
    const GLYPHS='#%&@$*+=?!/\\<>';
    const titleEl=this.add.text(cx,cy-190,TARGET,{fontFamily:'Orbitron, monospace',fontSize:'26px',color:CONFIG.COLOR_DANGER,align:'center'}).setOrigin(0.5).setDepth(95).setAlpha(0);
    this.time.delayedCall(180,()=>{
      titleEl.setAlpha(1);
      let step=0;
      this.time.addEvent({delay:42,repeat:14,callback:()=>{
        step++;
        const n=Math.floor((step/14)*TARGET.length);
        const scramble=Array.from({length:TARGET.length-n},()=>GLYPHS[Math.floor(Math.random()*GLYPHS.length)]).join('');
        titleEl.setText(TARGET.slice(0,n)+scramble);
      }});
    });

    const fmt = (n) => n.toLocaleString('en-US');
    const rankStr = r.rank ? `RANK #${r.rank} ON ${this._preset.label}` : `${this._preset.label} · NOT RANKED`;
    const lines = [
      { t: 'SCORE', c: '#667788', s: '11px', y: -148 },
      { t: fmt(r.score), c: '#ffd700', s: '32px', y: -120, font: 'Orbitron, monospace' },
      { t: r.newBestScore ? 'NEW BEST SCORE' : `BEST ${fmt(r.prevBest.score)}`, c: r.newBestScore ? '#ffd700' : '#667788', s: '12px', y: -88 },
      { t: `SURVIVED ${(this.survivalTime/1000).toFixed(2)}s${r.newBestTime ? '  ·  NEW BEST TIME' : ''}`, c: '#ffffff', s: '16px', y: -56 },
      { t: rankStr, c: '#a855f7', s: '13px', y: -28 },
      { t: `ECHOES SPAWNED ${this.ghostManager.totalSpawned}   ·   NEAR-MISSES ${st.nearMisses}   ·   BEST COMBO ${st.bestCombo >= 2 ? `×${st.bestCombo}` : '-'}`, c: '#ff8c00', s: '12px', y: 4 },
      { t: `WARPS ${st.warpUses}   ·   CLASH KILLS ${st.clashKills}   ·   POWERUPS ${st.powerupsCollected}`, c: '#00f5ff', s: '12px', y: 28 },
      { t: `PEAK NERVE ×${st.peakNerve.toFixed(1)}   ·   BUFFS ${this._buffs.size}   ·   ZONE TIME ${(st.scoreZoneTimeMs/1000).toFixed(1)}s`, c: '#aabbcc', s: '12px', y: 52 },
    ];
    lines.forEach(({ t, c, s, y, font }, i) => {
      const el = this.add.text(cx, cy + y + 16, t, { fontFamily: font || 'Share Tech Mono, monospace', fontSize: s, color: c, align: 'center' }).setOrigin(0.5).setDepth(95).setAlpha(0);
      this.tweens.add({ targets: el, alpha: 1, y: cy + y, delay: 400 + i * 90, duration: 260, ease: 'Back.easeOut' });
    });

    const a = this.audioManager;
    const buttons = [
      new Button(this, cx - 100, cy + 120, 'RESTART',   { width: 170, depth: 96, audio: a, onClick: () => this.restartGame() }),
      new Button(this, cx + 100, cy + 120, 'MAIN MENU', { width: 170, depth: 96, audio: a, color: '#a8bddd', onClick: () => this._quitToMenu() }),
    ];
    buttons.forEach(b => {
      b.setAlpha(0);
      this.tweens.add({ targets: b.parts, alpha: 1, delay: 1100, duration: 300 });
    });
    bindButtonNav(this, buttons, { horizontal: true, audio: a });

    const prompt=this.add.text(cx,cy+178,'SPACE RESTART  ·  ESC MENU',{fontFamily:'Share Tech Mono, monospace',fontSize:'12px',color:'#556677'}).setOrigin(0.5).setDepth(95).setAlpha(0);
    this.tweens.add({targets:prompt,alpha:1,delay:1200,duration:300});
  }

  restartGame() {
    if (this._leaving) return;
    this._leaving = true;
    this.scene.restart({ difficulty: this._difficulty });
  }

  _quitToMenu() {
    if (this._leaving) return;
    this._leaving = true;
    this.audioManager.stopAdaptiveBg();
    this.time.paused = false;
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MenuScene'));
  }
}
