export const CONFIG = {
  // Arena
  CANVAS_WIDTH:       900,
  CANVAS_HEIGHT:      650,
  ARENA_PADDING:      50,

  // Gameplay frame delta is clamped so a tab switch can't teleport anything
  MAX_FRAME_DELTA:    50,
  RESUME_GRACE_MS:    1000,  // invulnerability after resuming from pause / buff choice

  // Player
  PLAYER_SPEED:       220,
  PLAYER_RADIUS:      10,
  PLAYER_COLOR:       0x00f5ff,

  // Ghost progression
  GHOST_MIN_INTERVAL:     3500,
  GHOST_GRACE_MS:         1500,  // freshly spawned echoes are harmless while materializing
  GHOST_MIN_BEHIND_MS:    1500,  // echoes can never catch up to the live player position
  MAX_GHOSTS:                8,
  GHOST_OVERDRIVE_COUNT:     5,
  GHOST_RADIUS:       10,
  GHOST_COLOR:        0xa855f7,
  GHOST_ALPHA:        0.7,
  GHOST_FADE_IN_MS:   600,
  GHOST_MAX_AGE_MS:   50000,
  GHOST_EXPIRE_FADE_MS: 1200,

  // Ghost difficulty tiers (by spawn order)
  GHOST_TIER2_COUNT:  3,   // echo #4+ moves 20% faster, orange tint
  GHOST_TIER3_COUNT:  6,   // echo #7+ moves 40% faster, red tint
  GHOST_TIER2_SPEED:  1.2,
  GHOST_TIER3_SPEED:  1.4,

  // Ghost drift (subtle path deviation for unpredictability)
  GHOST_DRIFT_AMOUNT: 6,   // max px offset from recorded path

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
  WARP_NEAR_MISS_REFUND: 0.2,   // fraction of cooldown refunded per near-miss

  // Powerups
  POWERUP_SPAWN_INTERVAL_MIN: 20000,
  POWERUP_SPAWN_INTERVAL_MAX: 35000,
  POWERUP_FIRST_SPAWN_MS:     12000,
  POWERUP_DESPAWN_MS:         14000,
  POWERUP_CLASH_DURATION:      5000,
  POWERUP_PHASE_DURATION:      4000,
  POWERUP_DECOY_DURATION:      4000,
  POWERUP_PICKUP_RADIUS:         24,
  POWERUP_MAGNET_RADIUS:         60,
  POWERUP_MIN_PLAYER_DIST:      140,
  DECOY_LURE_WEIGHT:            0.75,  // how strongly echoes are pulled off-path toward a decoy

  // Score
  SCORE_PER_SEC:        10,
  NEAR_MISS_POINTS:     25,   // × combo
  CLASH_KILL_POINTS:   150,
  MILESTONE_POINTS:    500,

  // Score zones
  SCORE_ZONE_COUNT:   3,
  SCORE_ZONE_RADIUS:  44,
  SCORE_ZONE_MULT:    2.0,

  // Danger / near-miss
  WARN_DIST:          65,
  NEAR_MISS_DIST:     32,
  NEAR_MISS_COMBO_WINDOW: 4000,  // ms window for combo chain

  // Nerve multiplier
  NERVE_MAX_MULT:     4.0,
  NERVE_RAMP_DIST:    55,
  NERVE_DECAY_RATE:   0.4,   // multiplier lost per second away from echoes

  // Milestones (survival ms) — each grants a bonus and a buff choice
  MILESTONES: [
    { ms:  30000, label: 'TEMPORAL ADEPT' },
    { ms:  60000, label: 'CHRONO MASTER' },
    { ms:  90000, label: 'ECHO SOVEREIGN' },
    { ms: 120000, label: 'PARADOX WALKER' },
    { ms: 150000, label: 'TIMELESS' },
  ],

  // Buff pool offered at milestones (each can be taken once per run)
  BUFFS: [
    { key: 'nerveDecay',    label: 'NERVE ANCHOR', desc: 'Nerve decays 40% slower',   color: '#ff8c00' },
    { key: 'warpRecharge',  label: 'WARP SPRINT',  desc: 'Warp cooldown -35%',        color: '#00ffcc' },
    { key: 'clashDuration', label: 'CLASH SURGE',  desc: 'Clash lasts 3s longer',     color: '#ff6600' },
    { key: 'phaseDuration', label: 'LONG PHASE',   desc: 'Phase lasts 2s longer',     color: '#00ccff' },
    { key: 'magnet',        label: 'MAGNET',       desc: 'Grab powerups from afar',   color: '#00ff88' },
    { key: 'zoneBoost',     label: 'ZONE MASTER',  desc: 'Score zones give x3',       color: '#ffdd00' },
  ],

  // Ghost ink trail (floor trail showing where ghosts walked)
  GHOST_INK_FADE_MS:  5000,

  // Difficulty presets
  //   ghostDelay:    first echo spawn + how far behind echo #1 runs
  //   ghostInterval: spawn interval + spacing between echo paths
  //   ghostSpeed:    base echo speed multiplier
  //   scoreMult:     reward for playing harder
  DIFFICULTIES: {
    easy:      { ghostDelay: 15000, ghostInterval: 12000, ghostSpeed: 0.9,  scoreMult: 0.75, label: 'EASY' },
    normal:    { ghostDelay: 10000, ghostInterval:  9000, ghostSpeed: 1.0,  scoreMult: 1.0,  label: 'NORMAL' },
    hard:      { ghostDelay:  8000, ghostInterval:  6000, ghostSpeed: 1.05, scoreMult: 1.3,  label: 'HARD' },
    nightmare: { ghostDelay:  5000, ghostInterval:  4000, ghostSpeed: 1.15, scoreMult: 1.75, label: 'NIGHTMARE' },
  },
  DIFFICULTY_ORDER: ['easy', 'normal', 'hard', 'nightmare'],

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
  COLOR_DECOY:   '#00ff88',
  COLOR_MUTED:   '#7b94b5',
  COLOR_DIM:     '#556677',
};

export const POWERUP_INFO = {
  clash: { label: 'CLASH', icon: '[C]', color: CONFIG.COLOR_CLASH, hex: 0xff6600, hint: 'Destroy echoes on contact' },
  phase: { label: 'PHASE', icon: '[P]', color: CONFIG.COLOR_PHASE, hex: 0x00ccff, hint: 'Pass through echoes' },
  decoy: { label: 'DECOY', icon: '[D]', color: CONFIG.COLOR_DECOY, hex: 0x00ff88, hint: 'Lure echoes away' },
};
