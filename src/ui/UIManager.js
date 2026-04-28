import { CONFIG } from '../config/GameConfig.js';

export class UIManager {
  constructor(scene) {
    this.scene = scene;
    const mono = { fontFamily: 'Orbitron, monospace', fontSize: '13px', color: CONFIG.COLOR_CYAN };
    const p    = CONFIG.ARENA_PADDING;
    const cx   = CONFIG.CANVAS_WIDTH / 2;

    // ── Top-left panel: time + echoes ─────────────────
    this._panelTL = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelTL, p + 4, p + 4, 150, 70);
    this.timeText  = scene.add.text(p + 14, p + 12, 'TIME: 0.00', mono).setDepth(50);
    this.ghostText = scene.add.text(p + 14, p + 32, 'ECHOES: 0', { ...mono, color: CONFIG.COLOR_PURPLE }).setDepth(50);
    this.scoreText = scene.add.text(p + 14, p + 50, 'SCORE \xd71.0', { ...mono, fontSize: '10px', color: CONFIG.COLOR_GOLD }).setDepth(50);

    // ── Top-center: echo countdown + overdrive ────────
    this._panelTC = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelTC, cx - 110, p + 4, 220, 52);
    this.echoCountdownText = scene.add.text(
      CONFIG.CANVAS_WIDTH / 2, p + 14, '',
      { ...mono, fontSize: '12px', color: '#ff8c00', align: 'center' }
    ).setOrigin(0.5).setDepth(50);
    this.overdriveText = scene.add.text(
      CONFIG.CANVAS_WIDTH / 2, p + 32, '',
      { ...mono, fontSize: '10px', color: '#ff3355', align: 'center' }
    ).setOrigin(0.5).setDepth(51);

    // ── Top-right: nerve multiplier ───────────────────
    this._panelTR = scene.add.graphics().setDepth(48);
    const trX = CONFIG.CANVAS_WIDTH - p - 4;
    this._drawPanel(this._panelTR, trX - 136, p + 4, 140, 52);
    this.nerveText = scene.add.text(trX - 70, p + 12, 'NERVE ×1.0', {
      ...mono, fontSize: '11px', color: '#ff3355', align: 'center'
    }).setOrigin(0.5).setDepth(50);
    this.nerveBar = scene.add.graphics().setDepth(50);
    this.nerveSubLabel = scene.add.text(trX - 70, p + 44, 'PROXIMITY BONUS', {
      fontFamily: 'Share Tech Mono, monospace', fontSize: '7px', color: '#334455', align: 'center'
    }).setOrigin(0.5).setDepth(50);

    // ── Bottom-left: held powerup ─────────────────────
    const bpX = p + 4;
    const bpY = CONFIG.CANVAS_HEIGHT - p - 58;
    this._panelBP = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelBP, bpX, bpY, 140, 52);
    this.powerupLabel = scene.add.text(bpX + 10, bpY + 8, 'POWERUP', {
      ...mono, fontSize: '9px', color: '#334455'
    }).setDepth(50);
    this.powerupText = scene.add.text(bpX + 10, bpY + 22, 'NONE', {
      ...mono, fontSize: '11px', color: '#334455'
    }).setDepth(50);
    this.powerupBar = scene.add.graphics().setDepth(50);
    this.powerupKeyHint = scene.add.text(bpX + 10, bpY + 38, 'Press E to activate', {
      ...mono, fontSize: '8px', color: '#223344'
    }).setDepth(50);

    // ── Bottom-right: warp ring ───────────────────────
    const wx = CONFIG.CANVAS_WIDTH - p - 8;
    const wy = CONFIG.CANVAS_HEIGHT - p - 8;
    this._panelBR = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelBR, wx - 124, wy - 48, 132, 54);
    this.warpLabel      = scene.add.text(wx - 58, wy - 36, 'SHIFT', { ...mono, fontSize: '10px', color: '#445566' }).setOrigin(0.5).setDepth(52);
    this.warpStatusText = scene.add.text(wx - 58, wy - 20, 'WARP',  { ...mono, fontSize: '11px', color: CONFIG.COLOR_CYAN }).setOrigin(0.5).setDepth(52);
    this._warpRingGfx = scene.add.graphics().setDepth(52);
    this._warpRX = wx - 20; this._warpRY = wy - 22; this._warpRad = 20;
    this._drawWarpRing(1, true, false);
  }

  _drawPanel(g, x, y, w, h) {
    g.clear();
    g.fillStyle(0x000000, 0.52);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0x1e3a5f, 0.85);
    g.strokeRoundedRect(x, y, w, h, 6);
  }

  _drawWarpRing(progress, available, active) {
    const g = this._warpRingGfx;
    const rx = this._warpRX, ry = this._warpRY, rad = this._warpRad;
    g.clear();
    g.lineStyle(3, 0x1a2a3a, 0.9);
    g.beginPath(); g.arc(rx, ry, rad, 0, Math.PI * 2); g.strokePath();

    if (active) {
      const t = (this.scene.time.now / 300) % (Math.PI * 2);  // normalized 0→2π
      g.lineStyle(3, 0x00ffcc, 0.9);
      g.beginPath(); g.arc(rx, ry, rad, t, t + Math.PI * 1.5); g.strokePath();
      g.lineStyle(5, 0x00ffcc, 0.2);
      g.beginPath(); g.arc(rx, ry, rad + 2, 0, Math.PI * 2); g.strokePath();
    } else if (available) {
      g.lineStyle(3, CONFIG.COLOR_CYAN, 0.9);
      g.beginPath(); g.arc(rx, ry, rad, 0, Math.PI * 2); g.strokePath();
      g.fillStyle(CONFIG.COLOR_CYAN, 0.7); g.fillCircle(rx, ry, 4);
    } else if (progress > 0.02) {
      const a = -Math.PI / 2;
      g.lineStyle(3, 0x00b4d8, 0.7);
      g.beginPath(); g.arc(rx, ry, rad, a, a + Math.PI * 2 * progress); g.strokePath();
      g.fillStyle(0x445566, 0.4); g.fillCircle(rx, ry, 4);
    }
  }

  update(survivalMs, ghostCount, timeUntilNextSpawnMs, nextGhostNumber, isOverdrive,
         timeWarpAvailable, timeWarpActive, warpCooldownProgress,
         nerveMultiplier = 1.0, heldPowerup = null, powerupActive = false, powerupProgress = 0,
         scoreMult = 1.0) {

    const now = this.scene.time.now;

    // ── Score multiplier ─────────────────────────────────
    this.scoreText.setText(`SCORE \xd7${scoreMult.toFixed(1)}`);
    this.scoreText.setAlpha(scoreMult > 1.05 ? 1 : 0.35);

    // ── Time ─────────────────────────────────────────────
    const sec = (survivalMs / 1000).toFixed(2);
    let timeColor = CONFIG.COLOR_CYAN;
    if (survivalMs > 60000)      timeColor = '#ff8c00';
    else if (survivalMs > 30000) timeColor = '#00e5cc';
    this.timeText.setText(`TIME: ${sec}`).setColor(timeColor);
    this.ghostText.setText(`ECHOES: ${ghostCount}`);

    // ── Echo countdown ────────────────────────────────────
    const atCap = (timeUntilNextSpawnMs < 0);
    if (atCap) {
      this.echoCountdownText.setText('— MAX ECHOES —').setColor('#ff3355').setAlpha(0.9);
    } else {
      const col = timeUntilNextSpawnMs < 3000
        ? (Math.floor(now / 250) % 2 === 0 ? '#ff3355' : '#ff8c00')
        : '#ff8c00';
      this.echoCountdownText.setText(`ECHO #${nextGhostNumber} IN ${(timeUntilNextSpawnMs / 1000).toFixed(1)}s`).setColor(col).setAlpha(1);
    }

    // ── Overdrive ──────────────────────────────────────────
    if (isOverdrive && !atCap) {
      this.overdriveText.setText('⚡ OVERDRIVE ⚡').setAlpha(0.6 + 0.4 * Math.sin(now / 140));
    } else {
      this.overdriveText.setText('');
    }

    // ── Nerve multiplier ──────────────────────────────────
    const p   = CONFIG.ARENA_PADDING;
    const trX = CONFIG.CANVAS_WIDTH - p - 4;
    const nerveStr = `NERVE ×${nerveMultiplier.toFixed(1)}`;
    this.nerveText.setText(nerveStr);
    const nerveProgress = (nerveMultiplier - 1) / (CONFIG.NERVE_MAX_MULT - 1);
    const nerveAlpha = nerveMultiplier > 1.05 ? 1 : 0.35;
    this.nerveText.setAlpha(nerveAlpha);
    if (nerveMultiplier > 1.05) {
      this.nerveText.setColor(nerveMultiplier > 2.5 ? '#ff3355' : '#ff8c00');
    }

    this.nerveSubLabel.setAlpha(nerveMultiplier <= 1.05 ? 0.7 : 0);

    this.nerveBar.clear();
    if (nerveProgress > 0.01) {
      const barW = 100;
      const barX = trX - 136 + 20;
      const barY = p + 40;
      this.nerveBar.fillStyle(0x111111, 0.8);
      this.nerveBar.fillRect(barX, barY, barW, 6);
      const col = nerveMultiplier > 2.5 ? 0xff3355 : 0xff8c00;
      this.nerveBar.fillStyle(col, 0.9);
      this.nerveBar.fillRect(barX, barY, barW * nerveProgress, 6);
    }

    // ── Powerup HUD (bottom-left) ─────────────────────────
    if (heldPowerup && !powerupActive) {
      const colorMap = { clash: CONFIG.COLOR_CLASH, phase: CONFIG.COLOR_PHASE, decoy: CONFIG.COLOR_DECOY };
      const iconMap  = { clash: '[C] CLASH', phase: '[P] PHASE', decoy: '[D] DECOY' };
      const bpCol = colorMap[heldPowerup] || CONFIG.COLOR_CYAN;
      const icon  = iconMap[heldPowerup]  || heldPowerup.toUpperCase();
      this.powerupText.setText(icon).setColor(bpCol).setAlpha(0.9 + 0.1 * Math.sin(now / 200));
      this.powerupKeyHint.setText('Press E to activate').setColor('#557788');
      this.powerupBar.clear();
    } else if (powerupActive) {
      const colorMap2 = { clash: CONFIG.COLOR_CLASH, phase: CONFIG.COLOR_PHASE, decoy: CONFIG.COLOR_DECOY };
      const labelMap2 = { clash: 'CLASH ACTIVE', phase: 'PHASE ACTIVE', decoy: 'DECOY ACTIVE' };
      const bpCol = colorMap2[powerupActive] || CONFIG.COLOR_CYAN;
      const icon  = labelMap2[powerupActive] || `${powerupActive.toUpperCase()} ACTIVE`;
      this.powerupText.setText(icon).setColor(bpCol).setAlpha(1);
      this.powerupKeyHint.setText('');
      // Active bar
      const bpX = p + 4, bpY = CONFIG.CANVAS_HEIGHT - p - 58;
      this.powerupBar.clear();
      this.powerupBar.fillStyle(0x111111, 0.8);
      this.powerupBar.fillRect(bpX + 10, bpY + 40, 120, 5);
      const barColorMap = { clash: 0xff6600, phase: 0x00ccff, decoy: 0x00ff88 };
      this.powerupBar.fillStyle(barColorMap[powerupActive] || 0x00ccff, 0.9);
      this.powerupBar.fillRect(bpX + 10, bpY + 40, 120 * powerupProgress, 5);
    } else {
      this.powerupText.setText('NONE').setColor('#334455').setAlpha(1);
      this.powerupKeyHint.setText('').setColor('#223344');
      this.powerupBar.clear();
    }

    // ── Warp ring ──────────────────────────────────────────
    this._drawWarpRing(warpCooldownProgress, timeWarpAvailable, timeWarpActive);
    if (timeWarpActive) {
      this.warpStatusText.setText('ACTIVE').setColor('#00ffcc');
      this.warpLabel.setColor('#00ffcc');
    } else if (timeWarpAvailable) {
      this.warpStatusText.setText('WARP').setColor(CONFIG.COLOR_CYAN);
      this.warpLabel.setColor('#445566');
    } else {
      this.warpStatusText.setText(`${Math.round(warpCooldownProgress * 100)}%`).setColor('#2a5080');
      this.warpLabel.setColor('#2a5080');
    }
  }

  destroy() {
    [this.timeText, this.ghostText, this.scoreText, this.echoCountdownText, this.overdriveText,
     this.nerveText, this.nerveBar, this.nerveSubLabel, this.powerupLabel, this.powerupText,
     this.powerupBar, this.powerupKeyHint, this.warpStatusText, this.warpLabel,
     this._warpRingGfx, this._panelTL, this._panelTC, this._panelTR,
     this._panelBP, this._panelBR].forEach(o => o?.destroy());
  }
}
