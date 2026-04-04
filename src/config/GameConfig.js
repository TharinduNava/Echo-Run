export const CONFIG = {
  // Arena
  CANVAS_WIDTH:       900,
  CANVAS_HEIGHT:      650,
  ARENA_PADDING:      50,

  // Player
  PLAYER_SPEED:       220,
  PLAYER_RADIUS:      10,
  PLAYER_COLOR:       0x00f5ff,

  // Ghost — increased delays so player has time to learn
  GHOST_DELAY:        10000,     // 10s before first ghost
  GHOST_INTERVAL:     9000,      // 9s between subsequent ghosts
  GHOST_GRACE_MS:     1500,      // 1.5s invincibility after ghost spawns
  MAX_GHOSTS:         12,
  GHOST_RADIUS:       10,
  GHOST_COLOR:        0xa855f7,
  GHOST_ALPHA:        0.7,
  GHOST_FADE_IN_MS:   600,
  GHOST_LOOP_PATH:    true,

  // Recording
  RECORD_INTERVAL:    16,
  RECORD_WINDOW_MS:   120000,

  // Effects
  TRAIL_LENGTH:       12,
  SCREEN_SHAKE_MS:    350,
  SCREEN_SHAKE_INT:   10,
  DEATH_HOLD_MS:      600,

  // Colors
  COLOR_BG:           '#060d1a',
  COLOR_ARENA:        '#0a1628',
  COLOR_CYAN:         '#00f5ff',
  COLOR_PURPLE:       '#a855f7',
  COLOR_BORDER:       '#1e3a5f',
  COLOR_WHITE:        '#ffffff',
  COLOR_DANGER:       '#ff3355',
  COLOR_GOLD:         '#ffd700',
  COLOR_WARN:         '#ff8c00',
};
