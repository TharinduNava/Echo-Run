export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // No external assets — everything is procedural
    // Just ensure the scene transitions quickly
  }

  create() {
    this.scene.start('MenuScene');
  }
}
