import { CONFIG }         from '../config/GameConfig.js';
import { Player }         from '../entities/Player.js';
import { Recorder }       from '../systems/Recorder.js';
import { GhostManager }   from '../systems/GhostManager.js';
import { PowerupManager } from '../systems/PowerupManager.js';
import { ScoreSystem }    from '../systems/ScoreSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { UIManager }      from '../ui/UIManager.js';
import { WaveAnnouncer }  from '../ui/WaveAnnouncer.js';
import { DeathEffect }    from '../effects/DeathEffect.js';
import { ClashKillEffect } from '../effects/ClashKillEffect.js';
import { AudioManager }   from '../systems/AudioManager.js';

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  init(data) {
    const diff   = (data && data.difficulty) || 'normal';
    const preset = CONFIG.DIFFICULTIES[diff] || CONFIG.DIFFICULTIES.normal;
    this._ghostDelay    = preset.ghostDelay;
    this._ghostInterval = preset.ghostInterval;
    this._difficulty    = diff;
    // Passive buff from milestone choices: { nerveDecay, warpRecharge, clashDuration }
    this._passiveBuff   = data && data.passiveBuff ? data.passiveBuff : null;
  }

  create() {
    this.state = 'PLAYING';

    this.audioManager = new AudioManager();
    this.input.on('pointerdown', () => this.audioManager.resume());
    this.input.keyboard.on('keydown', () => this.audioManager.resume());

    // Graphics layers
    this._bgGraphics      = this.add.graphics().setDepth(0);
    this._perspGrid       = this.add.graphics().setDepth(1);
    this._gridGraphics    = this.add.graphics().setDepth(2);
    this._arenaGraphics   = this.add.graphics().setDepth(3);
    this._ambientGraphics = this.add.graphics().setDepth(4);
    this._depthGraphics   = this.add.graphics().setDepth(9);
    this._borderPulseGfx  = this.add.graphics().setDepth(35);
    this._vignetteGfx     = this.add.graphics().setDepth(34);  // tension vignette
    this._warpTintGfx     = this.add.graphics().setDepth(37);  // bullet-time desaturation overlay

    this._drawBackground();
    this._drawPerspectiveGrid();
    this._drawFlatGrid();
    this._drawArenaFrame();
    this._ambientParticles = this._createAmbientParticles();

    this._warpOverlay  = null;
    this._warpScanLine = null;
    this._warpGridGfx  = null;

    this.recorder      = new Recorder();
    this.scoreSystem   = new ScoreSystem(this);
    this.waveAnnouncer = new WaveAnnouncer(this);
    this.ghostManager  = new GhostManager(this, this.recorder, this.audioManager, this.waveAnnouncer, this._ghostDelay);
    this.player        = new Player(this);
    this.powerupManager= new PowerupManager(this, this.audioManager, this.scoreSystem);
    this.uiManager     = new UIManager(this);

    // Apply passive buff from previous milestone choice
    if (this._passiveBuff) this._applyPassiveBuff(this._passiveBuff);

    this.survivalTime       = 0;
    this.gameStartTime      = this.time.now;
    this._lastMoveSoundTime = 0;
    this._lastWarnSoundTime = 0;
    this._moveSoundInterval = 80;
    this._warnSoundInterval = 500;

    this._milestones = [CONFIG.MILESTONE_1, CONFIG.MILESTONE_2, CONFIG.MILESTONE_3];
    this._milestonesHit = new Set();

    // Near-miss tracking
    this._nearMissTracked = new Set();
    this._nearMissWorkSet = new Set();
    this._nearMissIds = new Set();

    // Warp near-miss recharge tracking
    this._warpRechargeReady = false;

    this._warpUseCount = 0;

    this.timeWarpAvailable   = true;
    this.timeWarpActive      = false;
    this._warpCooldownStart  = null;

    this._pauseGroup = null;

    // Passive buff state (accumulated across restarts within the same run — reset on true restart)
    this._activePBuff = null;

    this.input.keyboard.on('keydown-SHIFT', () => {
      if (this.timeWarpAvailable && !this.timeWarpActive && this.state === 'PLAYING') {
        this.activateTimeWarp();
      }
    });
    this.input.keyboard.on('keydown-E', () => {
      if (this.state !== 'PLAYING') return;
      this.powerupManager.activate(this.ghostManager.getAllGhosts(), (ghost) => {
        ClashKillEffect.play(this, ghost.x, ghost.y);
        this.ghostManager.killGhost(ghost);
        // Show clash chain text if multiple kills
        const kills = this.powerupManager.clashKillCount;
        if (kills >= 2) this._showFloatingText(ghost.x, ghost.y - 20, `×${kills} CHAIN!`, '#ffd700', '14px');
      });
    });
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.state === 'PLAYING')  this._pause();
      else if (this.state === 'PAUSED') this._resume();
    });
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.state === 'DEAD') this.restartGame();
      else if (this.state === 'PAUSED') this._resume();
    });
    this.input.on('pointerdown', () => {
      if (this.state === 'DEAD') this.restartGame();
    });

    this.time.delayedCall(500, () => this.audioManager.startAdaptiveBg());
  }

  _applyPassiveBuff(buff) {
    this._activePBuff = buff;
    // Buff effects applied at runtime in update / activateTimeWarp
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

  _updateAmbientParticles() {
    const p=CONFIG.ARENA_PADDING+6, W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    const g=this._ambientGraphics, now=this.time.now;
    g.clear();
    this._ambientParticles.forEach(pt=>{
      pt.x+=pt.vx; pt.y+=pt.vy;
      if(pt.x<p)pt.x=W-p; if(pt.x>W-p)pt.x=p;
      if(pt.y<p)pt.y=H-p; if(pt.y>H-p)pt.y=p;
      const tw=0.5+0.5*Math.sin(now*0.0009+pt.phase);
      g.fillStyle(pt.color,pt.alpha*tw);
      g.fillCircle(pt.x,pt.y,pt.r);
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
    if (tension < 0.1) return;
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const cx = W / 2, cy = H / 2;
    // Dark outer vignette
    for (let i = 6; i >= 1; i--) {
      const t = i / 6;
      const alpha = tension * (1 - t) * 0.35;
      g.fillStyle(0x000000, alpha);
      g.fillRect(
        cx - (W/2) * t, cy - (H/2) * t,
        W * t, H * t
      );
    }
    // Red danger tint at high tension
    if (tension > 0.5) {
      const redAlpha = (tension - 0.5) * 0.28;
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 300);
      g.fillStyle(0xff0000, redAlpha * (0.7 + pulse * 0.3));
      g.fillRect(0, 0, W, 6);
      g.fillRect(0, H - 6, W, 6);
      g.fillRect(0, 0, 6, H);
      g.fillRect(W - 6, 0, 6, H);
    }
  }

  // Bullet-time warp: blue desaturation overlay during warp
  _updateWarpTint() {
    const g = this._warpTintGfx;
    g.clear();
    if (!this.timeWarpActive) return;
    const W = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    // Subtle blue-grey desaturation layer
    g.fillStyle(0x0a1a2e, 0.18);
    g.fillRect(0, 0, W, H);
    // Blue edge glow
    g.lineStyle(8, 0x00ffcc, 0.12);
    g.strokeRect(0, 0, W, H);
  }

  _updateBorderPulse(nearbyDanger) {
    const g=this._borderPulseGfx; g.clear();
    if(!nearbyDanger) return;
    const t=(0.5+0.5*Math.sin(this.time.now/120));
    const p=CONFIG.ARENA_PADDING, W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    g.lineStyle(8,0xff3355,t*0.18);
    g.strokeRect(p,p,W-p*2,H-p*2);
    g.lineStyle(3,0xff8c00,t*0.35);
    g.strokeRect(p,p,W-p*2,H-p*2);
  }

  // =============================================================== FLOATING TEXT
  _showFloatingText(x, y, text, color = '#ffffff', fontSize = '12px') {
    const pad = CONFIG.ARENA_PADDING;
    const cx  = Phaser.Math.Clamp(x, pad + 40, CONFIG.CANVAS_WIDTH  - pad - 40);
    const cy  = Phaser.Math.Clamp(y, pad + 20, CONFIG.CANVAS_HEIGHT - pad - 60);
    const t = this.add.text(cx, cy, text, {
      fontFamily: 'Orbitron, monospace', fontSize, color,
      stroke: '#000000', strokeThickness: 4, align: 'center'
    }).setOrigin(0.5).setDepth(89).setAlpha(0);
    this.tweens.add({
      targets: t, alpha: { from: 1, to: 0 },
      y: { from: cy, to: cy - 50 },
      duration: 1100, ease: 'Power2',
      onComplete: () => t.destroy()
    });
  }

  // =============================================================== TIME WARP
  activateTimeWarp() {
    this.timeWarpActive   = true;
    this.timeWarpAvailable= false;
    this._warpCooldownStart = null;
    this._warpRechargeReady = false;
    this.scoreSystem.recordWarpUse();
    this._warpUseCount++;

    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    const cx=W/2, cy=H/2;
    this._triggerChromaticFlash();
    const overlay=this.add.rectangle(cx,cy,W,H,0x000e22).setDepth(35).setAlpha(0);
    this.tweens.add({targets:overlay,alpha:0.2,duration:250,ease:'Power2'});
    this._warpOverlay=overlay;
    this._warpScanLine=this.add.graphics().setDepth(36);
    this._triggerGridRipple(cx,cy);
    this.player._warpAura=true;
    this._showWarpBanner();

    // Buff: shorter cooldown if nearMiss buff active
    const cooldown = (this._activePBuff === 'warpRecharge')
      ? CONFIG.TIME_WARP_COOLDOWN * 0.65
      : CONFIG.TIME_WARP_COOLDOWN;

    this.time.delayedCall(CONFIG.TIME_WARP_DURATION,()=>{
      this.timeWarpActive=false; this.player._warpAura=false;
      if(this._warpOverlay){this.tweens.add({targets:this._warpOverlay,alpha:0,duration:350,onComplete:()=>{this._warpOverlay&&this._warpOverlay.destroy();this._warpOverlay=null;}});}
      if(this._warpScanLine){this._warpScanLine.destroy();this._warpScanLine=null;}
      if(this._warpGridGfx){this._warpGridGfx.destroy();this._warpGridGfx=null;}
      this._warpCooldownStart=this.time.now;
      this._warpRechargeReady = true;  // allow near-miss to speed up recharge
      this.time.delayedCall(cooldown,()=>{
        this.timeWarpAvailable=true; this._warpCooldownStart=null; this._warpRechargeReady=false;
        this._flashWarpReady();
      });
    });
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
      this.tweens.add({targets:r,alpha:{from:0.28,to:0},duration:400,delay,ease:'Power3',onComplete:()=>r.destroy()});
    });
    const flash=this.add.rectangle(cx,cy,W,H,0xffffff).setAlpha(0.18).setDepth(82);
    this.tweens.add({targets:flash,alpha:0,duration:180,ease:'Power3',onComplete:()=>flash.destroy()});
  }

  _triggerGridRipple(cx,cy) {
    if(this._warpGridGfx) this._warpGridGfx.destroy();
    const r=this.add.graphics().setDepth(6); this._warpGridGfx=r;
    let elapsed=0;
    const ev=this.time.addEvent({delay:16,repeat:44,callback:()=>{
      elapsed+=16; const prog=elapsed/700;
      const rad=20+Math.max(CONFIG.CANVAS_WIDTH,CONFIG.CANVAS_HEIGHT)*0.85*prog;
      const alpha=0.85*(1-prog);
      r.clear();
      r.lineStyle(2.5,0x00ffcc,alpha); r.strokeCircle(cx,cy,rad);
      r.lineStyle(1.5,0x00f5ff,alpha*0.5); r.strokeCircle(cx,cy,rad*0.62);
      if(prog>=1){r.destroy();this._warpGridGfx=null;ev.destroy();}
    }});
  }

  _showWarpBanner() {
    const cx=CONFIG.CANVAS_WIDTH/2;
    const banner=this.add.text(cx,82,'⟳  T I M E   W A R P  ⟳',{fontFamily:'Orbitron, monospace',fontSize:'17px',color:'#00ffcc',stroke:'#000000',strokeThickness:5}).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.tweens.add({targets:banner,alpha:1,y:{from:100,to:82},duration:210,ease:'Back.easeOut',onComplete:()=>{
      this.tweens.add({targets:banner,alpha:0.35,duration:480,yoyo:true,repeat:Math.ceil(CONFIG.TIME_WARP_DURATION/960),ease:'Sine.easeInOut',onComplete:()=>{
        this.tweens.add({targets:banner,alpha:0,y:62,duration:260,ease:'Power2',onComplete:()=>banner.destroy()});
      }});
    }});
  }

  _flashWarpReady() {
    const cx=CONFIG.CANVAS_WIDTH/2;
    const t=this.add.text(cx,82,'WARP READY',{fontFamily:'Orbitron, monospace',fontSize:'13px',color:'#00f5ff'}).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.tweens.add({targets:t,alpha:{from:0,to:1},duration:200,yoyo:true,repeat:1,onComplete:()=>t.destroy()});
  }

  // ============================================================== PAUSE
  _pause() {
    this.state='PAUSED';
    this.physics && this.physics.pause();
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    const group = [];
    const overlay=this.add.rectangle(cx,cy,W,H,0x000000).setAlpha(0.55).setDepth(200);
    group.push(overlay);
    const panel=this.add.graphics().setDepth(201);
    panel.fillStyle(0x000000,0.9); panel.fillRoundedRect(cx-160,cy-120,320,250,12);
    panel.lineStyle(2,0x00f5ff,0.5); panel.strokeRoundedRect(cx-160,cy-120,320,250,12);
    group.push(panel);
    const title=this.add.text(cx,cy-88,'PAUSED',{fontFamily:'Orbitron, monospace',fontSize:'24px',color:CONFIG.COLOR_CYAN}).setOrigin(0.5).setDepth(202);
    const warpStr=this.timeWarpActive?'WARP: ACTIVE':this.timeWarpAvailable?'WARP: READY':'WARP: RECHARGING';
    const pwStr=this.powerupManager.heldType?`HELD: ${this.powerupManager.heldType.toUpperCase()}`:'HELD: NONE';
    const stats=this.add.text(cx,cy-30,`TIME: ${(this.survivalTime/1000).toFixed(2)}s\nECHOES: ${this.ghostManager.ghostCount}\n${warpStr}\n${pwStr}`,{fontFamily:'Share Tech Mono, monospace',fontSize:'13px',color:'#aabbcc',align:'center'}).setOrigin(0.5).setDepth(202);
    const hint=this.add.text(cx,cy+90,'ESC / SPACE — RESUME',{fontFamily:'Share Tech Mono, monospace',fontSize:'12px',color:'#334455'}).setOrigin(0.5).setDepth(202);
    group.push(title,stats,hint);
    this._pauseGroup=group;
  }

  _resume() {
    this.state='PLAYING';
    if(this._pauseGroup){this._pauseGroup.forEach(o=>o.destroy());this._pauseGroup=null;}
  }

  // ============================================================== MILESTONES
  _checkMilestones() {
    this._milestones.forEach(ms=>{
      if(this.survivalTime>=ms && !this._milestonesHit.has(ms)){
        this._milestonesHit.add(ms);
        this._triggerMilestone(ms);
      }
    });
  }

  _triggerMilestone(ms) {
    this.state = 'PAUSED';
    this.audioManager.playMilestone();
    this.scoreSystem.applyMilestoneBonus();

    const labels={[CONFIG.MILESTONE_1]:'TEMPORAL ADEPT',  [CONFIG.MILESTONE_2]:'CHRONO MASTER', [CONFIG.MILESTONE_3]:'ECHO SOVEREIGN'};
    const label=labels[ms]||'MILESTONE';
    const cx=CONFIG.CANVAS_WIDTH/2, cy=CONFIG.CANVAS_HEIGHT/2;
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;

    // Gold screen flash
    const flash=this.add.rectangle(cx,cy,W,H,0xffd700).setAlpha(0).setDepth(73);
    this.tweens.add({targets:flash,alpha:{from:0.22,to:0},duration:500,ease:'Power2',onComplete:()=>flash.destroy()});

    // Zoom pulse on arena border
    this.cameras.main.zoomTo(1.018, 200, 'Power2', true);
    this.time.delayedCall(200, () => this.cameras.main.zoomTo(1.0, 300, 'Power2', true));

    const t=this.add.text(cx,cy,'✦ '+label+' ✦',{
      fontFamily:'Orbitron, monospace',fontSize:'22px',color:CONFIG.COLOR_GOLD,
      stroke:'#000000',strokeThickness:6,align:'center'
    }).setOrigin(0.5).setDepth(75).setAlpha(0);
    this.tweens.add({targets:t,alpha:1,y:{from:cy+30,to:cy},duration:400,ease:'Back.easeOut',
      onComplete:()=>{this.time.delayedCall(1200,()=>{
        // After label fades, show buff choice if not at last milestone
        this.tweens.add({targets:t,alpha:0,duration:400,onComplete:()=>{
          t.destroy();
          this._showBuffChoice();
        }});
      });}
    });
  }

  /** Show 3 passive buff choices after each milestone */
  _showBuffChoice() {
    if (this.state === 'DEAD') return;
    this.state = 'PAUSED';

    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    const buffs = [
      { key: 'nerveDecay',    label: 'NERVE ANCHOR',  desc: 'Nerve decays 40% slower', color: '#ff8c00' },
      { key: 'warpRecharge',  label: 'WARP SPRINT',   desc: 'Warp cooldown –35%',       color: '#00ffcc' },
      { key: 'clashDuration', label: 'CLASH SURGE',   desc: 'Clash lasts 3s longer',    color: '#ff6600' },
    ];

    const group = [];
    const overlay=this.add.rectangle(cx,cy,W,H,0x000000).setAlpha(0.7).setDepth(200);
    group.push(overlay);

    const panel=this.add.graphics().setDepth(201);
    panel.fillStyle(0x000000,0.92); panel.fillRoundedRect(cx-240,cy-130,480,270,14);
    panel.lineStyle(2,0xffd700,0.6); panel.strokeRoundedRect(cx-240,cy-130,480,270,14);
    group.push(panel);

    const title=this.add.text(cx,cy-112,'CHOOSE YOUR BUFF',{fontFamily:'Orbitron, monospace',fontSize:'16px',color:'#ffd700'}).setOrigin(0.5).setDepth(202);
    group.push(title);

    buffs.forEach((b, i) => {
      const bx = cx - 150 + i * 150;
      const by = cy - 10;
      const bg = this.add.graphics().setDepth(202);
      bg.fillStyle(0x111111, 0.9); bg.fillRoundedRect(bx - 60, by - 50, 120, 110, 8);
      bg.lineStyle(2, Phaser.Display.Color.HexStringToColor(b.color).color, 0.7);
      bg.strokeRoundedRect(bx - 60, by - 50, 120, 110, 8);
      group.push(bg);

      const numT = this.add.text(bx, by - 32, `[${i+1}]`, {fontFamily:'Orbitron, monospace',fontSize:'13px',color:b.color}).setOrigin(0.5).setDepth(203);
      const lbl  = this.add.text(bx, by,      b.label,    {fontFamily:'Orbitron, monospace',fontSize:'13px',color:b.color}).setOrigin(0.5).setDepth(203);
      const dsc  = this.add.text(bx, by + 26, b.desc,     {fontFamily:'Share Tech Mono, monospace',fontSize:'11px',color:'#aabbcc',align:'center',wordWrap:{width:110}}).setOrigin(0.5).setDepth(203);
      group.push(numT, lbl, dsc);
    });

    const cleanup = (buffKey) => {
      group.forEach(o => o.destroy());
      this._activePBuff = buffKey;
      this._applyImmediateBuff(buffKey);
      this.state = 'PLAYING';
    };

    const onKey = (buffKey) => {
      this.input.keyboard.off('keydown-ONE',          onOne);
      this.input.keyboard.off('keydown-TWO',          onTwo);
      this.input.keyboard.off('keydown-THREE',        onThree);
      this.input.keyboard.off('keydown-NUMPAD_ONE',   onOne);
      this.input.keyboard.off('keydown-NUMPAD_TWO',   onTwo);
      this.input.keyboard.off('keydown-NUMPAD_THREE', onThree);
      cleanup(buffKey);
    };
    const onOne   = () => onKey(buffs[0].key);
    const onTwo   = () => onKey(buffs[1].key);
    const onThree = () => onKey(buffs[2].key);

    this.input.keyboard.on('keydown-ONE',          onOne);
    this.input.keyboard.on('keydown-TWO',          onTwo);
    this.input.keyboard.on('keydown-THREE',        onThree);
    this.input.keyboard.on('keydown-NUMPAD_ONE',   onOne);
    this.input.keyboard.on('keydown-NUMPAD_TWO',   onTwo);
    this.input.keyboard.on('keydown-NUMPAD_THREE', onThree);
  }

  /** Immediately apply the picked buff effect */
  _applyImmediateBuff(buff) {
    if (buff === 'clashDuration') {
      this.powerupManager.setClashDurationOverride(8000);
    }
    // nerveDecay and warpRecharge are applied in update() / activateTimeWarp()
  }

  // ============================================================== MAIN UPDATE
  update(time, delta) {
    if(this.state!=='PLAYING') return;

    const ghostMult =(this.timeWarpActive ? CONFIG.TIME_WARP_GHOST_MULT  : 1);
    const playerMult=(this.timeWarpActive ? CONFIG.TIME_WARP_PLAYER_MULT : 1);

    const ghostsNow = this.ghostManager.getAllGhosts();

    this.player.update(delta*playerMult);
    this.recorder.record(this.player.x, this.player.y);
    this.ghostManager.update(ghostMult, delta);
    this.powerupManager.update(this.player.x, this.player.y);

    this.survivalTime=this.time.now - this.gameStartTime;
    this._checkMilestones();

    const scoreMult = this.scoreSystem.update(this.player.x, this.player.y, ghostsNow, delta);

    // Visual updates
    this._updateAmbientParticles();
    this._drawEntityShadows();
    if(this.timeWarpActive) this._updateWarpScanLines();

    // Tension level
    const tension=Math.min(1, this.ghostManager.ghostCount / CONFIG.MAX_GHOSTS);
    this.audioManager.setTension(tension);

    // Vignette scales with tension
    this._updateVignette(tension);

    // Bullet-time warp tint
    this._updateWarpTint();

    // Warp cooldown
    let warpProgress=1;
    if(!this.timeWarpAvailable && this._warpCooldownStart!==null){
      warpProgress=Math.min(1,(this.time.now-this._warpCooldownStart)/CONFIG.TIME_WARP_COOLDOWN);
    } else if(this.timeWarpActive){ warpProgress=0; }

    // Danger proximity + near-miss
    const WARN_DIST=65, NEAR_MISS=CONFIG.NEAR_MISS_DIST;
    let anyNear=false, anyDanger=false;
    const nextNear=this._nearMissWorkSet;
    nextNear.clear();

    ghostsNow.forEach(ghost=>{
      const dist=Math.hypot(this.player.x-ghost.x, this.player.y-ghost.y);
      if(dist<WARN_DIST){ ghost.setDangerIntensity(1-dist/WARN_DIST); anyNear=true; anyDanger=true; }
      else ghost.setDangerIntensity(0);
      if(dist<NEAR_MISS+12) nextNear.add(ghost);
    });

    // Near-miss detection
    this._nearMissTracked.forEach(g=>{
      if(!nextNear.has(g) && !this._nearMissIds.has(g)){
        this._nearMissIds.add(g);
        const combo = this.scoreSystem.recordNearMiss();

        // Closeness: how close relative to NEAR_MISS threshold
        const dist = Math.hypot(this.player.x-g.x, this.player.y-g.y);
        const closeness = Math.max(0, 1 - dist / (NEAR_MISS + 12));
        this.audioManager.playNearMiss(closeness);

        // Warp near-miss recharge: if warp on cooldown, shave 20% off remaining time
        if (this._warpRechargeReady && this._warpCooldownStart !== null) {
          const elapsed = this.time.now - this._warpCooldownStart;
          const newElapsed = elapsed + CONFIG.TIME_WARP_COOLDOWN * 0.2;
          this._warpCooldownStart = this.time.now - Math.min(newElapsed, CONFIG.TIME_WARP_COOLDOWN);
          this._showFloatingText(this.player.x, this.player.y - 30, 'WARP –20%', '#00ffcc', '10px');
        }

        // Floating near-miss text with combo
        if (combo >= 2) {
          this._showFloatingText(this.player.x, this.player.y - 30, `×${combo} DODGE!`, '#ffd700', '13px');
        } else {
          this._flashNearMiss(g.x, g.y);
        }
      }
    });

    // Swap sets
    this._nearMissWorkSet=this._nearMissTracked;
    this._nearMissTracked=nextNear;

    const ghostSet=new Set(ghostsNow);
    this._nearMissIds.forEach(g=>{ if(!ghostSet.has(g)) this._nearMissIds.delete(g); });

    this._updateBorderPulse(anyDanger);

    if(anyNear && this.time.now-this._lastWarnSoundTime>this._warnSoundInterval){
      this.audioManager.playWarning(); this._lastWarnSoundTime=this.time.now;
    }

    if((this.player.vx!==0||this.player.vy!==0)&&this.time.now-this._lastMoveSoundTime>this._moveSoundInterval){
      this.audioManager.playMove(); this._lastMoveSoundTime=this.time.now;
    }

    // Update player nerve level for color shift
    const nerveLevel = (this.scoreSystem.nerveMultiplier - 1) / (CONFIG.NERVE_MAX_MULT - 1);
    this.player.nerveLevel = Phaser.Math.Clamp(nerveLevel, 0, 1);

    // Peak multiplier flash text
    if (this.scoreSystem.peakActive && !this._peakFlashShown) {
      this._peakFlashShown = true;
      this._showFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2 - 40, '⚡ PEAK ×8 ⚡', '#ffd700', '16px');
    } else if (!this.scoreSystem.peakActive) {
      this._peakFlashShown = false;
    }

    const inPhase=this.powerupManager.phaseActive;

    if(!inPhase){
      const hitGhost=CollisionSystem.check(this.player, ghostsNow);
      if(hitGhost){
        const clashAbsorbed=this.powerupManager.clashActive && this.powerupManager.tryClashKill(hitGhost);
        if(!clashAbsorbed) this.onDeath(hitGhost);
      }
    }

    this.player.graphics.setAlpha(inPhase ? 0.45 : 1);

    // UI update
    const pwActive = this.powerupManager.activeType;
    const pwType   = this.powerupManager.heldType;
    const pwProg   = this.powerupManager.activeProgress;

    this.uiManager.update(
      this.survivalTime, this.ghostManager.ghostCount,
      this.ghostManager.getTimeUntilNextSpawn(), this.ghostManager.nextGhostNumber,
      this.ghostManager.isOverdrive,
      this.timeWarpAvailable, this.timeWarpActive, warpProgress,
      this.scoreSystem.nerveMultiplier, pwType, pwActive, pwProg,
      scoreMult
    );
  }

  _flashNearMiss(gx, gy) {
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    const f=this.add.rectangle(cx,cy,W,H,0xffffff).setAlpha(0.10).setDepth(88);
    this.tweens.add({targets:f,alpha:0,duration:200,ease:'Power2',onComplete:()=>f.destroy()});
    const tx = gx !== undefined ? gx : cx;
    const ty = gy !== undefined ? gy - 20 : cy - 60;
    this._showFloatingText(tx, ty, 'CLOSE CALL', '#ffffff', '12px');
  }

  // ============================================================== DEATH
  onDeath(ghost) {
    if(this.state!=='PLAYING') return;
    this.state='DYING';
    this.audioManager.playDeath(this.survivalTime);
    this.audioManager.stopAdaptiveBg();
    this.ghostManager.stop();
    this.player.kill();
    this.powerupManager.stop();

    DeathEffect.play(this, this.player.x, this.player.y);
    this.ghostManager.getAllGhosts().forEach(g=>g.flashDanger());

    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    const flash=this.add.rectangle(cx,cy,W,H,0xffffff).setAlpha(0.9).setDepth(100);
    this.tweens.add({targets:flash,alpha:0,duration:450,ease:'Power2',onComplete:()=>flash.destroy()});
    const red=this.add.rectangle(cx,cy,W,H,0xff0000).setAlpha(0).setDepth(99);
    this.tweens.add({targets:red,alpha:{from:0.42,to:0},duration:650,delay:80,ease:'Power2',onComplete:()=>red.destroy()});
    this.cameras.main.shake(CONFIG.SCREEN_SHAKE_MS, CONFIG.SCREEN_SHAKE_INT/1000);

    this.time.delayedCall(CONFIG.DEATH_HOLD_MS,()=>{ this.state='DEAD'; this._showDeathScreen(); });
  }

  _showDeathScreen() {
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;
    const pw=520, ph=400;

    const panel=this.add.graphics().setDepth(90).setAlpha(0);
    panel.fillStyle(0x000000,0.7); panel.fillRoundedRect(cx-pw/2+8,cy-ph/2+8,pw,ph,14);
    panel.fillStyle(0x000000,0.9); panel.fillRoundedRect(cx-pw/2,cy-ph/2,pw,ph,14);
    panel.lineStyle(1,0x2a5080,0.8); panel.strokeRoundedRect(cx-pw/2,cy-ph/2,pw,ph,14);
    panel.lineStyle(2,0xff3355,0.85); panel.strokeRoundedRect(cx-pw/2+4,cy-ph/2+4,pw-8,ph-8,11);
    this.tweens.add({targets:panel,alpha:1,duration:320,ease:'Power2'});

    const TARGET='ECHO TERMINATED';
    const GLYPHS='█▓▒░▀■□▪▫◆◇';
    const titleEl=this.add.text(cx,cy-165,TARGET,{fontFamily:'Orbitron, monospace',fontSize:'26px',color:CONFIG.COLOR_DANGER,align:'center'}).setOrigin(0.5).setDepth(95).setAlpha(0);
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

    // Update leaderboard (top-10)
    const best=parseFloat(localStorage.getItem('echorun_best')||'0');
    const isNew=this.survivalTime>best;
    if(isNew) localStorage.setItem('echorun_best',String(this.survivalTime));
    let lb=JSON.parse(localStorage.getItem('echorun_lb')||'[]');
    lb.push(this.survivalTime); lb.sort((a,b)=>b-a); lb=lb.slice(0,10);
    localStorage.setItem('echorun_lb',JSON.stringify(lb));
    const rank=lb.indexOf(this.survivalTime)+1;

    const comboText = this.scoreSystem.stats.bestCombo >= 2
      ? `BEST COMBO: ×${this.scoreSystem.stats.bestCombo}` : '';

    const stats=[
      {t:`SURVIVED: ${(this.survivalTime/1000).toFixed(2)}s`,c:'#ffffff',s:'20px'},
      {t:`ECHOES: ${this.ghostManager.ghostCount}  |  RANK #${rank} / 10`,c:'#a855f7',s:'14px'},
      {t:isNew?'✦  NEW BEST  ✦':`BEST: ${(best/1000).toFixed(2)}s`,c:isNew?'#ffd700':'#556677',s:'13px'},
      {t:`NEAR-MISSES: ${this.scoreSystem.stats.nearMisses}  ${comboText}`,c:'#ff8c00',s:'12px'},
      {t:`WARP USED: ${this.scoreSystem.stats.warpUses}  |  CLASHES: ${this.scoreSystem.stats.clashKills}`,c:'#00f5ff',s:'12px'},
      {t:`NERVE PEAK: ×${(this.scoreSystem.nerveMultiplier).toFixed(1)}  |  POWERUPS: ${this.scoreSystem.stats.powerupsCollected}`,c:'#aabbcc',s:'12px'},
      {t:this._difficulty.toUpperCase(),c:'#334455',s:'10px'},
    ];
    stats.forEach(({t,c,s},i)=>{
      const el=this.add.text(cx,cy-105+i*30,t,{fontFamily:'Share Tech Mono, monospace',fontSize:s,color:c,align:'center'}).setOrigin(0.5).setDepth(95).setAlpha(0);
      this.time.delayedCall(400+i*120,()=>{this.tweens.add({targets:el,alpha:1,y:{from:cy-85+i*30,to:cy-105+i*30},duration:260,ease:'Back.easeOut'});});
    });

    const prompt=this.add.text(cx,cy+160,'SPACE  /  TAP TO RESTART',{fontFamily:'Share Tech Mono, monospace',fontSize:'13px',color:'#00f5ff'}).setOrigin(0.5).setDepth(95).setAlpha(0);
    this.time.delayedCall(1100,()=>{prompt.setAlpha(1);this.tweens.add({targets:prompt,alpha:0.1,duration:680,yoyo:true,repeat:-1});});
  }

  restartGame() { this.scene.restart({ difficulty: this._difficulty }); }
}
