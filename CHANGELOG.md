# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

## [1.4.0] - 2026-10-25

### Added

- Real score system: points per second scaled by nerve, score zones, peak bonus, milestone bonus and difficulty, plus points for near-miss combos, clash kills and milestones
- Per-difficulty top-10 leaderboards (score + time), with automatic migration of pre-1.4 saves
- Pause menu with Resume / Restart / Sound / Flashing / Main Menu buttons, full keyboard navigation and an on-screen pause button
- Auto-pause when the window loses focus or the tab is hidden
- Death screen with Restart / Main Menu buttons and a full run summary
- Touch controls: floating joystick, plus tap-to-use powerup and warp panels
- Six milestone buffs (Nerve Anchor, Warp Sprint, Clash Surge, Long Phase, Magnet, Zone Master); five milestones now (30s to 150s), each buff once per run
- Settings: sound on/off (`M`) and a reduced-flashing accessibility mode, both persisted
- Echoes are harmless for 1.5s while materialising; 1s of invulnerability after resuming from pause or a buff choice
- Decoy powerup now actually lures echoes toward it
- UI sounds, warp sounds and an "empty" cue when an action is unavailable
- Electron: F11 fullscreen, sandboxed renderer, blocked navigation/pop-ups, proper window icon
- Unit tests (Vitest) and end-to-end tests that drive the real game in headless Chrome; both run in CI

### Changed

- Phaser and fonts are bundled locally instead of loaded from CDNs, so the game (and desktop app) works offline
- Gameplay runs on its own clock: survival time, recording, warp, combos and every spawn/powerup timer freeze while paused
- Echo slots: each echo replays a distinct delay, so respawned echoes never duplicate a live echo's path
- Echoes can no longer catch up to the live player position
- Glows, vignette and arena background are pre-rendered textures; HUD text only re-renders on change (large rendering speed-up)
- Floating texts stack instead of overlapping; pickups and score zones stay clear of HUD panels
- Menu redesigned with proper buttons, difficulty descriptions and keyboard navigation
- CI runs on `main` and `dev`, on Node 24 (required by current Electron tooling)

### Fixed

- Difficulty only affected the first echo: spawn interval, path spacing and speed now follow the preset
- Clicking a difficulty button or "Clear scores" on the menu started the game
- Pausing let time, score and timers keep running, which was exploitable
- ESC during a buff choice left the panel on screen and the game running
- Audio stopped working after several restarts (a new AudioContext was created every run)
- Nerve Anchor buff had no effect; warp ring never filled with Warp Sprint
- Expired and clashed echoes leaked graphics; expired echoes doubled the spawn timer
- Powerups kept spawning on the death screen
- Death screen showed current nerve as "peak nerve"; HUD countdown kept running after death
- Restarting from the pause menu could crash when toggling sound
- Each echo could only ever trigger one near-miss


## [1.0.0] - 2026-04-04

### Added

- Initial release of ECHO RUN gameplay
- Phaser + Vite setup
- Core game systems (player, ghost replay, collision, audio, UI)
- Repository production standards (docs, templates, CI, governance files)
