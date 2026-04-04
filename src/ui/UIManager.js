import { CONFIG } from '../config/GameConfig.js';

export class UIManager {
  constructor(scene) {
    this.scene = scene;
    this._warpRingGraphics = null;
    this._lastWarpProgress = 1;

    const textStyle = {
      fontFamily: 'Orbitron, monospace',
      fontSize: '13px',
      color: CONFIG.COLOR_CYAN,
      align: 'left'
    };

    const p = CONFIG.ARENA_PADDING;

    // ---- HUD BACKING PANEL (top-left) ----
    this._panelTL = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelTL, p + 4, p + 4, 140, 52);

    // Time display
    this.timeText = scene.add.text(p + 14, p + 12, 'TIME: 0.00', textStyle).setDepth(50);

    // Ghost counter
    this.ghostText = scene.add.text(p + 14, p + 32, 'ECHOES: 0', {
      ...textStyle,
      color: CONFIG.COLOR_PURPLE
    }).setDepth(50);

    // ---- WARNING TEXT (top-center) ----
    this.warningText = scene.add.text(
      CONFIG.CANVAS_WIDTH / 2,
      p + 18,
      '',
      { ...textStyle, fontSize: '11px', color: '#ff8c00', align: 'center' }
    ).setOrigin(0.5).setDepth(50);

    // ---- WARP CHARGE AREA (bottom-right) ----
    const warpX = CONFIG.CANVAS_WIDTH - p - 8;
    const warpY = CONFIG.CANVAS_HEIGHT - p - 8;

    // Backing panel for warp (bottom-right)
    this._panelBR = scene.add.graphics().setDepth(48);
    this._drawPanel(this._panelBR, warpX - 120, warpY - 44, 128, 50);

    // Warp label
    this.warpLabel = scene.add.text(warpX - 58, warpY - 36, 'SHIFT', {
      ...textStyle,
      fontSize: '10px',
      color: '#445566'
    }).setOrigin(0.5).setDepth(52);

    this.warpStatusText = scene.add.text(warpX - 58, warpY - 20, 'WARP', {
      ...textStyle,
      fontSize: '11px',
      color: CONFIG.COLOR_CYAN
    }).setOrigin(0.5).setDepth(52);

    // Warp ring (circular arc cooldown indicator)
    this._warpRingGraphics = scene.add.graphics().setDepth(52);
    this._warpRingX = warpX - 18;
    this._warpRingY = warpY - 22;
    this._warpRingRadius = 16;

    this._drawWarpRing(1, true, false);
  }

  _drawPanel(g, x, y, w, h) {
    g.clear();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0x1e3a5f, 0.8);
    g.strokeRoundedRect(x, y, w, h, 6);
  }

  _drawWarpRing(progress, available, active) {
    const g = this._warpRingGraphics;
    const rx = this._warpRingX;
    const ry = this._warpRingY;
    const rad = this._warpRingRadius;

    g.clear();

    // Background track
    g.lineStyle(3, 0x1a2a3a, 0.9);
    g.beginPath();
    g.arc(rx, ry, rad, 0, Math.PI * 2);
    g.strokePath();

    if (active) {
      // Spinning animated ring while active
      const t = this.scene.time.now / 300;
      g.lineStyle(3, 0x00ffcc, 0.9);
      g.beginPath();
      g.arc(rx, ry, rad, t, t + Math.PI * 1.5);
      g.strokePath();
      // Outer glow ring
      g.lineStyle(5, 0x00ffcc, 0.2);
      g.beginPath();
      g.arc(rx, ry, rad + 2, 0, Math.PI * 2);
      g.strokePath();
    } else if (available) {
      // Solid full ring (ready)
      g.lineStyle(3, CONFIG.COLOR_CYAN, 0.9);
      g.beginPath();
      g.arc(rx, ry, rad, 0, Math.PI * 2);
      g.strokePath();
      // Center dot (ready indicator)
      g.fillStyle(CONFIG.COLOR_CYAN, 0.7);
      g.fillCircle(rx, ry, 4);
    } else {
      // Partial arc (charging)
      const angle = -Math.PI / 2;
      const endAngle = angle + (Math.PI * 2 * progress);
      if (progress > 0.02) {
        g.lineStyle(3, 0x00b4d8, 0.7);
        g.beginPath();
        g.arc(rx, ry, rad, angle, endAngle);
        g.strokePath();
      }
      // Dim center
      g.fillStyle(0x445566, 0.4);
      g.fillCircle(rx, ry, 4);
    }
  }

  update(survivalMs, ghostCount, timeUntilNextGhost, timeWarpAvailable = true, timeWarpActive = false, warpCooldownProgress = 1) {
    // ---- Time ----
    const seconds = (survivalMs / 1000).toFixed(2);
    // Colour escalates from cyan → orange → red as time grows
    const timeSeconds = survivalMs / 1000;
    let timeColor = CONFIG.COLOR_CYAN;
    if (timeSeconds > 60) timeColor = '#ff8c00';
    else if (timeSeconds > 30) timeColor = '#00e5cc';
    this.timeText.setText(`TIME: ${seconds}`).setColor(timeColor);
    this.ghostText.setText(`ECHOES: ${ghostCount}`);

    // ---- Countdown warning ----
    if (ghostCount === 0 && timeUntilNextGhost > 0) {
      const countdown = (timeUntilNextGhost / 1000).toFixed(1);
      this.warningText.setText(`ECHO IN ${countdown}s`).setAlpha(0.8 + 0.2 * Math.sin(this.scene.time.now / 200));
    } else {
      this.warningText.setText('');
    }

    // ---- Warp ring + label ----
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
    this.timeText.destroy();
    this.ghostText.destroy();
    this.warningText.destroy();
    this.warpStatusText.destroy();
    this.warpLabel.destroy();
    if (this._warpRingGraphics) this._warpRingGraphics.destroy();
    if (this._panelTL) this._panelTL.destroy();
    if (this._panelBR) this._panelBR.destroy();
  }
}
