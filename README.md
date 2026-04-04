# ECHO RUN

[![CI](https://github.com/TharinduNava/Echo-Run/actions/workflows/ci.yml/badge.svg)](https://github.com/TharinduNava/Echo-Run/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

ECHO RUN is a fast-paced browser survival game where your previous movements become hostile ghost loops.

## Live Concept

You are trapped in a digital arena.  
Every second you survive creates a future threat: your own past path replayed by enemies.

## Controls

- Move: `WASD` or arrow keys
- Time Warp: `SHIFT`
- Restart after death: `SPACE` or click/tap

## Features

- Ghosts replay your previous routes
- Survival timer + best-score tracking in localStorage
- Time Warp ability with cooldown
- Audio feedback, collision system, and death effects

## Tech Stack

- JavaScript (ES modules)
- Phaser 3
- Vite 5

## Quick Start

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (usually `http://localhost:5173`).

## Production Build

```bash
npm run build
npm run preview
```

## Project Structure

```text
src/
  config/      # game constants and balancing values
  scenes/      # boot, menu, and gameplay scenes
  entities/    # player and ghost entities
  systems/     # recording, collision, audio, ghost management
  ui/          # HUD and interface rendering
  effects/     # visual effects
```

## Roadmap

- Add gameplay difficulty tiers
- Add pause/settings menu
- Add mobile touch controls
- Add score history UI

## Contributing

Issues and pull requests are welcome.  
Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## Author

Tharindu Hettige  
GitHub: [@TharinduNava](https://github.com/TharinduNava)

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
