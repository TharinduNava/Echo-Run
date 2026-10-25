import { CONFIG, POWERUP_INFO } from '../config/GameConfig.js';

const fmtScore = (n) => Math.floor(n).toLocaleString('en-US');

/**
 * Text#setColor re-rasterises and re-uploads the text texture every call, even for the same
 * colour. The HUD sets colours every frame, so only forward actual changes.
 */
function memoColor(text) {
  const setColor = text.setColor.bind(text);
  let last = text.style.color;
  text.setColor = (c) => { if (c !== last) { last = c; setColor(c); } return text; };
  return text;
}

export class UIManager {
  constructor(scene, { touch = false } = {}) {
    this.scene = scene;
    this._touch = touch;
    const mono = { fontFamily: 'Orbitron, monospace', fontSize: '13px', color: CONFIG.COLOR_CYAN };
    const tech = { fontFamily: 'Share Tech Mono, monospace' };
    const p    = CONFIG.ARENA_PADDING;
    const W    = CONFIG.CANVAS_WIDTH, H = CONFIG.CANVAS_HEIGHT;
    const cx   = W / 2;

    // ── Top-left panel: time / score / echoes ─────────
    this._panelTL = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelTL, p + 4, p + 4, 178, 74);
    this.timeText  = scene.add.text(p + 14, p + 11, 'TIME 0.00s', mono).setDepth(50);
    this.scoreText = scene.add.text(p + 14, p + 31, 'SCORE 0', { ...mono, color: CONFIG.COLOR_GOLD }).setDepth(50);
    this.ghostText = scene.add.text(p + 14, p + 53, 'ECHOES 0', { ...mono, fontSize: '10px', color: CONFIG.COLOR_PURPLE }).setDepth(50);
    this.multText  = scene.add.text(p + 172, p + 53, '×1.0', { ...mono, fontSize: '10px', color: CONFIG.COLOR_GOLD }).setOrigin(1, 0).setDepth(50);

    // Active buffs (below top-left panel)
    this.buffText = scene.add.text(p + 8, p + 84, '', {
      ...tech, fontSize: '10px', color: '#8899bb', wordWrap: { width: 260 },
    }).setDepth(50);

    // ── Top-center: echo countdown + overdrive ────────
    this._panelTC = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelTC, cx - 110, p + 4, 220, 52);
    this.echoCountdownText = scene.add.text(cx, p + 18, '', { ...mono, fontSize: '12px', color: '#ff8c00', align: 'center' }).setOrigin(0.5).setDepth(50);
    this.overdriveText = scene.add.text(cx, p + 38, '', { ...mono, fontSize: '10px', color: '#ff3355', align: 'center' }).setOrigin(0.5).setDepth(51);

    // ── Top-right: nerve multiplier ───────────────────
    this._panelTR = scene.add.graphics().setDepth(48);
    const trX = W - p - 4;
    this._drawPanel(this._panelTR, trX - 140, p + 4, 140, 52);
    this.nerveText = scene.add.text(trX - 70, p + 18, 'NERVE ×1.0', { ...mono, fontSize: '11px', color: '#ff3355', align: 'center' }).setOrigin(0.5).setDepth(50);
    this.nerveBar = scene.add.graphics().setDepth(50);
    this.nerveSubLabel = scene.add.text(trX - 70, p + 40, 'GET CLOSE TO ECHOES', {
      ...tech, fontSize: '9px', color: '#556677', align: 'center'
    }).setOrigin(0.5).setDepth(50);

    // ── Bottom-left: held powerup ─────────────────────
    const bpX = p + 4, bpY = H - p - 58;
    this._panelBP = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelBP, bpX, bpY, 150, 54);
    this.powerupRect = { x: bpX, y: bpY, w: 150, h: 54 };
    this.powerupLabel = scene.add.text(bpX + 10, bpY + 7, 'POWERUP', { ...mono, fontSize: '9px', color: '#556677' }).setDepth(50);
    this.powerupText  = scene.add.text(bpX + 10, bpY + 21, 'NONE', { ...mono, fontSize: '11px', color: '#556677' }).setDepth(50);
    this.powerupBar   = scene.add.graphics().setDepth(50);
    this.powerupKeyHint = scene.add.text(bpX + 10, bpY + 38, '', { ...tech, fontSize: '10px', color: '#557788' }).setDepth(50);

    // ── Bottom-right: warp ring ───────────────────────
    const wx = W - p - 8, wy = H - p - 8;
    this._panelBR = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelBR, wx - 128, wy - 50, 132, 54);
    this.warpRect = { x: wx - 128, y: wy - 50, w: 132, h: 54 };
    this.warpLabel      = scene.add.text(wx - 64, wy - 36, 'SHIFT', { ...mono, fontSize: '10px', color: '#556677' }).setOrigin(0.5).setDepth(52);
    this.warpStatusText = scene.add.text(wx - 64, wy - 20, 'WARP', { ...mono, fontSize: '11px', color: CONFIG.COLOR_CYAN }).setOrigin(0.5).setDepth(52);
    this._warpRingGfx = scene.add.graphics().setDepth(52);
    this._warpRX = wx - 22; this._warpRY = wy - 23; this._warpRad = 18;
    this._drawWarpRing(1, 'ready');

    this._lastBuffs = '';
    [this.timeText, this.echoCountdownText, this.nerveText, this.powerupText, this.powerupKeyHint,
     this.warpStatusText, this.warpLabel].forEach(memoColor);
  }

  _drawPanel(g, x, y, w, h) {
    g.clear();
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0x1e3a5f, 0.85);
    g.strokeRoundedRect(x, y, w, h, 6);
  }

  _drawWarpRing(progress, state) {
    const g = this._warpRingGfx;
    const rx = this._warpRX, ry = this._warpRY, rad = this._warpRad;
    g.clear();
    g.lineStyle(3, 0x1a2a3a, 0.9);
    g.strokeCircle(rx, ry, rad);

    if (state === 'active') {
      const t = (this.scene.time.now / 300) % (Math.PI * 2);
      g.lineStyle(3, 0x00ffcc, 0.9);
      g.beginPath(); g.arc(rx, ry, rad, t, t + Math.PI * 1.5); g.strokePath();
      g.lineStyle(5, 0x00ffcc, 0.2);
      g.strokeCircle(rx, ry, rad + 2);
    } else if (state === 'ready') {
      const pulse = 0.6 + 0.4 * Math.sin(this.scene.time.now / 250);
      g.lineStyle(3, 0x00f5ff, 0.9);
      g.strokeCircle(rx, ry, rad);
      g.fillStyle(0x00f5ff, 0.5 + pulse * 0.4); g.fillCircle(rx, ry, 4);
    } else if (progress > 0.01) {
      const a = -Math.PI / 2;
      g.lineStyle(3, 0x00b4d8, 0.75);
      g.beginPath(); g.arc(rx, ry, rad, a, a + Math.PI * 2 * progress); g.strokePath();
      g.fillStyle(0x445566, 0.4); g.fillCircle(rx, ry, 4);
    }
  }

  /** Freeze the HUD into its final state when the run ends. */
  showDead() {
    this.echoCountdownText.setText('SIGNAL LOST').setColor('#ff3355').setAlpha(0.8);
    this.overdriveText.setText('');
  }

  /**
   * @param {object} s
   *   survivalMs, score, mult, ghostCount, nextSpawnMs, nextGhostNumber, overdrive,
   *   warpState ('ready'|'active'|'cooldown'), warpProgress, nerve,
   *   held, activeType, activeProgress, buffs (array of labels)
   */
  update(s) {
    const now = this.scene.time.now;

    // ── Time / score ─────────────────────────────────────
    let timeColor = CONFIG.COLOR_CYAN;
    if (s.survivalMs > 60000)      timeColor = '#ff8c00';
    else if (s.survivalMs > 30000) timeColor = '#00e5cc';
    this.timeText.setText(`TIME ${(s.survivalMs / 1000).toFixed(2)}s`).setColor(timeColor);
    this.scoreText.setText(`SCORE ${fmtScore(s.score)}`);
    this.ghostText.setText(`ECHOES ${s.ghostCount}`);
    this.multText.setText(`×${s.mult.toFixed(1)}`).setAlpha(s.mult > 1.05 ? 1 : 0.4);

    const buffStr = s.buffs.length ? `BUFFS: ${s.buffs.join(' · ')}` : '';
    if (buffStr !== this._lastBuffs) { this.buffText.setText(buffStr); this._lastBuffs = buffStr; }

    // ── Echo countdown ────────────────────────────────────
    const atCap = s.nextSpawnMs < 0;
    if (atCap) {
      this.echoCountdownText.setText('MAX ECHOES').setColor('#ff3355').setAlpha(0.9);
    } else {
      const col = s.nextSpawnMs < 3000
        ? (Math.floor(now / 250) % 2 === 0 ? '#ff3355' : '#ff8c00')
        : '#ff8c00';
      this.echoCountdownText.setText(`ECHO #${s.nextGhostNumber} IN ${(s.nextSpawnMs / 1000).toFixed(1)}s`).setColor(col).setAlpha(1);
    }

    if (s.overdrive) {
      this.overdriveText.setText('OVERDRIVE').setAlpha(0.6 + 0.4 * Math.sin(now / 140));
    } else {
      this.overdriveText.setText('');
    }

    // ── Nerve multiplier ──────────────────────────────────
    const p   = CONFIG.ARENA_PADDING;
    const trX = CONFIG.CANVAS_WIDTH - p - 4;
    const nerveProgress = (s.nerve - 1) / (CONFIG.NERVE_MAX_MULT - 1);
    const building = s.nerve > 1.05;
    this.nerveText.setText(`NERVE ×${s.nerve.toFixed(1)}`).setAlpha(building ? 1 : 0.45);
    this.nerveText.setColor(s.nerve > 2.5 ? '#ff3355' : '#ff8c00');
    this.nerveSubLabel.setVisible(!building);

    this.nerveBar.clear();
    if (building) {
      const barW = 100, barX = trX - 120, barY = p + 36;
      this.nerveBar.fillStyle(0x111111, 0.8);
      this.nerveBar.fillRect(barX, barY, barW, 6);
      this.nerveBar.fillStyle(s.nerve > 2.5 ? 0xff3355 : 0xff8c00, 0.9);
      this.nerveBar.fillRect(barX, barY, barW * nerveProgress, 6);
    }

    // ── Powerup HUD ───────────────────────────────────────
    const { x: bpX, y: bpY } = this.powerupRect;
    this.powerupBar.clear();
    if (s.activeType) {
      const info = POWERUP_INFO[s.activeType];
      this.powerupText.setText(`${info.label} ACTIVE`).setColor(info.color).setAlpha(1);
      this.powerupKeyHint.setText(s.held ? `NEXT: ${POWERUP_INFO[s.held].label}` : '');
      this.powerupBar.fillStyle(0x111111, 0.8);
      this.powerupBar.fillRect(bpX + 10, bpY + 36, 130, 4);
      this.powerupBar.fillStyle(info.hex, 0.9);
      this.powerupBar.fillRect(bpX + 10, bpY + 36, 130 * s.activeProgress, 4);
      if (s.held) this.powerupKeyHint.setY(bpY + 41); else this.powerupKeyHint.setY(bpY + 38);
    } else if (s.held) {
      const info = POWERUP_INFO[s.held];
      this.powerupText.setText(`${info.icon} ${info.label}`).setColor(info.color).setAlpha(0.85 + 0.15 * Math.sin(now / 200));
      this.powerupKeyHint.setText(this._touch ? 'E / TAP HERE TO USE' : 'PRESS E TO USE').setColor('#88aacc').setY(bpY + 38);
    } else {
      this.powerupText.setText('NONE').setColor('#556677').setAlpha(1);
      this.powerupKeyHint.setText('');
    }

    // ── Warp ring ──────────────────────────────────────────
    this._drawWarpRing(s.warpProgress, s.warpState);
    if (s.warpState === 'active') {
      this.warpStatusText.setText('ACTIVE').setColor('#00ffcc');
      this.warpLabel.setColor('#00ffcc');
    } else if (s.warpState === 'ready') {
      this.warpStatusText.setText('WARP').setColor(CONFIG.COLOR_CYAN);
      this.warpLabel.setColor('#7b94b5');
    } else {
      this.warpStatusText.setText(`${Math.floor(s.warpProgress * 100)}%`).setColor('#4a80b0');
      this.warpLabel.setColor('#3a6090');
    }
  }
}
