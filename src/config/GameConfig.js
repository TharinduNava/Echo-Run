export const CONFIG = {
  // Arena
  CANVAS_WIDTH:       900,
  CANVAS_HEIGHT:      650,
  ARENA_PADDING:      50,

  // Player
  PLAYER_SPEED:       220,
  PLAYER_RADIUS:      10,
  PLAYER_COLOR:       0x00f5ff,

  // Ghost progression
  GHOST_DELAY:           10000,
  GHOST_INTERVAL:         9000,
  GHOST_MIN_INTERVAL:     3500,
  GHOST_GRACE_MS:         1500,
  MAX_GHOSTS:                8,
  GHOST_OVERDRIVE_COUNT:     5,
  GHOST_RADIUS:       10,
  GHOST_COLOR:        0xa855f7,
  GHOST_ALPHA:        0.7,
  GHOST_FADE_IN_MS:   600,
  GHOST_LOOP_PATH:    true,

  // Ghost difficulty tiers (applied after ghost #N)
  GHOST_TIER2_COUNT:  3,   // ghost #4+ moves 20% faster, orange tint
  GHOST_TIER3_COUNT:  6,   // ghost #7+ moves 40% faster, red tint

  // Recording
  RECORD_INTERVAL:    16,
  RECORD_WINDOW_MS:   120000,

  // Effects
  TRAIL_LENGTH:       18,
  SCREEN_SHAKE_MS:    400,
  SCREEN_SHAKE_INT:   12,
  DEATH_HOLD_MS:      700,

  // Time Warp
  TIME_WARP_DURATION:    3000,
  TIME_WARP_COOLDOWN:    10000,
  TIME_WARP_GHOST_MULT:  0.2,
  TIME_WARP_PLAYER_MULT: 0.75,

  // Powerups
  POWERUP_SPAWN_INTERVAL_MIN: 20000,  // ms between powerup appearances (min)
  POWERUP_SPAWN_INTERVAL_MAX: 35000,  // ms (max)
  POWERUP_DESPAWN_MS:         14000,  // disappears if not picked up
  POWERUP_CLASH_DURATION:      5000,  // clash mode lasts 5s or 1 kill
  POWERUP_PHASE_DURATION:      4000,  // phase (invincibility) lasts 4s
  POWERUP_ACTIVATE_KEY:       'E',

  // Score zones
  SCORE_ZONE_COUNT:   3,
  SCORE_ZONE_RADIUS:  44,
  SCORE_ZONE_MULT:    2.0,  // score multiplied while inside

  // Near-miss
  NEAR_MISS_DIST:     18,   // px — within this = near-miss

  // Nerve multiplier
  NERVE_MAX_MULT:     4.0,
  NERVE_RAMP_DIST:    55,   // start building nerve within this distance

  // Milestone survival thresholds (ms)
  MILESTONE_1:    30000,
  MILESTONE_2:    60000,
  MILESTONE_3:    90000,

  // Difficulty presets
  DIFFICULTIES: {
    easy:      { ghostDelay: 15000, ghostInterval: 12000, label: 'EASY' },
    normal:    { ghostDelay: 10000, ghostInterval:  9000, label: 'NORMAL' },
    hard:      { ghostDelay:  8000, ghostInterval:  6000, label: 'HARD' },
    nightmare: { ghostDelay:  5000, ghostInterval:  4000, label: 'NIGHTMARE' },
  },

  // Colors
  COLOR_BG:      '#060d1a',
  COLOR_ARENA:   '#0a1628',
  COLOR_CYAN:    '#00f5ff',
  COLOR_PURPLE:  '#a855f7',
  COLOR_BORDER:  '#1e3a5f',
  COLOR_WHITE:   '#ffffff',
  COLOR_DANGER:  '#ff3355',
  COLOR_GOLD:    '#ffd700',
  COLOR_WARN:    '#ff8c00',
  COLOR_WARP:    '#00ffcc',
  COLOR_CLASH:   '#ff6600',
  COLOR_PHASE:   '#00ccff',
  COLOR_ZONE:    '#ffdd00',
};
