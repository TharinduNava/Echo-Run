import { CONFIG } from '../config/GameConfig.js';

export class UIManager {
  constructor(scene) {
    this.scene = scene;
    this._warpRingGraphics = null;
    this._overdriveFlash   = false;

    const mono = { fontFamily: 'Orbitron, monospace', fontSize: '13px', color: CONFIG.COLOR_CYAN, align: 'left' };
    const p    = CONFIG.ARENA_PADDING;

    // ── Top-left panel ──────────────────────────────────
    this._panelTL = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelTL, p + 4, p + 4, 148, 52);

    this.timeText = scene.add.text(p + 14, p + 12, 'TIME: 0.00', mono).setDepth(50);
    this.ghostText = scene.add.text(p + 14, p + 32, 'ECHOES: 0', { ...mono, color: CONFIG.COLOR_PURPLE }).setDepth(50);

    // ── Top-center: NEXT ECHO countdown (shown all the time once relevant) ──
    this._panelTC = scene.add.graphics().setDepth(48);
    this.echoCountdownText = scene.add.text(
      CONFIG.CANVAS_WIDTH / 2, p + 14, '',
      { ...mono, fontSize: '12px', color: '#ff8c00', align: 'center' }
    ).setOrigin(0.5).setDepth(50);

    // ── Top-center: OVERDRIVE label ──
    this.overdriveText = scene.add.text(
      CONFIG.CANVAS_WIDTH / 2, p + 34, '',
      { ...mono, fontSize: '11px', color: '#ff3355', align: 'center' }
    ).setOrigin(0.5).setDepth(51);

    // ── Bottom-right: Warp ────────────────────────────
    const wx = CONFIG.CANVAS_WIDTH - p - 8;
    const wy = CONFIG.CANVAS_HEIGHT - p - 8;
    this._panelBR = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelBR, wx - 120, wy - 44, 128, 50);

    this.warpLabel = scene.add.text(wx - 58, wy - 36, 'SHIFT', { ...mono, fontSize: '10px', color: '#445566' }).setOrigin(0.5).setDepth(52);
    this.warpStatusText = scene.add.text(wx - 58, wy - 20, 'WARP', { ...mono, fontSize: '11px', color: CONFIG.COLOR_CYAN }).setOrigin(0.5).setDepth(52);
    this._warpRingGraphics = scene.add.graphics().setDepth(52);
    this._warpRingX = wx - 18;
    this._warpRingY = wy - 22;
    this._warpRingRadius = 16;
    this._drawWarpRing(1, true, false);
  }

  _drawPanel(g, x, y, w, h) {
    g.clear();
    g.fillStyle(0x000000, 0.52);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0x1e3a5f, 0.85);
    g.strokeRoundedRect(x, y, w, h, 6);
  }

  _drawTCPanel(textWidth) {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const p  = CONFIG.ARENA_PADDING;
    const pw = Math.max(160, textWidth + 24);
    this._panelTC.clear();
    this._panelTC.fillStyle(0x000000, 0.5);
    this._panelTC.fillRoundedRect(cx - pw / 2, p + 4, pw, 52, 6);
    this._panelTC.lineStyle(1, 0x1e3a5f, 0.8);
    this._panelTC.strokeRoundedRect(cx - pw / 2, p + 4, pw, 52, 6);
  }

  _drawWarpRing(progress, available, active) {
    const g   = this._warpRingGraphics;
    const rx  = this._warpRingX;
    const ry  = this._warpRingY;
    const rad = this._warpRingRadius;
    g.clear();

    // Track
    g.lineStyle(3, 0x1a2a3a, 0.9);
    g.beginPath(); g.arc(rx, ry, rad, 0, Math.PI * 2); g.strokePath();

    if (active) {
      const t = this.scene.time.now / 300;
      g.lineStyle(3, 0x00ffcc, 0.9);
      g.beginPath(); g.arc(rx, ry, rad, t, t + Math.PI * 1.5); g.strokePath();
      g.lineStyle(5, 0x00ffcc, 0.2);
      g.beginPath(); g.arc(rx, ry, rad + 2, 0, Math.PI * 2); g.strokePath();
    } else if (available) {
      g.lineStyle(3, CONFIG.COLOR_CYAN, 0.9);
      g.beginPath(); g.arc(rx, ry, rad, 0, Math.PI * 2); g.strokePath();
      g.fillStyle(CONFIG.COLOR_CYAN, 0.7); g.fillCircle(rx, ry, 4);
    } else {
      if (progress > 0.02) {
        const angle = -Math.PI / 2;
        g.lineStyle(3, 0x00b4d8, 0.7);
        g.beginPath(); g.arc(rx, ry, rad, angle, angle + Math.PI * 2 * progress); g.strokePath();
      }
      g.fillStyle(0x445566, 0.4); g.fillCircle(rx, ry, 4);
    }
  }

  /**
   * @param {number}  survivalMs
   * @param {number}  ghostCount
   * @param {number}  timeUntilNextSpawnMs   — ms until next echo (-1 = at cap)
   * @param {number}  nextGhostNumber        — which echo number comes next
   * @param {boolean} isOverdrive            — whether overdrive is active
   * @param {boolean} timeWarpAvailable
   * @param {boolean} timeWarpActive
   * @param {number}  warpCooldownProgress
   */
  update(survivalMs, ghostCount, timeUntilNextSpawnMs, nextGhostNumber, isOverdrive,
         timeWarpAvailable, timeWarpActive, warpCooldownProgress) {

    // ── Time counter ────────────────────────────────────
    const sec = (survivalMs / 1000).toFixed(2);
    let timeColor = CONFIG.COLOR_CYAN;
    if (survivalMs > 60000)      timeColor = '#ff8c00';
    else if (survivalMs > 30000) timeColor = '#00e5cc';
    this.timeText.setText(`TIME: ${sec}`).setColor(timeColor);
    this.ghostText.setText(`ECHOES: ${ghostCount}`);

    // ── Echo countdown (top-centre) ─────────────────────
    const atCap = (timeUntilNextSpawnMs < 0);
    if (atCap) {
      // At ghost cap — show permanent message
      this.echoCountdownText.setText('MAX ECHOES ACTIVE').setColor('#ff3355');
      this.overdriveText.setText('');
    } else if (timeUntilNextSpawnMs >= 0) {
      const secs      = (timeUntilNextSpawnMs / 1000).toFixed(1);
      const pulse     = 0.7 + 0.3 * Math.sin(this.scene.time.now / 200);
      const urgentCol = timeUntilNextSpawnMs < 3000 ? '#ff3355' : '#ff8c00';
      this.echoCountdownText
        .setText(`ECHO #${nextGhostNumber} IN ${secs}s`)
        .setColor(urgentCol)
        .setAlpha(pulse);
    }

    // ── Overdrive label ──────────────────────────────────
    if (isOverdrive && !atCap) {
      const pulse = 0.6 + 0.4 * Math.sin(this.scene.time.now / 150);
      this.overdriveText.setText('⚡ OVERDRIVE ⚡').setAlpha(pulse);
    } else {
      this.overdriveText.setText('');
    }

    this._drawTCPanel(180);

    // ── Warp ring ────────────────────────────────────────
    this._drawWarpRing(warpCooldownProgress, timeWarpAvailable, timeWarpActive);

    if (timeWarpActive) {
      this.warpStatusText.setText('ACTIVE').setColor('#00ffcc');
      this.warpLabel.setColor('#00ffcc');
    } else if (timeWarpAvailable) {
      this.warpStatusText.setText('WARP').setColor(CONFIG.COLOR_CYAN);
      this.warpLabel.setColor('#445566');
    } else {
      const pct = Math.round(warpCooldownProgress * 100);
      this.warpStatusText.setText(`${pct}%`).setColor('#2a5080');
      this.warpLabel.setColor('#2a5080');
    }
  }

  destroy() {
    [this.timeText, this.ghostText, this.echoCountdownText, this.overdriveText,
     this.warpStatusText, this.warpLabel, this._warpRingGraphics,
     this._panelTL, this._panelBR, this._panelTC].forEach(o => o?.destroy());
  }
}
