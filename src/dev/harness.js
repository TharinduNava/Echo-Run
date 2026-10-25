/**
 * Dev-only test harness (never included in production builds).
 * Drives the game deterministically from the console:
 *   T.run(ms)        step the game at a fixed 60 fps
 *   T.tap('Space')   press + release a key
 *   T.safe(ms)       step with collisions disabled
 */
const KEYCODES = {
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32, ShiftLeft: 16,
  KeyE: 69, Escape: 27, KeyP: 80, KeyM: 77, KeyR: 82, KeyQ: 81, Enter: 13,
  KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, Digit1: 49, Digit2: 50, Digit3: 51,
};

export function installHarness(game) {
  // Tweens run on Date.now(); while the harness drives the game, Date follows simulated time
  const realNow = Date.now.bind(Date);
  let simDate = realNow();
  let simActive = false;
  const useSimDate = () => {
    if (!simActive) { simDate = realNow(); simActive = true; Date.now = () => Math.floor(simDate); }
  };

  const T = {
    g: game,
    t: performance.now(),
    errors: [],

    run(ms, each) {
      game.loop.sleep();
      const n = Math.round(ms / 16.667);
      for (let i = 0; i < n; i++) {
        this.t += 16.667; simDate += 16.667; useSimDate();
        try {
          if (each && each(i) === false) return 'stopped';
          game.step(this.t, 16.667);
        } catch (e) {
          this.errors.push(String(e.stack || e));
          return 'ERR ' + e;
        }
      }
      return 'ok';
    },

    /** Simulate without rendering (much faster); used for long scenarios. */
    fast(ms, each) {
      game.loop.sleep();
      const n = Math.round(ms / 16.667);
      for (let i = 0; i < n; i++) {
        this.t += 16.667; simDate += 16.667; useSimDate();
        try {
          if (each && each(i) === false) return 'stopped';
          game.headlessStep(this.t, 16.667);
        } catch (e) {
          this.errors.push(String(e.stack || e));
          return 'ERR ' + e;
        }
      }
      return 'ok';
    },

    /** Step with collisions disabled (GameScene.godMode). Fast (no render) by default. */
    safe(ms, each, fast = true) {
      const gs = this.gs();
      const prev = gs.godMode;
      gs.godMode = true;
      try { return fast ? this.fast(ms, each) : this.run(ms, each); }
      finally { gs.godMode = prev; }
    },

    /** Menu → GameScene on the given difficulty; returns the GameScene. */
    start(difficulty = 'normal') {
      if (this.active() !== 'MenuScene') { this.gs()._quitToMenu(); this.run(600); }
      this.run(300);
      this.scene('MenuScene')._setDifficulty(difficulty);
      this.tap('Space');
      this.run(600);
      return this.gs();
    },

    /** Game coords → page (CSS px) coords. */
    toPage(x, y) {
      const r = game.canvas.getBoundingClientRect();
      return { x: r.left + x * r.width / game.config.width, y: r.top + y * r.height / game.config.height };
    },

    key(code, type = 'keydown') {
      window.dispatchEvent(new KeyboardEvent(type, { key: code, code, keyCode: KEYCODES[code], bubbles: true }));
    },

    tap(code) { this.key(code, 'keydown'); this.run(34); this.key(code, 'keyup'); this.run(17); },
    scene(k)  { return game.scene.getScene(k); },
    gs()      { return this.scene('GameScene'); },
    active()  { return game.scene.getScenes(true).map(s => s.scene.key).join(','); },
    wake()    { Date.now = realNow; simActive = false; game.loop.wake(); return 'awake'; },
  };
  window.addEventListener('error', e => T.errors.push(String(e.message)));
  window.T = T;
}
