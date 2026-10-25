import Phaser from 'phaser';
import { CONFIG }       from '../config/GameConfig.js';
import { AudioManager } from '../systems/AudioManager.js';
import { Settings }     from '../systems/Settings.js';
import { Leaderboard }  from '../systems/Leaderboard.js';
import { Button }       from '../ui/Button.js';

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';

const DIFF_DESC = {
  easy:      'Echoes every 12s  ·  slower echoes  ·  score ×0.75',
  normal:    'Echoes every 9s  ·  the intended experience  ·  score ×1.0',
  hard:      'Echoes every 6s  ·  faster echoes  ·  score ×1.3',
  nightmare: 'Echoes every 4s  ·  relentless  ·  score ×1.75',
};

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2;
    const p=CONFIG.ARENA_PADDING;
    this._starting = false;
    this._difficulty = Settings.get('difficulty');
    this.audio = AudioManager.get();
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // ── Deep Background ─────────────────────────────────
    this.add.graphics().fillStyle(0x030912,1).fillRect(0,0,W,H);

    // ── Starfield ───────────────────────────────────────
    this._stars=[]; this._starGfx=this.add.graphics().setDepth(1);
    for(let i=0;i<90;i++) this._stars.push({
      x:Math.random()*W, y:Math.random()*H, r:Math.random()*1.4+0.3,
      alpha:Math.random()*0.6+0.2, sp:0.01+Math.random()*0.03, ph:Math.random()*Math.PI*2, drift:(Math.random()-0.5)*0.08
    });

    // ── Grid ────────────────────────────────────────────
    const grid=this.add.graphics().setDepth(2);
    grid.lineStyle(1,0x1e3a5f,0.2);
    for(let x=0;x<W;x+=60){grid.beginPath();grid.moveTo(x,0);grid.lineTo(x,H);grid.strokePath();}
    for(let y=0;y<H;y+=60){grid.beginPath();grid.moveTo(0,y);grid.lineTo(W,y);grid.strokePath();}

    // ── Arena border ─────────────────────────────────────
    const arena=this.add.graphics().setDepth(3);
    arena.lineStyle(2,0x2a5080,1); arena.strokeRect(p,p,W-p*2,H-p*2);

    this._cornerGfx=this.add.graphics().setDepth(4);
    this._drawCorners(0);

    // ── Animated ghost trails (decorative, kept to the arena edges) ──
    this._trailGfx=this.add.graphics().setDepth(5);
    this._trails=[
      {pts:[{x:90,y:110},{x:200,y:90},{x:250,y:210},{x:160,y:330},{x:90,y:260}],prog:0,spd:0.004,col:CONFIG.GHOST_COLOR},
      {pts:[{x:810,y:110},{x:700,y:160},{x:760,y:300},{x:820,y:420},{x:700,y:520}],prog:0.5,spd:0.003,col:0x7c3aed},
      {pts:[{x:100,y:560},{x:180,y:440},{x:120,y:380},{x:220,y:520}],prog:0.3,spd:0.0025,col:0x5b21b6},
    ];

    // ── Title ─────────────────────────────────────────────
    this._titleY = 158;
    this._titleRingGfx=this.add.graphics().setDepth(8);
    this._buildTitle(cx);

    this._fade(this.add.text(cx,258,'"Your past is your greatest enemy."',{fontFamily:'Share Tech Mono, monospace',fontSize:'14px',color:'#8ca2c0'}).setOrigin(0.5).setDepth(10),900);

    // ── Controls ─────────────────────────────────────────
    const touch = !!this.sys.game.device.input.touch;
    const ctl = touch
      ? ['DRAG TO MOVE  ·  TAP WARP / POWERUP PANELS', 'WASD / ARROWS  ·  SHIFT WARP  ·  E POWERUP  ·  ESC PAUSE']
      : ['WASD / ARROWS — MOVE     SHIFT — TIME WARP', 'E — USE POWERUP     ESC — PAUSE     M — SOUND'];
    ctl.forEach((line, i) => this._fade(this.add.text(cx, 286 + i * 18, line, {
      fontFamily:'Share Tech Mono, monospace', fontSize:'12px', color:'#8899bb'
    }).setOrigin(0.5).setDepth(10), 1000 + i * 60));

    // ── Difficulty selector ───────────────────────────────
    this._fade(this.add.text(cx,334,'DIFFICULTY',{fontFamily:'Orbitron, monospace',fontSize:'10px',color:'#7b94b5'}).setOrigin(0.5).setDepth(10),1200);
    this._diffButtons = {};
    const order = CONFIG.DIFFICULTY_ORDER, spacing = 112;
    const startX = cx - ((order.length - 1) * spacing) / 2;
    order.forEach((d, i) => {
      const btn = new Button(this, startX + i * spacing, 360, CONFIG.DIFFICULTIES[d].label, {
        width: 104, height: 28, fontSize: '11px', depth: 11, audio: this.audio,
        color: d === 'nightmare' ? '#ff5577' : CONFIG.COLOR_CYAN,
        onClick: () => this._setDifficulty(d),
      });
      this._diffButtons[d] = btn;
      this._fade(btn, 1300 + i * 70);
    });
    this._diffDesc = this.add.text(cx, 388, '', { fontFamily:'Share Tech Mono, monospace', fontSize:'11px', color:'#6f86a6' }).setOrigin(0.5).setDepth(10);
    this._fade(this._diffDesc, 1500);

    // ── Leaderboard ───────────────────────────────────────
    this._lbTitle = this.add.text(cx, 420, '', {fontFamily:'Orbitron, monospace',fontSize:'10px',color:'#7b94b5'}).setOrigin(0.5).setDepth(10);
    this._fade(this._lbTitle, 1500);
    this._lbRows = Array.from({ length: 5 }, (_, i) => {
      const t = this.add.text(cx, 440 + i * 16, '', { fontFamily:'Share Tech Mono, monospace', fontSize:'12px', color:'#8899bb' }).setOrigin(0.5).setDepth(10);
      this._fade(t, 1600 + i * 60);
      return t;
    });
    this._clearBtn = this.add.text(cx, 522, '', { fontFamily:'Share Tech Mono, monospace', fontSize:'10px', color:'#556677' })
      .setOrigin(0.5).setDepth(10).setInteractive({ useHandCursor: true });
    this._clearBtn.on('pointerover', () => this._clearBtn.setColor('#8899aa'));
    this._clearBtn.on('pointerout',  () => this._clearBtn.setColor(this._clearArmed ? '#ff5577' : '#556677'));
    this._clearBtn.on('pointerdown', () => this._onClear());
    this._fade(this._clearBtn, 1900);

    // ── Start button ──────────────────────────────────────
    this._startBtn = new Button(this, cx, 548, 'START  RUN', {
      width: 240, height: 42, fontSize: '15px', depth: 12, audio: this.audio,
      onClick: () => this._startGame(),
    });
    this._startBtn.setFocus(true);
    this._fade(this._startBtn, 1700);
    this._startHint = this.add.text(cx, 581, touch ? 'TAP START OR PRESS SPACE' : 'SPACE / ENTER TO BEGIN  ·  ← → DIFFICULTY', {
      fontFamily:'Share Tech Mono, monospace', fontSize:'10px', color:'#4f6a8a'
    }).setOrigin(0.5).setDepth(10);
    this._fade(this._startHint, 1900);

    // ── Settings row (below the arena) ────────────────────
    const sy = H - p / 2;
    this._soundBtn = new Button(this, cx - 90, sy, '', {
      width: 160, height: 26, fontSize: '10px', depth: 12, audio: this.audio, color: '#7b94b5',
      onClick: () => { this.audio.toggleMute(); this._refreshSettings(); },
    });
    this._flashBtn = new Button(this, cx + 90, sy, '', {
      width: 160, height: 26, fontSize: '10px', depth: 12, audio: this.audio, color: '#7b94b5',
      onClick: () => { Settings.toggle('reducedFlash'); this._refreshSettings(); },
    });
    this._refreshSettings();
    this._fade(this._soundBtn, 2000);
    this._fade(this._flashBtn, 2050);
    if (VERSION) this.add.text(W - p, sy, `v${VERSION}`, { fontFamily:'Share Tech Mono, monospace', fontSize:'10px', color:'#3a5070' }).setOrigin(1, 0.5).setDepth(10);

    // ── Demo player ─────────────────────────────────────
    this._demoGfx=this.add.graphics().setDepth(15);
    this._demoAngle=0; this._demoTrail=[];

    this._setDifficulty(this._difficulty, true);

    // ── Input ─────────────────────────────────────────────
    const kb = this.input.keyboard;
    kb.on('keydown-SPACE', () => this._startGame());
    kb.on('keydown-ENTER', () => this._startGame());
    kb.on('keydown-LEFT',  () => this._stepDifficulty(-1));
    kb.on('keydown-RIGHT', () => this._stepDifficulty(1));
    kb.on('keydown-A',     () => this._stepDifficulty(-1));
    kb.on('keydown-D',     () => this._stepDifficulty(1));
    kb.on('keydown-M',     () => { this.audio.toggleMute(); this._refreshSettings(); });
    this.input.on('pointerdown', () => this.audio.resume());
    kb.on('keydown', () => this.audio.resume());
  }

  _fade(obj, delay) {
    const targets = obj instanceof Button ? obj.parts : obj;
    if (obj instanceof Button) obj.setAlpha(0); else obj.setAlpha(0);
    this.tweens.add({ targets, alpha: 1, delay, duration: 400 });
    return obj;
  }

  _refreshSettings() {
    this._soundBtn.setLabel(Settings.get('muted') ? 'SOUND: OFF' : 'SOUND: ON');
    this._flashBtn.setLabel(Settings.get('reducedFlash') ? 'FLASHING: REDUCED' : 'FLASHING: FULL');
  }

  _stepDifficulty(dir) {
    const order = CONFIG.DIFFICULTY_ORDER;
    const i = order.indexOf(this._difficulty);
    const next = order[(i + dir + order.length) % order.length];
    this.audio.playUiMove();
    this._setDifficulty(next);
  }

  _setDifficulty(d, silent = false) {
    this._difficulty = d;
    if (!silent) Settings.set('difficulty', d);
    Object.entries(this._diffButtons).forEach(([k, b]) => b.setFocus(k === d));
    this._diffDesc.setText(DIFF_DESC[d]);
    this._clearArmed = false;
    this._refreshLeaderboard();
  }

  _refreshLeaderboard() {
    const entries = Leaderboard.top(this._difficulty, 5);
    this._lbTitle.setText(`TOP SCORES  ·  ${CONFIG.DIFFICULTIES[this._difficulty].label}`);
    this._lbRows.forEach((row, i) => {
      const e = entries[i];
      if (!e) {
        row.setText(i === 0 ? 'NO RUNS YET — BE THE FIRST' : '').setColor('#556677');
        return;
      }
      const col = i === 0 ? CONFIG.COLOR_GOLD : i < 3 ? CONFIG.COLOR_CYAN : '#8899bb';
      const score = e.score.toLocaleString('en-US').padStart(9, ' ');
      const time  = `${(e.time / 1000).toFixed(1)}s`.padStart(8, ' ');
      row.setText(`#${i + 1}  ${score}  ${time}`).setColor(col);
    });
    this._clearBtn.setText(entries.length ? 'CLEAR SCORES' : '').setColor('#556677');
  }

  _onClear() {
    if (!this._clearArmed) {
      this._clearArmed = true;
      this._clearBtn.setText('CLICK AGAIN TO CLEAR THIS BOARD').setColor('#ff5577');
      this.time.delayedCall(3000, () => { if (this._clearArmed) { this._clearArmed = false; this._refreshLeaderboard(); } });
      return;
    }
    this._clearArmed = false;
    Leaderboard.clear(this._difficulty);
    this.audio.playUiBack();
    this._refreshLeaderboard();
  }

  _buildTitle(cx) {
    const y = this._titleY;
    'ECHO'.split('').forEach((ch,i)=>{
      const el=this.add.text(cx-112+i*75,y-38+30,ch,{fontFamily:'Orbitron, monospace',fontSize:'72px',fontStyle:'bold',color:CONFIG.COLOR_CYAN}).setOrigin(0.5).setDepth(10).setAlpha(0);
      this.tweens.add({targets:el,alpha:1,y:y-38,delay:200+i*120,duration:400,ease:'Back.easeOut'});
    });
    'RUN'.split('').forEach((ch,i)=>{
      const el=this.add.text(cx-75+i*75,y+38+30,ch,{fontFamily:'Orbitron, monospace',fontSize:'72px',fontStyle:'bold',color:CONFIG.COLOR_PURPLE}).setOrigin(0.5).setDepth(10).setAlpha(0);
      this.tweens.add({targets:el,alpha:1,y:y+38,delay:700+i*120,duration:400,ease:'Back.easeOut'});
    });
  }

  _drawCorners(pulse) {
    const g=this._cornerGfx; g.clear();
    const p=CONFIG.ARENA_PADDING, W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cs=28;
    [[p,p],[W-p,p],[p,H-p],[W-p,H-p]].forEach(([cx,cy])=>{
      const sx=cx===p?1:-1, sy=cy===p?1:-1;
      g.lineStyle(6,0x00f5ff,0.05+pulse*0.06);
      g.beginPath();g.moveTo(cx+sx*cs,cy);g.lineTo(cx,cy);g.lineTo(cx,cy+sy*cs);g.strokePath();
      g.lineStyle(2,0x00f5ff,0.4+pulse*0.4);
      g.beginPath();g.moveTo(cx+sx*cs,cy);g.lineTo(cx,cy);g.lineTo(cx,cy+sy*cs);g.strokePath();
    });
  }

  update(time, delta) {
    const now=this.time.now, k=Math.min(delta, 50)/16;
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, ty=this._titleY;

    this._starGfx.clear();
    this._stars.forEach(s=>{
      s.x+=s.drift*k; if(s.x>W)s.x=0; if(s.x<0)s.x=W;
      const tw=0.5+0.5*Math.sin(now*s.sp+s.ph);
      this._starGfx.fillStyle(0xffffff,s.alpha*tw);
      this._starGfx.fillCircle(s.x,s.y,s.r);
    });

    this._drawCorners(0.5+0.5*Math.sin(now/1200));

    this._titleRingGfx.clear();
    const rp=0.5+0.5*Math.sin(now/900);
    this._titleRingGfx.lineStyle(30,0x00f5ff,0.025+rp*0.03);
    this._titleRingGfx.strokeEllipse(cx,ty,320,150);

    this._trailGfx.clear();
    this._trails.forEach(tr=>{
      tr.prog=(tr.prog+tr.spd*k)%1;
      const pts=tr.pts, n=pts.length-1;
      const rawT=tr.prog*n, idx=Math.floor(rawT), t=rawT-idx;
      const curr=pts[idx], next=pts[Math.min(idx+1,n)];
      const hx=curr.x+(next.x-curr.x)*t, hy=curr.y+(next.y-curr.y)*t;
      this._trailGfx.lineStyle(1.5,tr.col,0.1);
      this._trailGfx.beginPath(); this._trailGfx.moveTo(pts[0].x,pts[0].y);
      for(let i=1;i<pts.length;i++) this._trailGfx.lineTo(pts[i].x,pts[i].y);
      this._trailGfx.strokePath();
      this._trailGfx.fillStyle(tr.col,0.12); this._trailGfx.fillCircle(hx,hy,18);
      this._trailGfx.fillStyle(tr.col,0.55); this._trailGfx.fillCircle(hx,hy,8);
      this._trailGfx.fillStyle(0xffffff,0.25); this._trailGfx.fillCircle(hx-2,hy-2,2.5);
    });

    // Demo player orbiting the title
    this._demoAngle+=0.018*k;
    const dx=cx+Math.cos(this._demoAngle)*190, dy=ty+Math.sin(this._demoAngle)*82;
    this._demoTrail.push({x:dx,y:dy}); if(this._demoTrail.length>20) this._demoTrail.shift();
    this._demoGfx.clear();
    this._demoTrail.forEach((pt,i)=>{
      const prog=i/this._demoTrail.length;
      this._demoGfx.fillStyle(CONFIG.PLAYER_COLOR,prog*0.35);
      this._demoGfx.fillCircle(pt.x,pt.y,7*prog);
    });
    this._demoGfx.fillStyle(CONFIG.PLAYER_COLOR,0.1); this._demoGfx.fillCircle(dx,dy,24);
    this._demoGfx.fillStyle(CONFIG.PLAYER_COLOR,1);   this._demoGfx.fillCircle(dx,dy,7);
    this._demoGfx.fillStyle(0xffffff,0.75);           this._demoGfx.fillCircle(dx-2,dy-2,2.5);
  }

  _startGame() {
    if (this._starting) return;
    this._starting = true;
    this.audio.resume();
    this.audio.playUiSelect();
    this.cameras.main.fadeOut(350,0,0,0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameScene', { difficulty: this._difficulty });
    });
  }
}
