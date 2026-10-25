import Phaser from 'phaser';
import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/share-tech-mono/400.css';

import { CONFIG }    from './config/GameConfig.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: CONFIG.CANVAS_WIDTH,
  height: CONFIG.CANVAS_HEIGHT,
  backgroundColor: CONFIG.COLOR_BG,
  parent: 'game-container',
  scene: [BootScene, MenuScene, GameScene],
  render: {
    antialias: true,
    pixelArt: false
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  input: {
    activePointers: 3,
  },
  // All sound is synthesised by AudioManager; Phaser's own sound system would open a second AudioContext
  audio: {
    noAudio: true,
  },
};

// Canvas text is rasterised once, so wait for the bundled fonts before creating the game
async function boot() {
  const fonts = ['16px Orbitron', 'bold 16px Orbitron', '16px "Share Tech Mono"'];
  try {
    await Promise.race([
      Promise.all(fonts.map(f => document.fonts.load(f))),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
  } catch { /* fall back to system fonts */ }
  const game = new Phaser.Game(config);
  if (import.meta.env.DEV) {
    window.__game = game;
    import('./dev/harness.js').then(m => m.installHarness(game));
  }
}

boot();
