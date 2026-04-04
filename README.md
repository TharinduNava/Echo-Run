# ECHO RUN

ECHO RUN is a browser survival game built with Phaser 3 and Vite.

## Concept

You survive inside a digital arena while ghosts replay your past movement paths.  
The longer you live, the more of your own history comes back to hunt you.

## Gameplay

- Move with `WASD` or arrow keys.
- Avoid ghost paths that mirror your previous actions.
- Use `SHIFT` to trigger **Time Warp** (temporary slow-motion effect, cooldown-based).
- Survive as long as possible and beat your best time.

## Tech Stack

- JavaScript (ES modules)
- Phaser 3 (CDN import)
- Vite

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start development server

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

### 4. Preview production build

```bash
npm run preview
```

## Project Structure

```text
src/
  config/      # game constants and balancing values
  scenes/      # boot, menu, and game scenes
  entities/    # player and ghost entities
  systems/     # recording, collision, audio, ghost management
  ui/          # HUD and UI rendering
  effects/     # visual effects
```

## Notes

- Best score is stored in browser localStorage (`echorun_best`).
- `node_modules` and build artifacts are excluded from version control via `.gitignore`.
