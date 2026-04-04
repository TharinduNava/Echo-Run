import { CONFIG } from '../config/GameConfig.js';
import { Ghost } from '../entities/Ghost.js';

export class GhostManager {
  constructor(scene, recorder, audioManager) {
    this.scene = scene;
    this.recorder = recorder;
    this.audioManager = audioManager;
    this.ghosts = [];
    this.ghostCount = 0;
    this.active = true;

    // Schedule first ghost
    this.scene.time.delayedCall(CONFIG.GHOST_DELAY, () => {
      this.spawnGhost();
    });
  }

  getDynamicInterval() {
    const baseInterval = CONFIG.GHOST_INTERVAL;
    const minInterval = 3000; // never less than 3s
    const reduction = this.ghostCount * 200; // 200ms less per ghost spawned
    return Math.max(minInterval, baseInterval - reduction);
  }

  spawnGhost() {
    if (!this.active) return;
    if (this.ghosts.length >= CONFIG.MAX_GHOSTS) return;

    const path = this.recorder.snapshotAll();
    if (path.length < 10) {
      // Not enough data, try again soon
      this.scene.time.delayedCall(1000, () => this.spawnGhost());
      return;
    }

    const ghost = new Ghost(this.scene, path);
    this.ghosts.push(ghost);
    this.ghostCount++;

    if (this.audioManager) {
      this.audioManager.playGhostSpawn();
    }

    console.log(`Ghost #${this.ghostCount} spawned with ${path.length} frames`);

    // Schedule next ghost
    this.scene.time.delayedCall(this.getDynamicInterval(), () => {
      this.spawnGhost();
    });
  }

  update(timeWarpMultiplier = 1) {
    this.ghosts.forEach(g => g.update(timeWarpMultiplier));
    // Remove dead ghosts
    this.ghosts = this.ghosts.filter(g => g.alive);
  }

  getAllGhosts() {
    return this.ghosts;
  }

  stop() {
    this.active = false;
  }

  destroyAll() {
    this.ghosts.forEach(g => g.destroy());
    this.ghosts = [];
    this.active = false;
  }
}
