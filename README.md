# ECHO RUN

[![CI](https://github.com/TharinduNava/Echo-Run/actions/workflows/ci.yml/badge.svg)](https://github.com/TharinduNava/Echo-Run/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

ECHO RUN is a fast-paced arena survival game where your own past movements come back to hunt you.

Every step you take is recorded. Seconds later an **echo** of you replays that exact path, then another,
and another. Survive as long as you can, dance close to your echoes for bonus score, and use time warp
and powerups to stay alive.

Play in the browser or download the desktop build (Windows / macOS / Linux) from
[Releases](https://github.com/TharinduNava/Echo-Run/releases).

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | `WASD` / arrow keys | Drag anywhere (floating joystick) |
| Time warp | `SHIFT` | Tap the warp panel (bottom-right) |
| Use powerup | `E` | Tap the powerup panel (bottom-left) |
| Pause / resume | `ESC` or `P` | Pause button (top-right) |
| Toggle sound | `M` | Sound button |
| Pick a buff | `1` `2` `3` | Tap a card |
| Restart / menu (paused or dead) | `R` / `SPACE` · `Q` / `ESC` | Buttons |
| Fullscreen (desktop app) | `F11` | — |

The game auto-pauses when the window loses focus or the tab is hidden.

## How it plays

- **Echoes** replay your recorded path at a fixed delay. Each new echo runs further behind, and later
  echoes move faster (orange tier, then red tier). Echoes expire after 50s and are replaced.
  A newly spawned echo is harmless while it materialises (hollow, flickering ring).
- **Score** accrues every second, multiplied by:
  - **Nerve**: builds while you stay close to echoes (up to x4).
  - **Score zones**: x2 while inside a glowing circle.
  - **Peak bonus**: x2 at max nerve inside a zone.
  - **Milestones**: x1.15 each.
  - **Difficulty**: x0.75 to x1.75.
- **Near-misses** award combo points and shave 20% off the warp cooldown.
- **Time warp** slows echoes to 20% for 3s (10s cooldown).
- **Powerups** (one held in reserve):
  - **Clash** destroys echoes you touch.
  - **Phase** lets you pass through them.
  - **Decoy** lures every echo toward a fake you.
- **Milestones** at 30s, 60s, 90s, 120s and 150s grant bonus points and a choice of buffs.
  Each of the six buffs can be taken once per run.
- **Difficulty** (Easy / Normal / Hard / Nightmare) changes echo timing, speed and the score multiplier.
  Each difficulty has its own top-10 leaderboard.

Settings (sound, reduced flashing) and leaderboards are stored locally in your browser.

## Tech stack

- JavaScript (ES modules) + [Phaser 3](https://phaser.io/), bundled with [Vite](https://vitejs.dev/)
- Procedural visuals (Phaser Graphics) and procedural audio (Web Audio API), with no asset files
- Fonts bundled via Fontsource, so the game works fully offline
- Electron + electron-builder for desktop releases
- Vitest unit tests and Playwright-driven end-to-end tests in headless Chrome

## Quick start

Requires Node.js 22.12+ (see `.nvmrc`).

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` / `npm run preview` | Production build / serve it |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests: drives the real game in headless Chrome |
| `npm run electron:start` | Build and run the desktop app |
| `npm run electron:build` | Package desktop installers into `release/` |

`test:e2e` looks for Chrome automatically. Set `CHROME_PATH` to override it, `E2E_SHOTS=dir` to save
screenshots of key screens, and `E2E_ONLY=regex` to run a subset.

In dev builds a deterministic test harness is available in the browser console as `window.T`
(see [src/dev/harness.js](src/dev/harness.js)); it is stripped from production builds.

## Project structure

```text
src/
  config/      # game constants, balancing, difficulty presets, buffs
  scenes/      # Boot (shared textures), Menu, Game (state machine)
  entities/    # player, echo (ghost), powerup pickups
  systems/     # recorder, echo spawning, powerups, score, collision, audio, settings, storage, leaderboard
  ui/          # HUD, buttons, touch controls, wave banner
  effects/     # death / clash effects
  dev/         # dev-only test harness
tests/         # unit tests
scripts/       # end-to-end test runner
electron/      # desktop app entry
```

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## Author

Tharindu Hettige
GitHub: [@TharinduNava](https://github.com/TharinduNava)

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
