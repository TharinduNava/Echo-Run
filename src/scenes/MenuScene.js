import { CONFIG } from '../config/GameConfig.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT;
    const cx=W/2, cy=H/2;

    this._difficulty = localStorage.getItem('echorun_difficulty') || 'normal';

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
    const p=CONFIG.ARENA_PADDING;
    const arena=this.add.graphics().setDepth(3);
    arena.lineStyle(2,0x2a5080,1); arena.strokeRect(p,p,W-p*2,H-p*2);

    // ── Corner pulse ─────────────────────────────────────
    this._cornerGfx=this.add.graphics().setDepth(4); this._cornerPulse=0;
    this._drawCorners(0);

    // ── Animated ghost trails ────────────────────────────
    this._trailGfx=this.add.graphics().setDepth(5);
    this._trails=[
      {pts:[{x:150,y:170},{x:310,y:130},{x:460,y:230},{x:380,y:410},{x:200,y:380},{x:150,y:250}],prog:0,spd:0.004,col:CONFIG.GHOST_COLOR},
      {pts:[{x:610,y:160},{x:760,y:260},{x:720,y:430},{x:560,y:490},{x:470,y:360}],prog:0.5,spd:0.003,col:0x7c3aed},
      {pts:[{x:200,y:480},{x:340,y:520},{x:500,y:480},{x:640,y:520},{x:740,y:460}],prog:0.3,spd:0.0025,col:0x5b21b6},
    ];

    this._titleRingGfx=this.add.graphics().setDepth(8);
    this._buildTitle(cx,cy);

    // Tagline
    this._fade(this.add.text(cx,cy+26,'"Your past is your greatest enemy."',{fontFamily:'Share Tech Mono, monospace',fontSize:'13px',color:'#4a6080',align:'center'}).setOrigin(0.5).setDepth(10).setAlpha(0),900);

    // Controls
    this._fade(this.add.text(cx,cy+56,'WASD/ARROWS — MOVE   SHIFT — WARP   E — POWERUP   ESC — PAUSE',{
      fontFamily:'Share Tech Mono, monospace',fontSize:'10px',color:'#334455',align:'center'
    }).setOrigin(0.5).setDepth(10).setAlpha(0),1100);

    // ── Difficulty selector ───────────────────────────────
    this._diffGfx=this.add.graphics().setDepth(10);
    this._diffTexts={};
    const diffY=cy+100;
    this.add.text(cx,diffY,'DIFFICULTY',{fontFamily:'Orbitron, monospace',fontSize:'10px',color:'#334455'}).setOrigin(0.5).setDepth(10).setAlpha(0);
    this._fade(this.add.text(cx,diffY,'DIFFICULTY',{fontFamily:'Orbitron, monospace',fontSize:'10px',color:'#334455'}).setOrigin(0.5).setDepth(10).setAlpha(0),1200);

    const diffs=['easy','normal','hard','nightmare'];
    const diffW=90, startX=cx-((diffs.length-1)*diffW)/2;
    diffs.forEach((d,i)=>{
      const bx=startX+i*diffW, by=diffY+18;
      const lbl=CONFIG.DIFFICULTIES[d].label;
      const btn=this.add.text(bx,by,lbl,{
        fontFamily:'Orbitron, monospace',fontSize:'11px',
        color:d===this._difficulty?CONFIG.COLOR_CYAN:'#334455',align:'center'
      }).setOrigin(0.5).setDepth(11).setAlpha(0).setInteractive({useHandCursor:true});
      btn.on('pointerover',()=>{ if(d!==this._difficulty) btn.setColor('#556688'); });
      btn.on('pointerout', ()=>{ btn.setColor(d===this._difficulty?CONFIG.COLOR_CYAN:'#334455'); });
      btn.on('pointerdown',()=>{ this._setDifficulty(d); });
      this._diffTexts[d]=btn;
      this._fade(btn,1300+i*80);
    });

    // ── Leaderboard ───────────────────────────────────────
    const lb=JSON.parse(localStorage.getItem('echorun_lb')||'[]');
    if(lb.length>0){
      const lbY=cy+158;
      this._fade(this.add.text(cx,lbY,'TOP SCORES',{fontFamily:'Orbitron, monospace',fontSize:'10px',color:'#334455'}).setOrigin(0.5).setDepth(10).setAlpha(0),1500);
      lb.slice(0,5).forEach((score,i)=>{
        const col=i===0?CONFIG.COLOR_GOLD:i<3?CONFIG.COLOR_CYAN:'#445566';
        this._fade(this.add.text(cx,lbY+16+i*16,`#${i+1}  ${(score/1000).toFixed(2)}s`,{
          fontFamily:'Share Tech Mono, monospace',fontSize:'12px',color:col,align:'center'
        }).setOrigin(0.5).setDepth(10).setAlpha(0),1600+i*100);
      });
    }

    // ── Start prompt ──────────────────────────────────────
    const prompt=this.add.text(cx,H-p-30,'PRESS  SPACE  OR  CLICK  TO  BEGIN',{
      fontFamily:'Share Tech Mono, monospace',fontSize:'14px',color:CONFIG.COLOR_CYAN,align:'center'
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.time.delayedCall(1800,()=>{
      this.tweens.add({targets:prompt,alpha:1,duration:300,onComplete:()=>{
        this.tweens.add({targets:prompt,alpha:0.1,duration:800,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
      }});
    });

    // ── Demo player ─────────────────────────────────────
    this._demoGfx=this.add.graphics().setDepth(15);
    this._demoAngle=0; this._demoTrail=[];

    // Input
    this.input.keyboard.once('keydown-SPACE',()=>this._startGame());
    this.input.once('pointerdown',()=>this._startGame());
    this.time.addEvent({delay:16,loop:true,callback:this._tick,callbackScope:this});
  }

  _fade(obj,delay) {
    this.time.delayedCall(delay,()=>this.tweens.add({targets:obj,alpha:1,duration:400}));
    return obj;
  }

  _setDifficulty(d) {
    this._difficulty=d;
    localStorage.setItem('echorun_difficulty',d);
    Object.entries(this._diffTexts).forEach(([k,t])=>{
      t.setColor(k===d?CONFIG.COLOR_CYAN:'#334455');
    });
  }

  _buildTitle(cx,cy) {
    'ECHO'.split('').forEach((ch,i)=>{
      const el=this.add.text(cx-112+i*75,cy-115,ch,{fontFamily:'Orbitron, monospace',fontSize:'72px',fontStyle:'bold',color:CONFIG.COLOR_CYAN}).setOrigin(0.5).setDepth(10).setAlpha(0).setY(cy-85);
      this.time.delayedCall(200+i*120,()=>this.tweens.add({targets:el,alpha:1,y:cy-115,duration:400,ease:'Back.easeOut'}));
    });
    'RUN'.split('').forEach((ch,i)=>{
      const el=this.add.text(cx-75+i*75,cy-40,ch,{fontFamily:'Orbitron, monospace',fontSize:'72px',fontStyle:'bold',color:CONFIG.COLOR_PURPLE}).setOrigin(0.5).setDepth(10).setAlpha(0).setY(cy-10);
      this.time.delayedCall(700+i*120,()=>this.tweens.add({targets:el,alpha:1,y:cy-40,duration:400,ease:'Back.easeOut'}));
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

  _tick() {
    const now=this.time.now;
    const W=CONFIG.CANVAS_WIDTH, H=CONFIG.CANVAS_HEIGHT, cx=W/2, cy=H/2;

    // Stars
    this._starGfx.clear();
    this._stars.forEach(s=>{
      s.x+=s.drift; if(s.x>W)s.x=0; if(s.x<0)s.x=W;
      const tw=0.5+0.5*Math.sin(now*s.sp+s.ph);
      this._starGfx.fillStyle(0xffffff,s.alpha*tw);
      this._starGfx.fillCircle(s.x,s.y,s.r);
    });

    // Corners
    this._cornerPulse=0.5+0.5*Math.sin(now/1200);
    this._drawCorners(this._cornerPulse);

    // Title glow ring
    this._titleRingGfx.clear();
    const rp=0.5+0.5*Math.sin(now/900);
    this._titleRingGfx.lineStyle(30,0x00f5ff,0.025+rp*0.03);
    this._titleRingGfx.strokeEllipse(cx,cy-78,300,100);

    // Ghost trails
    this._trailGfx.clear();
    this._trails.forEach(tr=>{
      tr.prog=(tr.prog+tr.spd)%1;
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

    // Demo player orbit
    this._demoAngle+=0.018;
    const dx=cx+Math.cos(this._demoAngle)*65, dy=cy-78+Math.sin(this._demoAngle)*65*0.45;
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
    this.cameras.main.fadeOut(350,0,0,0);
    this.cameras.main.once('camerafadeoutcomplete',()=>{
      this.scene.start('GameScene',{difficulty:this._difficulty});
    });
  }
}
