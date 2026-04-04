# ECHO RUN — Complete Game Design & Technical Execution Document
> *"Your past is your greatest enemy."*

**Version:** 1.0 — Production-Ready  
**Engine:** Phaser 3 (Web)  
**Language:** JavaScript (ES6+)  
**Target Platform:** Browser (Desktop + Mobile)  
**Session Length:** 30–120 seconds  
**Genre:** Survival / Arcade / Psychological

---

## TABLE OF CONTENTS

1. [Game Vision & Philosophy](#1-game-vision--philosophy)
2. [Core Gameplay Loop](#2-core-gameplay-loop)
3. [Core Mechanics — Deep Spec](#3-core-mechanics--deep-spec)
4. [System Architecture](#4-system-architecture)
5. [File Structure](#5-file-structure)
6. [Phase-by-Phase Build Plan](#6-phase-by-phase-build-plan)
7. [Phase 1 — Base Scene & Player](#phase-1--base-scene--player-movement)
8. [Phase 2 — Recording System](#phase-2--recording-system)
9. [Phase 3 — Ghost Replay (Single)](#phase-3--ghost-replay-single)
10. [Phase 4 — Ghost Scaling & Multi-Ghost](#phase-4--ghost-scaling--multi-ghost)
11. [Phase 5 — Collision, Death & Restart](#phase-5--collision-death--restart)
12. [Phase 6 — UI & Score System](#phase-6--ui--score-system)
13. [Phase 7 — Visual Polish & Effects](#phase-7--visual-polish--effects)
14. [Phase 8 — Audio System](#phase-8--audio-system)
15. [Phase 9 — Advanced Features](#phase-9--advanced-features-post-mvp)
16. [Art & Visual Design Spec](#art--visual-design-spec)
17. [Game Feel Specification](#game-feel-specification)
18. [Testing Strategy](#testing-strategy)
19. [Deployment Guide](#deployment-guide)
20. [Complete Code Reference](#complete-code-reference)

---

## 1. GAME VISION & PHILOSOPHY

### Core Vision

ECHO RUN is a minimal, polished, infinitely replayable survival game with a single twist: **you are your own enemy**. The player's past movements are recorded and replayed as ghost enemies. The longer you survive, the more of your own movement history haunts you.

No AI. No scripted patterns. The difficulty is entirely player-generated.

### Design Philosophy

| Principle | Implementation |
|-----------|---------------|
| One mechanic, deeply explored | Ghost recording is the only mechanic — no weapons, no power-ups in MVP |
| Simple visuals, strong feel | Neon on dark, particle trails, screen shake — atmosphere over complexity |
| Short sessions, high replayability | 30–120s per run; instant restart |
| Skill + strategy | Players learn to move deliberately to avoid trapping themselves |

### The Psychological Hook

The moment a player realizes their own path killed them is the game's entire payoff. Design every system to maximize this realization.

> **The win condition for the designer:** Player says: *"Wait — I died because of MYSELF??"*

### Unique Selling Points

- **Player-Generated Enemies** — no AI behavior trees; enemies ARE the player
- **Emergent Difficulty** — the game gets harder exactly as fast as the player plays
- **Psychological Gameplay** — guilt, pattern recognition, self-awareness as game mechanics
- **Zero Loading** — instant restart keeps the psychological loop tight

---

## 2. CORE GAMEPLAY LOOP

```
┌─────────────────────────────────────────────────────────┐
│                    ECHO RUN GAME LOOP                   │
│                                                         │
│  [Player Moves]                                         │
│       │                                                 │
│       ▼                                                 │
│  [Recorder captures position + timestamp every frame]   │
│       │                                                 │
│       ▼                                                 │
│  [After GHOST_DELAY seconds → spawn Ghost from buffer]  │
│       │                                                 │
│       ▼                                                 │
│  [Ghost replays exact path in real time]                │
│       │                                                 │
│       ▼                                                 │
│  [Player must avoid ghost + arena boundaries]           │
│       │                                                 │
│       ├──── alive ────► [loop continues]                │
│       │                                                 │
│       └──── touched ──► [DEATH → score → restart]       │
└─────────────────────────────────────────────────────────┘
```

### Player Experience Timeline

| Time | Emotional State | What's Happening |
|------|-----------------|-----------------|
| 0–10s | Calm, exploring | Only the player exists. No ghosts yet. |
| 10–20s | Mild tension | First ghost spawns, replaying early movement |
| 20–40s | "Wait... what?" | Player recognizes their own path as an obstacle |
| 40–60s | Engaged, adapting | Multiple ghosts, player consciously adjusts movement |
| 60–90s | Chaos + focus | Screen fills with ghost trails, survival is pure skill |
| 90s+ | Flow state | Elite players achieve zen-like movement economy |

---

## 3. CORE MECHANICS — DEEP SPEC

### 3.1 Player

```
Speed:          200px/sec (constant, no acceleration in MVP)
Shape:          Circle, radius 10px
Color:          #00f5ff (bright cyan)
Controls:       WASD + Arrow Keys (both active simultaneously)
Collision:      Wall bounce OR clamp to bounds (configurable)
Trail:          8-frame particle trail (cyan, fading)
Origin:         Arena center on spawn
```

**Movement Model:**
- Velocity-based (not position-based) — smoother feel
- No diagonal speed boost (normalize diagonal vectors)
- No inertia in MVP — instant direction response
- Easing: none in MVP, optional lerp in polish phase

### 3.2 Ghost System

```
Appearance:     Circle, radius 10px (same as player)
Color:          #a855f7 (purple) at 60% opacity
Trail:          Ghost's own 8-frame trail at 30% opacity
Behavior:       Replays recorded positions in sequence
Spawn:          After GHOST_DELAY seconds from game start
Spawn Rate:     Every GHOST_INTERVAL seconds, a new ghost spawns
Wall Behavior:  Same as player (recorded path already avoided walls)
Kill Condition: Overlap with player → instant death
```

**Ghost Lifecycle:**

```
RECORDED PATH → wait GHOST_DELAY → spawn at path[0] → advance through path[] 
→ on path end: ghost LOOPS (replays from beginning) OR despawns (configurable)
```

**Ghost Configuration Constants:**
```javascript
GHOST_DELAY:         5000   // ms before first ghost spawns
GHOST_INTERVAL:      8000   // ms between subsequent ghost spawns
MAX_GHOSTS:          12     // hard cap to prevent performance issues
GHOST_LOOP_PATH:     true   // ghost replays path on completion
GHOST_FADE_IN_MS:    500    // ghost fade-in duration on spawn
```

### 3.3 Recording System

**Data Structure per frame:**
```javascript
{
  x: Number,          // player world X position
  y: Number,          // player world Y position
  timestamp: Number   // ms since game start (Date.now() or scene.time.now)
}
```

**Buffer Strategy:**
- Rolling buffer: stores last `RECORD_WINDOW_MS` (e.g., 60000ms = 60 seconds)
- On ghost spawn: snapshot of current buffer is cloned to that ghost
- Each ghost has its own independent path copy — mutations don't affect others

**Recording Interval:**
- Record every frame (60fps = ~16ms intervals)
- At 60fps × 60s = 3600 data points per ghost — lightweight

### 3.4 Arena

```
Type:           Rectangular bounded arena
Default Size:   800 × 600px (centered in canvas)
Border:         2px solid #1e3a5f (subtle blue)
Background:     #0f172a (dark navy)
Canvas:         Match viewport, arena centered
```

**Boundary Behavior:**
- Player is clamped to arena bounds (no wall bounce in MVP)
- Ghost paths were recorded within bounds, so ghosts stay in bounds naturally

### 3.5 Death & Restart

```
Death Trigger:      Player circle overlaps any ghost circle (distance < sum of radii)
Death Effect:       Screen flash white → fade out
                    Player explodes into 20 particles
                    Screen shake (300ms, intensity 8)
                    All ghosts flash red briefly
Death Hold:         500ms freeze before restart prompt (prevent accidental skip)
Restart:            Press SPACE or tap screen → instant scene restart
Score Display:      Survival time (seconds + centiseconds) shown on death screen
Best Time:          Stored in localStorage, shown on death screen
```

---

## 4. SYSTEM ARCHITECTURE

### Module Map

```
┌─────────────────────────────────────────────────────────────┐
│                        main.js                              │
│              Phaser.Game config + scene registry            │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  BootScene.js       MenuScene.js       GameScene.js
  (preload assets)   (title screen)     (main game)
                                              │
              ┌───────────────────────────────┤
              │               │               │
              ▼               ▼               ▼
          Player.js       Ghost.js        Recorder.js
          (entity)        (entity)        (system)
              │               │               │
              └───────────────┴───────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        CollisionSystem   UIManager.js    EffectsManager.js
        (inline or class) (HUD + screens) (particles, shake)
```

### Data Flow

```
Input → Player.update() → position changes
                       ↓
               Recorder.record(x, y, t)
                       ↓
               buffer: Array<{x,y,t}>
                       ↓
         [on ghost spawn timer fires]
                       ↓
               Ghost.init(buffer.clone())
                       ↓
               Ghost.update() → advance path index
                       ↓
               CollisionSystem.check(player, ghosts[])
                       ↓
               [overlap] → GameScene.onDeath()
```

### State Machine (GameScene)

```
BOOT → PLAYING → DEAD → RESTARTING → PLAYING
         ↑                               │
         └───────────────────────────────┘
```

---

## 5. FILE STRUCTURE

```
echo-run/
├── index.html
├── package.json
├── README.md
│
├── src/
│   ├── main.js                   # Phaser config, scene registration
│   │
│   ├── config/
│   │   └── GameConfig.js         # All tunable constants
│   │
│   ├── scenes/
│   │   ├── BootScene.js          # Asset preloading
│   │   ├── MenuScene.js          # Title screen
│   │   ├── GameScene.js          # Main game loop + orchestration
│   │   └── GameOverScene.js      # Score + restart screen
│   │
│   ├── entities/
│   │   ├── Player.js             # Player movement + rendering
│   │   └── Ghost.js              # Ghost playback + rendering
│   │
│   ├── systems/
│   │   ├── Recorder.js           # Position recording + buffer
│   │   ├── GhostManager.js       # Ghost spawn scheduling + pool
│   │   ├── CollisionSystem.js    # Overlap detection
│   │   └── ScoreSystem.js        # Time tracking + persistence
│   │
│   ├── ui/
│   │   ├── UIManager.js          # HUD overlay (time, ghost count)
│   │   ├── MenuUI.js             # Title screen components
│   │   └── GameOverUI.js         # Death screen components
│   │
│   └── effects/
│       ├── EffectsManager.js     # Coordinator
│       ├── TrailEffect.js        # Player/ghost particle trails
│       ├── DeathEffect.js        # Death explosion + screen flash
│       └── SpawnEffect.js        # Ghost spawn pulse effect
│
└── assets/
    ├── audio/
    │   ├── move.wav              # Subtle movement tick
    │   ├── ghost_spawn.wav       # Ghost spawn tone
    │   ├── death.wav             # Impact sound
    │   └── ambient.mp3           # Optional background loop
    └── fonts/
        └── echo-run.css          # Google Font import (Orbitron)
```

---

## 6. PHASE-BY-PHASE BUILD PLAN

Each phase produces a **working, testable game state**. Never skip ahead.

| Phase | Deliverable | Test Condition |
|-------|-------------|----------------|
| 1 | Player moves in arena | WASD works, player stays in bounds |
| 2 | Recorder captures positions | Console.log shows path array growing |
| 3 | Single ghost replays path | Ghost follows player's 5s-ago path |
| 4 | Multiple ghosts, scaling | New ghost spawns every 8s |
| 5 | Collision + death + restart | Touching ghost = death, SPACE restarts |
| 6 | UI + score system | Time displayed, best time saved |
| 7 | Visual polish + effects | Trails, particles, screen shake |
| 8 | Audio | Sounds on spawn/death |
| 9 | Advanced features | 1–2 selected from advanced list |

---

## PHASE 1 — Base Scene & Player Movement

### Goal
A player circle moves around a bounded arena. Nothing else.

### Files to Create
- `index.html`
- `src/main.js`
- `src/config/GameConfig.js`
- `src/scenes/GameScene.js`
- `src/entities/Player.js`

### `index.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ECHO RUN</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: #0f172a; 
      display: flex; 
      justify-content: center; 
      align-items: center; 
      height: 100vh;
      overflow: hidden;
    }
    canvas { display: block; }
  </style>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js"></script>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

### `src/config/GameConfig.js`
```javascript
export const CONFIG = {
  // Arena
  CANVAS_WIDTH:       800,
  CANVAS_HEIGHT:      600,
  ARENA_PADDING:      40,        // px from canvas edge to arena wall

  // Player
  PLAYER_SPEED:       200,       // px/sec
  PLAYER_RADIUS:      10,        // px
  PLAYER_COLOR:       0x00f5ff,  // cyan

  // Ghost
  GHOST_DELAY:        5000,      // ms before first ghost spawns
  GHOST_INTERVAL:     8000,      // ms between subsequent ghosts
  MAX_GHOSTS:         12,
  GHOST_RADIUS:       10,
  GHOST_COLOR:        0xa855f7,  // purple
  GHOST_ALPHA:        0.6,
  GHOST_FADE_IN_MS:   500,
  GHOST_LOOP_PATH:    true,      // ghost loops its path when done

  // Recording
  RECORD_INTERVAL:    16,        // ms between recorded frames (~60fps)
  RECORD_WINDOW_MS:   120000,    // keep last 2 minutes of data

  // Effects
  TRAIL_LENGTH:       8,         // frames of trail
  SCREEN_SHAKE_MS:    300,
  SCREEN_SHAKE_INT:   8,
  DEATH_HOLD_MS:      500,       // freeze after death before restart enabled

  // Colors (hex strings for CSS/Text)
  COLOR_BG:           '#0f172a',
  COLOR_CYAN:         '#00f5ff',
  COLOR_PURPLE:       '#a855f7',
  COLOR_BORDER:       '#1e3a5f',
  COLOR_WHITE:        '#ffffff',
  COLOR_DANGER:       '#ff4444',
};
```

### `src/main.js`
```javascript
import { CONFIG } from './config/GameConfig.js';
import { GameScene } from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: CONFIG.CANVAS_WIDTH,
  height: CONFIG.CANVAS_HEIGHT,
  backgroundColor: CONFIG.COLOR_BG,
  parent: document.body,
  scene: [GameScene],
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  render: {
    antialias: true,
    pixelArt: false
  }
};

new Phaser.Game(config);
```

### `src/entities/Player.js`
```javascript
import { CONFIG } from '../config/GameConfig.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.x = CONFIG.CANVAS_WIDTH / 2;
    this.y = CONFIG.CANVAS_HEIGHT / 2;
    this.vx = 0;
    this.vy = 0;
    this.radius = CONFIG.PLAYER_RADIUS;
    this.alive = true;

    // Bounds
    this.minX = CONFIG.ARENA_PADDING + this.radius;
    this.maxX = CONFIG.CANVAS_WIDTH - CONFIG.ARENA_PADDING - this.radius;
    this.minY = CONFIG.ARENA_PADDING + this.radius;
    this.maxY = CONFIG.CANVAS_HEIGHT - CONFIG.ARENA_PADDING - this.radius;

    // Graphics
    this.graphics = scene.add.graphics();
    this.draw();

    // Input
    this.keys = scene.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w:     Phaser.Input.Keyboard.KeyCodes.W,
      a:     Phaser.Input.Keyboard.KeyCodes.A,
      s:     Phaser.Input.Keyboard.KeyCodes.S,
      d:     Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  update(delta) {
    if (!this.alive) return;

    const dt = delta / 1000; // convert ms to seconds
    let dx = 0;
    let dy = 0;

    if (this.keys.left.isDown  || this.keys.a.isDown) dx -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) dx += 1;
    if (this.keys.up.isDown    || this.keys.w.isDown) dy -= 1;
    if (this.keys.down.isDown  || this.keys.s.isDown) dy += 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    this.x += dx * CONFIG.PLAYER_SPEED * dt;
    this.y += dy * CONFIG.PLAYER_SPEED * dt;

    // Clamp to arena
    this.x = Phaser.Math.Clamp(this.x, this.minX, this.maxX);
    this.y = Phaser.Math.Clamp(this.y, this.minY, this.maxY);

    this.draw();
  }

  draw() {
    this.graphics.clear();
    // Outer glow
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 0.2);
    this.graphics.fillCircle(this.x, this.y, this.radius * 2.5);
    // Core
    this.graphics.fillStyle(CONFIG.PLAYER_COLOR, 1);
    this.graphics.fillCircle(this.x, this.y, this.radius);
    // Inner highlight
    this.graphics.fillStyle(0xffffff, 0.6);
    this.graphics.fillCircle(this.x - 3, this.y - 3, this.radius * 0.35);
  }

  kill() {
    this.alive = false;
    this.graphics.setVisible(false);
  }

  destroy() {
    this.graphics.destroy();
  }
}
```

### `src/scenes/GameScene.js` (Phase 1)
```javascript
import { CONFIG } from '../config/GameConfig.js';
import { Player } from '../entities/Player.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.state = 'PLAYING';

    // Draw arena
    this.arenaGraphics = this.add.graphics();
    this.drawArena();

    // Create player
    this.player = new Player(this);
  }

  drawArena() {
    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;

    this.arenaGraphics.clear();
    // Background fill
    this.arenaGraphics.fillStyle(0x0f172a, 1);
    this.arenaGraphics.fillRect(0, 0, w, h);
    // Arena border
    this.arenaGraphics.lineStyle(2, 0x1e3a5f, 1);
    this.arenaGraphics.strokeRect(p, p, w - p * 2, h - p * 2);
    // Corner accents
    this.arenaGraphics.lineStyle(3, 0x00f5ff, 0.3);
    const cs = 20; // corner size
    [[p, p], [w-p, p], [p, h-p], [w-p, h-p]].forEach(([cx, cy]) => {
      const sx = cx === p ? 1 : -1;
      const sy = cy === p ? 1 : -1;
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(cx + sx * cs, cy);
      this.arenaGraphics.lineTo(cx, cy);
      this.arenaGraphics.lineTo(cx, cy + sy * cs);
      this.arenaGraphics.strokePath();
    });
  }

  update(time, delta) {
    if (this.state !== 'PLAYING') return;
    this.player.update(delta);
  }
}
```

### Phase 1 Test Checklist
- [ ] Canvas renders with dark background
- [ ] Arena border visible with corner accents
- [ ] Cyan circle appears at center
- [ ] WASD and arrow keys move the player
- [ ] Player cannot leave arena bounds
- [ ] Diagonal movement is not faster than cardinal

---

## PHASE 2 — Recording System

### Goal
Every frame, the player's position is recorded. After `GHOST_DELAY` milliseconds, the recording is ready to be replayed.

### New Files
- `src/systems/Recorder.js`

### `src/systems/Recorder.js`
```javascript
import { CONFIG } from '../config/GameConfig.js';

export class Recorder {
  constructor() {
    this.buffer = [];          // Array<{x, y, t}>
    this.lastRecordTime = 0;
    this.startTime = Date.now();
  }

  record(x, y) {
    const now = Date.now() - this.startTime;

    // Only record at RECORD_INTERVAL rate
    if (now - this.lastRecordTime < CONFIG.RECORD_INTERVAL) return;
    this.lastRecordTime = now;

    this.buffer.push({ x, y, t: now });

    // Prune old data outside the rolling window
    const cutoff = now - CONFIG.RECORD_WINDOW_MS;
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) {
      this.buffer.shift();
    }
  }

  // Clone buffer snapshot for a ghost to replay
  snapshotFrom(startOffsetMs) {
    // Returns all recorded frames from startOffsetMs onward
    return this.buffer
      .filter(f => f.t >= startOffsetMs)
      .map(f => ({ ...f })); // deep copy
  }

  // Get full buffer clone
  snapshotAll() {
    return this.buffer.map(f => ({ ...f }));
  }

  getElapsed() {
    return Date.now() - this.startTime;
  }

  reset() {
    this.buffer = [];
    this.lastRecordTime = 0;
    this.startTime = Date.now();
  }
}
```

### Update `GameScene.js` — add Recorder
```javascript
// In create():
this.recorder = new Recorder();

// In update():
this.recorder.record(this.player.x, this.player.y);

// Debug (remove later):
if (this.recorder.buffer.length % 60 === 0) {
  console.log(`Recording: ${this.recorder.buffer.length} frames`);
}
```

### Phase 2 Test Checklist
- [ ] Console shows buffer growing every ~60 frames
- [ ] Buffer stops growing at `RECORD_WINDOW_MS` limit
- [ ] `snapshotAll()` returns a copy (mutating it doesn't affect buffer)

---

## PHASE 3 — Ghost Replay (Single)

### Goal
After `GHOST_DELAY` ms, a single ghost spawns and replays the recorded path exactly.

### New Files
- `src/entities/Ghost.js`
- `src/systems/GhostManager.js`

### `src/entities/Ghost.js`
```javascript
import { CONFIG } from '../config/GameConfig.js';

export class Ghost {
  constructor(scene, path) {
    this.scene = scene;
    this.path = path;           // Array<{x, y, t}>
    this.pathIndex = 0;
    this.alive = true;
    this.alpha = 0;             // starts invisible, fades in

    // Validate path
    if (!this.path || this.path.length < 2) {
      this.alive = false;
      return;
    }

    this.x = this.path[0].x;
    this.y = this.path[0].y;

    // Graphics
    this.graphics = scene.add.graphics();

    // Fade in tween
    scene.tweens.add({
      targets: this,
      alpha: CONFIG.GHOST_ALPHA,
      duration: CONFIG.GHOST_FADE_IN_MS,
      ease: 'Linear'
    });

    // Spawn pulse ring effect
    this.spawnPulse();

    this.pathStartTime = scene.time.now;
    this.pathOffset = this.path[0].t;
  }

  spawnPulse() {
    const pulse = this.scene.add.graphics();
    pulse.lineStyle(2, CONFIG.GHOST_COLOR, 0.8);
    pulse.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS);
    this.scene.tweens.add({
      targets: pulse,
      scaleX: 4, scaleY: 4,
      alpha: 0,
      duration: 600,
      ease: 'Power2',
      onComplete: () => pulse.destroy()
    });
  }

  update() {
    if (!this.alive || !this.path || this.path.length === 0) return;

    const elapsed = this.scene.time.now - this.pathStartTime;
    const targetT = elapsed + this.pathOffset;

    // Advance path index to match elapsed time
    while (
      this.pathIndex < this.path.length - 1 &&
      this.path[this.pathIndex + 1].t <= targetT
    ) {
      this.pathIndex++;
    }

    // Loop path if configured
    if (this.pathIndex >= this.path.length - 1) {
      if (CONFIG.GHOST_LOOP_PATH) {
        this.pathIndex = 0;
        this.pathStartTime = this.scene.time.now;
      } else {
        this.alive = false;
        this.graphics.setVisible(false);
        return;
      }
    }

    // Interpolate between frames for smooth movement
    const curr = this.path[this.pathIndex];
    const next = this.path[this.pathIndex + 1] || curr;
    const span = next.t - curr.t;
    const t = span > 0 ? (targetT - curr.t) / span : 0;
    const lerpT = Phaser.Math.Clamp(t, 0, 1);

    this.x = Phaser.Math.Linear(curr.x, next.x, lerpT);
    this.y = Phaser.Math.Linear(curr.y, next.y, lerpT);

    this.draw();
  }

  draw() {
    this.graphics.clear();
    // Outer glow
    this.graphics.fillStyle(CONFIG.GHOST_COLOR, this.alpha * 0.15);
    this.graphics.fillCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 2.5);
    // Core
    this.graphics.fillStyle(CONFIG.GHOST_COLOR, this.alpha);
    this.graphics.fillCircle(this.x, this.y, CONFIG.GHOST_RADIUS);
    // Inner ring
    this.graphics.lineStyle(1, 0xffffff, this.alpha * 0.4);
    this.graphics.strokeCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 0.7);
  }

  flashDanger() {
    const originalAlpha = this.alpha;
    this.alpha = 1;
    this.scene.time.delayedCall(100, () => {
      this.alpha = originalAlpha;
    });
  }

  destroy() {
    this.graphics.destroy();
  }
}
```

### `src/systems/GhostManager.js`
```javascript
import { CONFIG } from '../config/GameConfig.js';
import { Ghost } from '../entities/Ghost.js';

export class GhostManager {
  constructor(scene, recorder) {
    this.scene = scene;
    this.recorder = recorder;
    this.ghosts = [];
    this.ghostCount = 0;
    this.active = true;

    // Schedule first ghost
    this.scene.time.delayedCall(CONFIG.GHOST_DELAY, () => {
      this.spawnGhost();
    });
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

    console.log(`Ghost #${this.ghostCount} spawned with ${path.length} frames`);

    // Schedule next ghost
    this.scene.time.delayedCall(CONFIG.GHOST_INTERVAL, () => {
      this.spawnGhost();
    });
  }

  update() {
    this.ghosts.forEach(g => g.update());
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
```

### Update `GameScene.js` — add GhostManager
```javascript
// In create():
this.ghostManager = new GhostManager(this, this.recorder);

// In update():
this.ghostManager.update();
```

### Phase 3 Test Checklist
- [ ] No ghost visible for first 5 seconds
- [ ] After 5 seconds, a purple circle spawns with fade-in
- [ ] Ghost follows the exact path the player took 5 seconds ago
- [ ] Ghost movement is smooth (interpolated, not jumpy)
- [ ] Ghost loops at end of path
- [ ] Spawn pulse ring visible on ghost creation

---

## PHASE 4 — Ghost Scaling & Multi-Ghost

### Goal
A new ghost spawns every `GHOST_INTERVAL` seconds. The game naturally escalates. Each ghost is an independent copy of the recorded path at time of spawn.

This phase requires no new files — `GhostManager` already handles it via `delayedCall` chaining. The key is validating that each ghost is independent.

### Scaling Parameters (tune in `GameConfig.js`)

```javascript
// Progressive difficulty: reduce interval over time
// In GhostManager.spawnGhost(), compute dynamic interval:
getDynamicInterval() {
  const baseInterval = CONFIG.GHOST_INTERVAL;
  const minInterval = 3000; // never less than 3s
  const reduction = this.ghostCount * 200; // 200ms less per ghost spawned
  return Math.max(minInterval, baseInterval - reduction);
}
```

### Phase 4 Test Checklist
- [ ] Second ghost spawns at ~13s (5s delay + 8s interval)
- [ ] Third ghost at ~21s
- [ ] Each ghost follows a different path segment (captured at different times)
- [ ] Ghosts do not interact with each other
- [ ] Performance: 10+ ghosts run smoothly at 60fps

---

## PHASE 5 — Collision, Death & Restart

### Goal
Touching any ghost kills the player. Death screen shows. Instant restart on SPACE.

### New Files
- `src/systems/CollisionSystem.js`

### `src/systems/CollisionSystem.js`
```javascript
export class CollisionSystem {
  // Returns the first ghost colliding with player, or null
  static check(player, ghosts) {
    if (!player.alive) return null;

    for (const ghost of ghosts) {
      if (!ghost.alive) continue;

      const dx = player.x - ghost.x;
      const dy = player.y - ghost.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDist = player.radius + ghost.radius;  // sum of radii

      if (distance < minDist) {
        return ghost;
      }
    }
    return null;
  }
}
```

### Update `GameScene.js` — Death System (Phase 5)

```javascript
// Add to create():
this.input.keyboard.on('keydown-SPACE', () => {
  if (this.state === 'DEAD') {
    this.restartGame();
  }
});
this.input.on('pointerdown', () => {
  if (this.state === 'DEAD') {
    this.restartGame();
  }
});

// Add to update():
if (this.state === 'PLAYING') {
  const hitGhost = CollisionSystem.check(this.player, this.ghostManager.getAllGhosts());
  if (hitGhost) {
    this.onDeath(hitGhost);
  }
}

// Add methods:
onDeath(ghost) {
  if (this.state !== 'PLAYING') return;
  this.state = 'DYING';

  // Stop recording and ghost spawns
  this.ghostManager.stop();
  this.player.kill();

  // Flash all ghosts red
  this.ghostManager.getAllGhosts().forEach(g => g.flashDanger());

  // Screen flash
  const flash = this.add.rectangle(
    CONFIG.CANVAS_WIDTH / 2,
    CONFIG.CANVAS_HEIGHT / 2,
    CONFIG.CANVAS_WIDTH,
    CONFIG.CANVAS_HEIGHT,
    0xffffff
  ).setAlpha(0.8).setDepth(100);

  this.tweens.add({
    targets: flash,
    alpha: 0,
    duration: 400,
    onComplete: () => flash.destroy()
  });

  // Screen shake
  this.cameras.main.shake(CONFIG.SCREEN_SHAKE_MS, CONFIG.SCREEN_SHAKE_INT / 1000);

  // Transition to dead state
  this.time.delayedCall(CONFIG.DEATH_HOLD_MS, () => {
    this.state = 'DEAD';
    this.showDeathScreen();
  });
}

showDeathScreen() {
  const cx = CONFIG.CANVAS_WIDTH / 2;
  const cy = CONFIG.CANVAS_HEIGHT / 2;

  // Dim overlay
  const overlay = this.add.rectangle(cx, cy,
    CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT,
    0x000000, 0.6).setDepth(90);

  // Title
  this.add.text(cx, cy - 80, 'ECHO TERMINATED', {
    fontFamily: 'monospace',
    fontSize: '32px',
    color: CONFIG.COLOR_DANGER,
    align: 'center'
  }).setOrigin(0.5).setDepth(91);

  // Survival time
  const seconds = (this.survivalTime / 1000).toFixed(2);
  this.add.text(cx, cy - 20, `SURVIVED: ${seconds}s`, {
    fontFamily: 'monospace',
    fontSize: '22px',
    color: CONFIG.COLOR_WHITE,
    align: 'center'
  }).setOrigin(0.5).setDepth(91);

  // Ghosts faced
  this.add.text(cx, cy + 20, `GHOSTS: ${this.ghostManager.ghostCount}`, {
    fontFamily: 'monospace',
    fontSize: '18px',
    color: CONFIG.COLOR_PURPLE,
    align: 'center'
  }).setOrigin(0.5).setDepth(91);

  // Best time
  const best = localStorage.getItem('echorun_best') || '0';
  const bestSec = (parseFloat(best) / 1000).toFixed(2);
  if (this.survivalTime > parseFloat(best)) {
    localStorage.setItem('echorun_best', this.survivalTime);
    this.add.text(cx, cy + 60, '✦ NEW BEST ✦', {
      fontFamily: 'monospace', fontSize: '16px',
      color: '#ffd700', align: 'center'
    }).setOrigin(0.5).setDepth(91);
  } else {
    this.add.text(cx, cy + 60, `BEST: ${bestSec}s`, {
      fontFamily: 'monospace', fontSize: '16px',
      color: '#888888', align: 'center'
    }).setOrigin(0.5).setDepth(91);
  }

  // Restart prompt (blink)
  const prompt = this.add.text(cx, cy + 110, 'SPACE / TAP TO RESTART', {
    fontFamily: 'monospace', fontSize: '14px',
    color: CONFIG.COLOR_CYAN, align: 'center'
  }).setOrigin(0.5).setDepth(91);

  this.tweens.add({
    targets: prompt,
    alpha: 0,
    duration: 600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
}

restartGame() {
  this.scene.restart();
}
```

### Track survival time in `create()` and `update()`:
```javascript
// In create():
this.survivalTime = 0;
this.gameStartTime = this.time.now;

// In update(), inside PLAYING state check:
this.survivalTime = this.time.now - this.gameStartTime;
```

### Phase 5 Test Checklist
- [ ] Walking into ghost triggers death
- [ ] Screen flashes white on death
- [ ] Camera shakes on death
- [ ] Ghosts flash red on death
- [ ] Death screen shows survival time
- [ ] Death screen shows ghost count
- [ ] Best time persists across sessions
- [ ] "NEW BEST" shows on personal record
- [ ] SPACE restarts game instantly
- [ ] Tapping anywhere also restarts (mobile)

---

## PHASE 6 — UI & Score System

### Goal
Live HUD shows time elapsed and ghost count. Clean, minimal, in-game overlay.

### `src/ui/UIManager.js`
```javascript
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
```

### Phase 6 Test Checklist
- [ ] Time counter increments every frame
- [ ] Ghost counter increments on each spawn
- [ ] "ECHO IN Xs" warning shows before first ghost
- [ ] Warning disappears after first ghost spawns
- [ ] UI renders on top of all game elements

---

## PHASE 7 — Visual Polish & Effects

### Goal
Add particle trails, ghost fade effects, death explosion, and ambient atmosphere.

### `src/effects/TrailEffect.js`
```javascript
import { CONFIG } from '../config/GameConfig.js';

export class TrailEffect {
  constructor(scene, color, alphaMultiplier = 1) {
    this.scene = scene;
    this.color = color;
    this.alphaMultiplier = alphaMultiplier;
    this.particles = scene.add.particles(0, 0, '__DEFAULT', {
      lifespan: 200,
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.4 * alphaMultiplier, end: 0 },
      blendMode: 'ADD',
      tint: color,
      quantity: 1,
      emitting: false
    });
    // Note: Phaser 3.60+ uses new particle API
    // Fallback: draw manually with graphics if particles unavailable
  }

  emit(x, y) {
    this.particles.emitParticleAt(x, y, 1);
  }

  destroy() {
    this.particles.destroy();
  }
}
```

### Manual Trail (Reliable Phaser 3 Approach)
```javascript
// In Player.js, add trail history:
this.trailHistory = [];

// In draw():
this.trailHistory.push({ x: this.x, y: this.y });
if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) {
  this.trailHistory.shift();
}

// Draw trail before core circle:
this.trailHistory.forEach((pt, i) => {
  const progress = i / this.trailHistory.length;
  const a = progress * 0.4;
  const r = this.radius * 0.5 * progress;
  this.graphics.fillStyle(CONFIG.PLAYER_COLOR, a);
  this.graphics.fillCircle(pt.x, pt.y, r);
});
```

### `src/effects/DeathEffect.js`
```javascript
import { CONFIG } from '../config/GameConfig.js';

export class DeathEffect {
  static play(scene, x, y) {
    const PARTICLE_COUNT = 20;
    const graphics = scene.add.graphics().setDepth(95);
    const particles = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const speed = Phaser.Math.Between(80, 200);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Phaser.Math.Between(2, 5),
        alpha: 1,
        color: i % 3 === 0 ? CONFIG.PLAYER_COLOR : CONFIG.GHOST_COLOR
      });
    }

    let elapsed = 0;
    const duration = 800;

    const ticker = scene.time.addEvent({
      delay: 16,
      repeat: Math.floor(duration / 16),
      callback: () => {
        elapsed += 16;
        const progress = elapsed / duration;
        graphics.clear();

        particles.forEach(p => {
          p.x += p.vx * 0.016;
          p.y += p.vy * 0.016;
          p.vy += 80 * 0.016; // gravity
          p.alpha = 1 - progress;
          graphics.fillStyle(p.color, p.alpha);
          graphics.fillCircle(p.x, p.y, p.radius * (1 - progress * 0.5));
        });

        if (progress >= 1) {
          graphics.destroy();
          ticker.destroy();
        }
      }
    });
  }
}
```

### Arena Enhancement — Grid Lines
Add subtle grid to background in `drawArena()`:
```javascript
// After arena border, add grid:
this.arenaGraphics.lineStyle(1, 0x1e3a5f, 0.3);
const gridSize = 60;
const p = CONFIG.ARENA_PADDING;
const w = CONFIG.CANVAS_WIDTH;
const h = CONFIG.CANVAS_HEIGHT;

for (let x = p + gridSize; x < w - p; x += gridSize) {
  this.arenaGraphics.beginPath();
  this.arenaGraphics.moveTo(x, p);
  this.arenaGraphics.lineTo(x, h - p);
  this.arenaGraphics.strokePath();
}
for (let y = p + gridSize; y < h - p; y += gridSize) {
  this.arenaGraphics.beginPath();
  this.arenaGraphics.moveTo(p, y);
  this.arenaGraphics.lineTo(w - p, y);
  this.arenaGraphics.strokePath();
}
```

### Phase 7 Test Checklist
- [ ] Player has visible trailing glow behind it
- [ ] Ghost trails are dimmer than player trail
- [ ] Death triggers particle explosion
- [ ] Particles are colorful (cyan + purple mix)
- [ ] Background has subtle grid lines
- [ ] Ghost spawns with a pulse ring

---

## PHASE 8 — Audio System

### Sound Generation (No Asset Files Needed — Web Audio API)

Instead of audio files, generate sounds procedurally. This means zero assets required.

### `src/systems/AudioManager.js`
```javascript
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.init();
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.enabled = false;
      console.warn('Web Audio API not available');
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Subtle movement tick (very quiet)
  playMove() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Ghost spawn — eerie ascending tone
  playGhostSpawn() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  // Death — descending crash
  playDeath() {
    if (!this.enabled || !this.ctx) return;

    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    noise.start();

    // Low descending tone
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  // Warning tone when first ghost is about to spawn
  playWarning() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(330, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }
}
```

### Phase 8 Test Checklist
- [ ] Ghost spawn plays eerie ascending tone
- [ ] Death plays crash + descending tone
- [ ] No audio errors in console
- [ ] Audio context resumes on first user interaction

---

## PHASE 9 — Advanced Features (Post-MVP)

Pick **maximum 2** to avoid scope creep. Implement only after MVP is complete and feels great.

### Option A: Reverse Ghost

A ghost that plays the recorded path **backward**.

```javascript
// In Ghost.js, add reverseMode flag:
constructor(scene, path, reverseMode = false) {
  this.reverseMode = reverseMode;
  if (reverseMode) {
    this.path = [...path].reverse(); // flip array
    // Re-normalize timestamps
    const maxT = this.path[this.path.length - 1].t;
    this.path = this.path.map((f, i) => ({
      ...f,
      t: i * CONFIG.RECORD_INTERVAL
    }));
  }
}
```

**Design note:** Spawn one reverse ghost every 3 regular ghosts. Label it differently (red tint).

### Option B: Time Warp (Player Ability)

Press `SHIFT` to slow down time (all ghosts move at 30% speed) for 2 seconds. 8-second cooldown. Visualized with screen desaturation filter.

```javascript
// In GameScene:
this.timeWarpAvailable = true;
this.timeWarpActive = false;
this.timeWarpCooldown = 8000;

this.input.keyboard.on('keydown-SHIFT', () => {
  if (this.timeWarpAvailable && !this.timeWarpActive) {
    this.activateTimeWarp();
  }
});

activateTimeWarp() {
  this.timeWarpActive = true;
  this.timeWarpAvailable = false;
  // Slow ghost update rate (pass multiplier to Ghost.update())
  this.cameras.main.setPostPipeline('GrayscalePipeline'); // if available
  
  this.time.delayedCall(2000, () => {
    this.timeWarpActive = false;
    // Start cooldown
    this.time.delayedCall(this.timeWarpCooldown, () => {
      this.timeWarpAvailable = true;
    });
  });
}
```

### Option C: Echo Trails (Ghost Leaves Danger Zones)

Ghosts leave behind temporary "echo zones" — static circular hazards that fade over 3 seconds. These punish repeated path overlap.

```javascript
// In Ghost.js:
this.lastEchoTime = 0;
this.echoInterval = 500; // every 500ms

// In update():
if (scene.time.now - this.lastEchoTime > this.echoInterval) {
  this.emitEchoZone();
  this.lastEchoTime = scene.time.now;
}

emitEchoZone() {
  const zone = this.scene.add.graphics();
  zone.fillStyle(CONFIG.GHOST_COLOR, 0.15);
  zone.fillCircle(this.x, this.y, CONFIG.GHOST_RADIUS * 2);
  this.scene.tweens.add({
    targets: zone,
    alpha: 0,
    duration: 3000,
    onComplete: () => zone.destroy()
  });
  // Register with collision system as a static hazard
}
```

---

## ART & VISUAL DESIGN SPEC

### Color Palette

| Element | Hex | Usage |
|---------|-----|-------|
| Background | `#0f172a` | Canvas + arena fill |
| Arena border | `#1e3a5f` | Thin border lines |
| Grid lines | `#1e3a5f` at 30% | Background grid |
| Player | `#00f5ff` | Cyan / electric blue |
| Player glow | `#00f5ff` at 20% | Soft outer ring |
| Ghost | `#a855f7` | Purple |
| Ghost glow | `#a855f7` at 15% | Soft outer ring |
| Danger/death | `#ff4444` | Flash, error states |
| Gold/best | `#ffd700` | Best time highlight |
| UI text | `#00f5ff` | Primary HUD |
| Dim text | `#888888` | Secondary info |

### Font Stack
```css
font-family: 'Orbitron', 'Share Tech Mono', monospace;
```
Load from Google Fonts in `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap" rel="stylesheet">
```

### Visual Hierarchy

```
Z-Order (depth):
  0  — Background / arena floor
  1  — Grid lines  
  5  — Ghost trails
  10 — Ghost entities
  20 — Player trail
  30 — Player entity
  50 — UI HUD overlay
  90 — Death screen overlay
  95 — Death effects (particles)
 100 — Screen flash
```

### Screen Layout

```
┌────────────────────────────────────────────┐
│ [TIME: 12.34]      [ECHO IN 3.2s]          │
│ [ECHOES: 2]                                │
│                                            │
│                  ARENA                     │
│           ┌─────────────────┐              │
│           │                 │              │
│           │   ◉ ghost       │              │
│           │                 │              │
│           │         ◉ player│              │
│           │                 │              │
│           └─────────────────┘              │
│                                            │
└────────────────────────────────────────────┘
```

---

## GAME FEEL SPECIFICATION

Game feel is **not optional** — it's what separates a tech demo from a game.

### Input Responsiveness
- Zero input lag: process keys in `update()`, never in `keydown` events (avoids frame delay)
- No acceleration curve in MVP — instant velocity response
- Accept both WASD and arrow keys simultaneously

### Visual Feedback Matrix

| Event | Visual Response | Duration |
|-------|----------------|----------|
| Player moves | Cyan trail | 8 frames |
| Ghost spawns | Purple pulse ring + fade in | 600ms pulse, 500ms fade |
| Ghost nears player | Ghost glow intensifies | Continuous (distance-based) |
| Player touches ghost | White screen flash + shake | 400ms flash, 300ms shake |
| Death particle burst | Cyan + purple explosion | 800ms |
| Best time beaten | Gold "NEW BEST" text | Static on death screen |

### Proximity Warning System
As player approaches a ghost (< 60px), ghost glow radius increases and a subtle warning sound plays. This gives the player a fraction of a second to react.

```javascript
// In CollisionSystem or GameScene:
const WARN_DISTANCE = 60;
ghosts.forEach(ghost => {
  const dx = player.x - ghost.x;
  const dy = player.y - ghost.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < WARN_DISTANCE) {
    const danger = 1 - (dist / WARN_DISTANCE);
    ghost.setDangerIntensity(danger); // increases glow + opacity
  }
});
```

### Frame Rate Target
- 60fps locked
- Use `delta` everywhere — never hardcode time assumptions
- Test at 30fps to ensure delta-based movement is correct

---

## TESTING STRATEGY

### Functional Tests (Manual)

| Test | Expected Result | Pass? |
|------|----------------|-------|
| Player spawns centered | Player at (400, 300) | |
| Player stays in bounds | Cannot leave arena | |
| Diagonal speed = cardinal speed | No speed boost diagonally | |
| Ghost spawns at t=5s | First ghost appears at 5 seconds | |
| Ghost follows exact path | Ghost traces player's 5s-ago route | |
| Multiple ghosts independent | Ghosts don't share paths | |
| Collision kills player | Touching ghost = death | |
| Death screen appears | Shows time + ghost count | |
| Best time persists | localStorage value survives page refresh | |
| Instant restart | SPACE restarts without loading screen | |
| 10 ghosts at 60fps | No visible slowdown | |

### Playtesting Questions

After a 5-minute playtest session, ask:

1. "When did you first feel tension?" → Should be around 20s
2. "Did you understand why you died?" → Should be "I ran into my past self"
3. "Did you want to play again immediately?" → Should be yes
4. "Was the first 10 seconds boring?" → Acceptable — it's tutorial time
5. "Did you ever feel the game cheated you?" → Should be no

### Performance Benchmarks

| Metric | Target |
|--------|--------|
| FPS with 0 ghosts | 60fps |
| FPS with 12 ghosts | >55fps |
| Memory after 5 min | <100MB |
| Restart time | <200ms |
| First input latency | <16ms (1 frame) |

---

## DEPLOYMENT GUIDE

### Local Development

```bash
# Option 1: Simple (no build step)
npx serve .
# Visit http://localhost:3000

# Option 2: Vite (recommended for dev)
npm create vite@latest echo-run -- --template vanilla
npm install
npm run dev
```

### `package.json`
```json
{
  "name": "echo-run",
  "version": "1.0.0",
  "description": "Your past is your greatest enemy.",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

### Production Build

```bash
npm run build
# Output: dist/ folder — upload this to any static host
```

### Hosting Options

| Platform | Steps | Cost |
|----------|-------|------|
| **Vercel** | `npx vercel` in project root | Free tier |
| **Netlify** | Drag `dist/` to netlify.com/drop | Free tier |
| **itch.io** | Zip `dist/`, upload as HTML game | Free |
| **GitHub Pages** | Push to `gh-pages` branch | Free |

### itch.io Setup

1. Build: `npm run build`
2. Zip the `dist/` folder
3. On itch.io: New Project → HTML → Upload zip
4. Set viewport: 800×600
5. Enable "Fullscreen button"
6. Tags: `arcade`, `survival`, `minimalist`, `browser`

---

## COMPLETE CODE REFERENCE

### Full `GameScene.js` (All Phases Combined)

```javascript
import { CONFIG } from '../config/GameConfig.js';
import { Player } from '../entities/Player.js';
import { Ghost } from '../entities/Ghost.js';
import { Recorder } from '../systems/Recorder.js';
import { GhostManager } from '../systems/GhostManager.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { UIManager } from '../ui/UIManager.js';
import { DeathEffect } from '../effects/DeathEffect.js';
import { AudioManager } from '../systems/AudioManager.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.state = 'PLAYING';
    this.survivalTime = 0;
    this.gameStartTime = this.time.now;

    // Systems
    this.audio = new AudioManager();
    this.recorder = new Recorder();

    // Arena
    this.arenaGraphics = this.add.graphics();
    this.drawArena();

    // Entities
    this.player = new Player(this);

    // Ghost management
    this.ghostManager = new GhostManager(this, this.recorder);

    // UI
    this.ui = new UIManager(this);

    // Input
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.state === 'DEAD') this.restartGame();
    });
    this.input.on('pointerdown', () => {
      this.audio.resume(); // Unlock audio context on first interaction
      if (this.state === 'DEAD') this.restartGame();
    });

    // Resume audio on first interaction
    this.input.keyboard.on('keydown', () => this.audio.resume());
  }

  drawArena() {
    const p = CONFIG.ARENA_PADDING;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;

    this.arenaGraphics.clear();
    this.arenaGraphics.fillStyle(0x0f172a, 1);
    this.arenaGraphics.fillRect(0, 0, w, h);

    // Grid
    this.arenaGraphics.lineStyle(1, 0x1e3a5f, 0.3);
    for (let x = p + 60; x < w - p; x += 60) {
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(x, p);
      this.arenaGraphics.lineTo(x, h - p);
      this.arenaGraphics.strokePath();
    }
    for (let y = p + 60; y < h - p; y += 60) {
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(p, y);
      this.arenaGraphics.lineTo(w - p, y);
      this.arenaGraphics.strokePath();
    }

    // Border
    this.arenaGraphics.lineStyle(2, 0x1e3a5f, 1);
    this.arenaGraphics.strokeRect(p, p, w - p * 2, h - p * 2);

    // Corner accents
    this.arenaGraphics.lineStyle(3, 0x00f5ff, 0.4);
    const cs = 20;
    [[p, p], [w-p, p], [p, h-p], [w-p, h-p]].forEach(([cx, cy]) => {
      const sx = cx === p ? 1 : -1;
      const sy = cy === p ? 1 : -1;
      this.arenaGraphics.beginPath();
      this.arenaGraphics.moveTo(cx + sx * cs, cy);
      this.arenaGraphics.lineTo(cx, cy);
      this.arenaGraphics.lineTo(cx, cy + sy * cs);
      this.arenaGraphics.strokePath();
    });
  }

  update(time, delta) {
    if (this.state === 'PLAYING') {
      this.survivalTime = this.time.now - this.gameStartTime;

      // Update player
      this.player.update(delta);

      // Record
      this.recorder.record(this.player.x, this.player.y);

      // Update ghosts
      this.ghostManager.update();

      // Check collision
      const hitGhost = CollisionSystem.check(
        this.player,
        this.ghostManager.getAllGhosts()
      );
      if (hitGhost) this.onDeath(hitGhost);

      // Update UI
      const timeUntilFirst = Math.max(0, CONFIG.GHOST_DELAY - this.survivalTime);
      this.ui.update(this.survivalTime, this.ghostManager.ghostCount, timeUntilFirst);
    }
  }

  onDeath(ghost) {
    if (this.state !== 'PLAYING') return;
    this.state = 'DYING';

    this.ghostManager.stop();
    this.player.kill();

    this.audio.playDeath();

    // Death effects
    DeathEffect.play(this, this.player.x, this.player.y);
    this.ghostManager.getAllGhosts().forEach(g => g.flashDanger());

    // Screen flash
    const flash = this.add.rectangle(
      CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2,
      CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT,
      0xffffff
    ).setAlpha(0.8).setDepth(100);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy()
    });

    this.cameras.main.shake(CONFIG.SCREEN_SHAKE_MS, CONFIG.SCREEN_SHAKE_INT / 1000);

    this.time.delayedCall(CONFIG.DEATH_HOLD_MS, () => {
      this.state = 'DEAD';
      this.showDeathScreen();
    });
  }

  showDeathScreen() {
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const cy = CONFIG.CANVAS_HEIGHT / 2;

    this.add.rectangle(cx, cy, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT,
      0x000000, 0.65).setDepth(90);

    this.add.text(cx, cy - 90, 'ECHO TERMINATED', {
      fontFamily: "'Orbitron', monospace", fontSize: '28px',
      color: '#ff4444', align: 'center'
    }).setOrigin(0.5).setDepth(91);

    const seconds = (this.survivalTime / 1000).toFixed(2);
    this.add.text(cx, cy - 30, `SURVIVED  ${seconds}s`, {
      fontFamily: "'Orbitron', monospace", fontSize: '20px',
      color: '#ffffff', align: 'center'
    }).setOrigin(0.5).setDepth(91);

    this.add.text(cx, cy + 15, `ECHOES SPAWNED  ${this.ghostManager.ghostCount}`, {
      fontFamily: "'Orbitron', monospace", fontSize: '14px',
      color: '#a855f7', align: 'center'
    }).setOrigin(0.5).setDepth(91);

    const prevBest = parseFloat(localStorage.getItem('echorun_best') || '0');
    if (this.survivalTime > prevBest) {
      localStorage.setItem('echorun_best', this.survivalTime.toString());
      this.add.text(cx, cy + 55, '✦ NEW BEST ✦', {
        fontFamily: "'Orbitron', monospace", fontSize: '15px',
        color: '#ffd700', align: 'center'
      }).setOrigin(0.5).setDepth(91);
    } else {
      const bestSec = (prevBest / 1000).toFixed(2);
      this.add.text(cx, cy + 55, `BEST  ${bestSec}s`, {
        fontFamily: "'Orbitron', monospace", fontSize: '14px',
        color: '#888888', align: 'center'
      }).setOrigin(0.5).setDepth(91);
    }

    const prompt = this.add.text(cx, cy + 105, 'SPACE  /  TAP TO RESTART', {
      fontFamily: "monospace", fontSize: '12px',
      color: '#00f5ff', align: 'center'
    }).setOrigin(0.5).setDepth(91);

    this.tweens.add({
      targets: prompt, alpha: 0.2, duration: 700,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  restartGame() {
    this.scene.restart();
  }
}
```

---

## FINAL PRODUCTION NOTES

### What Makes ECHO RUN Special

Most games give you enemies designed by a developer. ECHO RUN gives you **yourself** as the enemy. This is the entire game. Every other system exists to make that realization hit harder.

### The Five Non-Negotiables

1. **Zero loading on restart** — breaks the psychological loop if there's a load screen
2. **Smooth ghost interpolation** — jumpy ghosts feel like bugs, not your own movement
3. **Instant death** — delayed death reduces accountability ("did I actually touch it?")
4. **The 5-second window** — the delay between movement and ghost replay is sacred; too short = impossible, too long = no tension
5. **Your path, not random** — ghosts must perfectly replay YOUR movement, or the game loses its identity

### Tuning Guide

| Feeling | Adjustment |
|---------|-----------|
| Game too easy | Reduce `GHOST_DELAY` or `GHOST_INTERVAL` |
| Game too hard | Increase `GHOST_DELAY`, reduce `PLAYER_SPEED` |
| Ghosts feel laggy | Decrease `RECORD_INTERVAL` (more samples) |
| Performance issues | Increase `RECORD_INTERVAL`, reduce `MAX_GHOSTS` |
| First 10s too boring | Add ambient pulse effect to arena, or hint text |
| Not enough tension | Add proximity warning sounds earlier |

### Launch Version Checklist

- [ ] All 6 MVP phases complete
- [ ] 60fps on Chrome, Firefox, Safari
- [ ] Mobile touch controls work (tap to restart, no WASD needed)
- [ ] Audio unlocks on first tap/keypress
- [ ] Best time persists in localStorage
- [ ] No console errors
- [ ] `index.html` title is "ECHO RUN"
- [ ] Deployed to itch.io or Vercel
- [ ] Screenshot captured for portfolio

---

*ECHO RUN — Build Document v1.0*  
*"A small game that feels amazing."*
