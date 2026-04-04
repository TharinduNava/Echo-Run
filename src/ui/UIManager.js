import { CONFIG } from '../config/GameConfig.js';

export class UIManager {
  constructor(scene) {
    this.scene = scene;

    const style = {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: CONFIG.COLOR_CYAN,
      align: 'left'
    };

    // Time display
    this.timeText = scene.add.text(
      CONFIG.ARENA_PADDING + 10,
      CONFIG.ARENA_PADDING + 10,
      'TIME: 0.00',
      style
    ).setDepth(50);

    // Ghost counter
    this.ghostText = scene.add.text(
      CONFIG.ARENA_PADDING + 10,
      CONFIG.ARENA_PADDING + 30,
      'ECHOES: 0',
      { ...style, color: CONFIG.COLOR_PURPLE }
    ).setDepth(50);

    // Warning label (hidden until 10s)
    this.warningText = scene.add.text(
      CONFIG.CANVAS_WIDTH / 2,
      CONFIG.ARENA_PADDING + 20,
      '',
      { ...style, fontSize: '12px', color: '#ff8800', align: 'center' }
    ).setOrigin(0.5).setDepth(50);
  }

  update(survivalMs, ghostCount, timeUntilNextGhost) {
    const seconds = (survivalMs / 1000).toFixed(2);
    this.timeText.setText(`TIME: ${seconds}`);
    this.ghostText.setText(`ECHOES: ${ghostCount}`);

    // Countdown to first ghost
    if (ghostCount === 0 && timeUntilNextGhost > 0) {
      const countdown = (timeUntilNextGhost / 1000).toFixed(1);
      this.warningText.setText(`ECHO IN ${countdown}s`);
    } else if (ghostCount > 0) {
      this.warningText.setText('');
    }
  }

  destroy() {
    this.timeText.destroy();
    this.ghostText.destroy();
    this.warningText.destroy();
  }
}
