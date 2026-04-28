# Echo Run — Fix All Flaws Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every identified flaw across logic bugs, UI/UX, gameplay feel, and accessibility.

**Architecture:** Fixes are grouped by subsystem and ordered critical-bugs-first. Most fixes are isolated to single files. No new systems are introduced — each task patches an existing component. Tasks build on each other only where noted.

**Tech Stack:** Phaser 3 (web), JavaScript ES6+, Web Audio API, localStorage. No test framework — verification is done by running the game in the browser and checking the fix manually.

---

## File Map

| File | Tasks |
|------|-------|
| `src/config/GameConfig.js` | T8, T27 |
| `src/entities/Player.js` | T10, T25, T26 |
| `src/entities/Ghost.js` | T4, T7, T9 |
| `src/systems/GhostManager.js` | T5, T6, T27 |
| `src/systems/PowerupManager.js` | T1, T11 |
| `src/systems/ScoreSystem.js` | — (unchanged) |
| `src/ui/UIManager.js` | T12, T13, T14, T15, T16 |
| `src/ui/WaveAnnouncer.js` | T22 |
| `src/scenes/GameScene.js` | T1, T2, T3, T12, T17, T18, T23, T24 |
| `src/scenes/MenuScene.js` | T19, T20, T21 |
| `src/main.js` | T28 |

---

## Task 1: Fix CONFIG mutation — POWERUP_CLASH_DURATION

**Files:**
- Modify: `src/systems/PowerupManager.js`
- Modify: `src/scenes/GameScene.js`

`GameScene._applyImmediateBuff` sets `CONFIG.POWERUP_CLASH_DURATION = 8000`, permanently mutating the shared module-level object. On `scene.restart()` the module is not re-imported, so the config stays at 8000 for all future runs in the session.

Fix: Store the override as an instance property on PowerupManager.

- [ ] **Step 1: Add override field to PowerupManager constructor**

In `src/systems/PowerupManager.js`, add after `this.active = false;`:
```js
this._clashDurationOverride = null;
```

- [ ] **Step 2: Add setter method to PowerupManager**

Add after the constructor closing brace:
```js
setClashDurationOverride(ms) { this._clashDurationOverride = ms; }
```

- [ ] **Step 3: Use override in _activateClash**

In `_activateClash`, change:
```js
this._heldTimer = this.scene.time.delayedCall(CONFIG.POWERUP_CLASH_DURATION, () => {
```
to:
```js
const clashDur = this._clashDurationOverride ?? CONFIG.POWERUP_CLASH_DURATION;
this._heldTimer = this.scene.time.delayedCall(clashDur, () => {
```

- [ ] **Step 4: Use override in activeProgress getter**

In `get activeProgress()`, change:
```js
if (this._clashActive) dur = CONFIG.POWERUP_CLASH_DURATION;
```
to:
```js
if (this._clashActive) dur = this._clashDurationOverride ?? CONFIG.POWERUP_CLASH_DURATION;
```

- [ ] **Step 5: Fix GameScene._applyImmediateBuff to use the setter**

In `src/scenes/GameScene.js`, change `_applyImmediateBuff`:
```js
_applyImmediateBuff(buff) {
  if (buff === 'clashDuration') {
    this.powerupManager.setClashDurationOverride(8000);
  }
  // nerveDecay and warpRecharge are applied in update() / activateTimeWarp()
}
```

- [ ] **Step 6: Verify**

Run game. Pick up a Clash powerup before reaching any milestone. Activate it. Verify it lasts 5s. Then survive to 30s, pick Clash Surge buff, pick up Clash again — verify it now lasts 8s. Restart from death screen and verify clash is back to 5s.

- [ ] **Step 7: Commit**
```bash
git add src/systems/PowerupManager.js src/scenes/GameScene.js
git commit -m "fix: stop CONFIG mutation for clash duration — store override on PowerupManager instance"
```

---

## Task 2: Fix key listener stacking in _showBuffChoice

**Files:**
- Modify: `src/scenes/GameScene.js`

`_showBuffChoice` calls `this.input.keyboard.addKey('ONE').on('down', ...)` each time it's shown. If the player somehow triggers it multiple times, or if the scene restarts with listeners still attached, they stack and fire multiple times per keypress.

- [ ] **Step 1: Switch to keyboard.once() pattern for buff choice**

In `_showBuffChoice`, replace the entire `keyListeners` block with once-listeners that auto-remove:
```js
const onKey = (buffKey) => {
  // Remove all key listeners before acting
  this.input.keyboard.off('keydown-ONE',   onOne);
  this.input.keyboard.off('keydown-TWO',   onTwo);
  this.input.keyboard.off('keydown-THREE', onThree);
  this.input.keyboard.off('keydown-NUMPAD_ONE',   onOne);
  this.input.keyboard.off('keydown-NUMPAD_TWO',   onTwo);
  this.input.keyboard.off('keydown-NUMPAD_THREE', onThree);
  cleanup(buffKey);
};
const onOne   = () => onKey(buffs[0].key);
const onTwo   = () => onKey(buffs[1].key);
const onThree = () => onKey(buffs[2].key);

this.input.keyboard.on('keydown-ONE',          onOne);
this.input.keyboard.on('keydown-TWO',          onTwo);
this.input.keyboard.on('keydown-THREE',        onThree);
this.input.keyboard.on('keydown-NUMPAD_ONE',   onOne);
this.input.keyboard.on('keydown-NUMPAD_TWO',   onTwo);
this.input.keyboard.on('keydown-NUMPAD_THREE', onThree);
```

- [ ] **Step 2: Update cleanup to also call the onKey removal**

Since `cleanup` is called inside `onKey` after removal, the old `keyListeners.forEach(k => k.destroy())` line must be removed from `cleanup`. Remove that line entirely from the `cleanup` function body — the `onKey` wrapper handles removal before calling `cleanup`.

- [ ] **Step 3: Verify**

Run game to 30s milestone. When buff choice appears, press `1`. Verify it only fires once. Run to 60s milestone (second choice) — verify no double-fires.

- [ ] **Step 4: Commit**
```bash
git add src/scenes/GameScene.js
git commit -m "fix: prevent key listener stacking in buff choice — remove before re-adding"
```

---

## Task 3: Fix warp cooldown progress overflow

**Files:**
- Modify: `src/scenes/GameScene.js`

The near-miss warp recharge code on line 597 does:
```js
this._warpCooldownStart = this.time.now - elapsed - CONFIG.TIME_WARP_COOLDOWN * 0.2;
```
If `elapsed` is large (e.g. 9s into a 10s cooldown), this can push `_warpCooldownStart` more than `TIME_WARP_COOLDOWN` ms into the past, making `warpProgress > 1.0`. The warp ring then overfills.

- [ ] **Step 1: Clamp the recharge adjustment**

In `src/scenes/GameScene.js`, find the near-miss warp recharge block and replace:
```js
this._warpCooldownStart = this.time.now - elapsed - CONFIG.TIME_WARP_COOLDOWN * 0.2;
```
with:
```js
const newElapsed = elapsed + CONFIG.TIME_WARP_COOLDOWN * 0.2;
this._warpCooldownStart = this.time.now - Math.min(newElapsed, CONFIG.TIME_WARP_COOLDOWN);
```

- [ ] **Step 2: Verify**

Run game. Use warp. Wait until cooldown is at ~90%. Dodge a ghost closely to trigger recharge. Verify the ring fills to at most 100% and does not visually overshoot. If the ring was at 90% and gets a 20% boost it should immediately show 100% and the warp becomes available right away.

- [ ] **Step 3: Commit**
```bash
git add src/scenes/GameScene.js
git commit -m "fix: clamp warp recharge boost so cooldown progress never exceeds 1.0"
```

---

## Task 4: Move ghost trail update out of draw()

**Files:**
- Modify: `src/entities/Ghost.js`

`draw()` pushes to `trailHistory` on every call. If `draw()` is called outside `update()` (e.g. directly from a debug call or during the fade-in before the first update tick), the trail accumulates extra entries and corrupts.

- [ ] **Step 1: Move trail push/shift to update()**

In `src/entities/Ghost.js`, find `draw()` and locate:
```js
this.trailHistory.push({ x: this.x, y: this.y });
if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) this.trailHistory.shift();
```
Delete these two lines from `draw()`.

- [ ] **Step 2: Add them to update() after position is set**

In `update()`, after the line that sets `this.x` and `this.y` (after the clamp lines), add:
```js
this.trailHistory.push({ x: this.x, y: this.y });
if (this.trailHistory.length > CONFIG.TRAIL_LENGTH) this.trailHistory.shift();
```

- [ ] **Step 3: Verify**

Run game, observe ghost trails. Confirm they still render correctly and don't stutter or grow unusually.

- [ ] **Step 4: Commit**
```bash
git add src/entities/Ghost.js
git commit -m "fix: move ghost trail history update from draw() to update() to prevent corruption"
```

---

## Task 5: Fix killGhost array mutation during iteration

**Files:**
- Modify: `src/systems/GhostManager.js`

`getAllGhosts()` returns the live `this.ghosts` array reference. `GameScene.update()` iterates this array in a `forEach`, then calls `CollisionSystem.check()` which may call `killGhost()`, which splices from the same array mid-iteration. This can cause skipped ghosts.

- [ ] **Step 1: Return a snapshot from getAllGhosts()**

In `src/systems/GhostManager.js`, change:
```js
getAllGhosts()  { return this.ghosts; }
```
to:
```js
getAllGhosts()  { return [...this.ghosts]; }
```

- [ ] **Step 2: Verify**

Run game. Collect a Clash powerup. Activate it. Kill multiple ghosts rapidly with E. Verify no console errors and ghost count decrements correctly.

- [ ] **Step 3: Commit**
```bash
git add src/systems/GhostManager.js
git commit -m "fix: getAllGhosts() returns a snapshot to prevent splice-during-iteration bugs"
```

---

## Task 6: Fix ink trail sampling rate dependence on frame rate

**Files:**
- Modify: `src/entities/Ghost.js`
- Modify: `src/systems/GhostManager.js`

`now % 80 < delta` produces ~2× more ink marks at 144Hz than at 60Hz.

- [ ] **Step 1: Add _inkTimer to Ghost constructor**

In `src/entities/Ghost.js`, add to the constructor after the other timer/state fields:
```js
this._inkTimer = 0;
```

- [ ] **Step 2: Replace sampling condition in GhostManager.update()**

In `src/systems/GhostManager.js`, inside `update()`, replace:
```js
if (now % 80 < delta) this._recordInk(g);
```
with:
```js
g._inkTimer = (g._inkTimer || 0) + delta;
if (g._inkTimer >= 80) { this._recordInk(g); g._inkTimer -= 80; }
```

- [ ] **Step 3: Verify**

Run game at whatever frame rate your monitor runs. Observe ink trail marks on the arena floor — they should appear as evenly spaced dots independent of frame rate.

- [ ] **Step 4: Commit**
```bash
git add src/entities/Ghost.js src/systems/GhostManager.js
git commit -m "fix: ink trail sampling uses accumulator instead of frame-rate-dependent modulo"
```

---

## Task 7: Smooth ghost eye flicker

**Files:**
- Modify: `src/entities/Ghost.js`

`this._eyeFlicker = Math.random()` every frame creates harsh binary noise in the ghost's eye rendering.

- [ ] **Step 1: Replace assignment with lerp**

In `src/entities/Ghost.js`, in `update()`, change:
```js
this._eyeFlicker  = Math.random();
```
to:
```js
this._eyeFlicker += (Math.random() - this._eyeFlicker) * 0.12;
```

- [ ] **Step 2: Verify**

Run game. Observe ghost eyes — they should flicker organically rather than snapping to random values every frame.

- [ ] **Step 3: Commit**
```bash
git add src/entities/Ghost.js
git commit -m "fix: smooth ghost eye flicker with lerp instead of per-frame Math.random()"
```

---

## Task 8: Fix near-miss distance (smaller than collision radius)

**Files:**
- Modify: `src/config/GameConfig.js`

`NEAR_MISS_DIST: 18` but the actual collision radius is `PLAYER_RADIUS(10) + GHOST_RADIUS(10) = 20`. The near-miss detection window (`18px`) is entirely inside the kill zone (`20px`), making intentional near-misses nearly impossible to score.

- [ ] **Step 1: Increase NEAR_MISS_DIST**

In `src/config/GameConfig.js`, change:
```js
NEAR_MISS_DIST:     18,
```
to:
```js
NEAR_MISS_DIST:     32,
```
This creates a 12px band outside the collision radius where near-misses register.

- [ ] **Step 2: Verify**

Run game. Deliberately graze ghosts. You should now see `CLOSE CALL` text trigger when passing close but not dying. It should NOT trigger from far away.

- [ ] **Step 3: Commit**
```bash
git add src/config/GameConfig.js
git commit -m "fix: near-miss distance increased to 32px so it extends beyond the 20px kill radius"
```

---

## Task 9: Reduce ghost drift during close encounters

**Files:**
- Modify: `src/entities/Ghost.js`

`GHOST_DRIFT_AMOUNT: 6` applies up to 6px of random offset. This is normally fine for unpredictability but causes unfair deaths when the ghost is very close — the player may have correctly avoided the recorded path but drift brings the ghost into contact.

- [ ] **Step 1: Scale drift by inverse danger intensity**

In `src/entities/Ghost.js`, in `update()`, find the lines that set `this.x` and `this.y`:
```js
this.x = Phaser.Math.Linear(curr.x, next.x, lerpT) + this._driftX;
this.y = Phaser.Math.Linear(curr.y, next.y, lerpT) + this._driftY;
```
Replace with:
```js
const driftScale = 1 - this._dangerIntensity * 0.85;
this.x = Phaser.Math.Linear(curr.x, next.x, lerpT) + this._driftX * driftScale;
this.y = Phaser.Math.Linear(curr.y, next.y, lerpT) + this._driftY * driftScale;
```

- [ ] **Step 2: Verify**

Run game. When a ghost is close (border turns red), it should track the exact recorded path. When far away, it should still show subtle drift/unpredictability.

- [ ] **Step 3: Commit**
```bash
git add src/entities/Ghost.js
git commit -m "fix: ghost drift scales to zero near the player to prevent unfair close-range hits"
```

---

## Task 10: Stop dead player from pushing trail history

**Files:**
- Modify: `src/entities/Player.js`

After `kill()`, the player graphics are hidden but `draw()` can still be called externally (e.g. if GameScene calls it before checking `this.player.alive`). The `trailHistory.push` inside `draw()` will keep adding entries even when dead.

- [ ] **Step 1: Guard draw() with alive check**

In `src/entities/Player.js`, at the very top of `draw()`, before any `this.graphics.clear()` call, add:
```js
if (!this.alive) return;
```

- [ ] **Step 2: Verify**

Run game. Die. The player disappears. No residual trail draws happen. Then restart — player should have a clean trail from the new spawn position.

- [ ] **Step 3: Commit**
```bash
git add src/entities/Player.js
git commit -m "fix: Player.draw() early-returns when dead to stop trail history pollution"
```

---

## Task 11: Fix powerup replacement — allow overwrite when holding one

**Files:**
- Modify: `src/systems/PowerupManager.js`

Currently if the player walks over a powerup while holding one, the pickup is silently ignored (`&& this._held === null` guard). There's no feedback and the behavior is confusing.

- [ ] **Step 1: Allow pickup to overwrite held powerup**

In `src/systems/PowerupManager.js`, in `update()`, change:
```js
if (this._current.overlaps(playerX, playerY) && this._held === null) {
```
to:
```js
if (this._current.overlaps(playerX, playerY) && !this.active) {
```
This allows picking up a new powerup as long as none is currently *active* (being used). A held-but-unused powerup is replaced.

- [ ] **Step 2: Verify**

Run game. Pick up a Clash powerup. Without activating it, walk over a Phase powerup. The HUD should update to show Phase. Verify the original Clash is gone. Now verify that walking over a powerup *while* one is actively running (after pressing E) does not interrupt it — the `!this.active` guard prevents that.

- [ ] **Step 3: Commit**
```bash
git add src/systems/PowerupManager.js
git commit -m "fix: allow powerup replacement when holding but not actively using one"
```

---

## Task 12: Add live score multiplier display to HUD

**Files:**
- Modify: `src/ui/UIManager.js`
- Modify: `src/scenes/GameScene.js`

The score multiplier (nerve × zone × survival bonus) is computed every frame by `ScoreSystem.update()` and returned, but never shown to the player. The entire scoring system is invisible.

- [ ] **Step 1: Extend the top-left panel height**

In `src/ui/UIManager.js`, in the constructor, change:
```js
this._drawPanel(this._panelTL, p + 4, p + 4, 150, 52);
```
to:
```js
this._drawPanel(this._panelTL, p + 4, p + 4, 150, 70);
```

- [ ] **Step 2: Add score text object**

After `this.ghostText = ...` in the constructor, add:
```js
this.scoreText = scene.add.text(p + 14, p + 50, 'SCORE ×1.0', {
  fontFamily: 'Orbitron, monospace', fontSize: '10px', color: CONFIG.COLOR_GOLD
}).setDepth(50);
```

- [ ] **Step 3: Add scoreMult parameter to update()**

Change the `update()` signature from:
```js
update(survivalMs, ghostCount, timeUntilNextSpawnMs, nextGhostNumber, isOverdrive,
       timeWarpAvailable, timeWarpActive, warpCooldownProgress,
       nerveMultiplier = 1.0, heldPowerup = null, powerupActive = false, powerupProgress = 0)
```
to:
```js
update(survivalMs, ghostCount, timeUntilNextSpawnMs, nextGhostNumber, isOverdrive,
       timeWarpAvailable, timeWarpActive, warpCooldownProgress,
       nerveMultiplier = 1.0, heldPowerup = null, powerupActive = false, powerupProgress = 0,
       scoreMult = 1.0)
```

- [ ] **Step 4: Update the score text in update()**

After the nerve multiplier block in `update()`, add:
```js
// ── Score multiplier ──────────────────────────────────
this.scoreText.setText(`SCORE ×${scoreMult.toFixed(1)}`);
const scoreAlpha = scoreMult > 1.05 ? 1 : 0.35;
this.scoreText.setAlpha(scoreAlpha);
```

- [ ] **Step 5: Add scoreText to destroy()**

In `destroy()`, add `this.scoreText` to the array:
```js
[this.timeText, this.ghostText, this.scoreText, ...
```

- [ ] **Step 6: Pass scoreMult from GameScene**

In `src/scenes/GameScene.js`, find the `this.scoreSystem.update(...)` call and capture its return value. It currently is called on its own line. Change:
```js
this.scoreSystem.update(this.player.x, this.player.y, ghostsNow, delta);
```
to:
```js
const scoreMult = this.scoreSystem.update(this.player.x, this.player.y, ghostsNow, delta);
```

Then at the bottom of `update()`, pass `scoreMult` to `uiManager.update()`:
```js
this.uiManager.update(
  this.survivalTime, this.ghostManager.ghostCount,
  this.ghostManager.getTimeUntilNextSpawn(), this.ghostManager.nextGhostNumber,
  this.ghostManager.isOverdrive,
  this.timeWarpAvailable, this.timeWarpActive, warpProgress,
  this.scoreSystem.nerveMultiplier, pwType, pwActive, pwProg,
  scoreMult
);
```

- [ ] **Step 7: Verify**

Run game. The top-left HUD should now show `SCORE ×1.0` dimmed, brightening to gold when multiplier exceeds 1. Enter a score zone while near a ghost to see it spike toward `×8`.

- [ ] **Step 8: Commit**
```bash
git add src/ui/UIManager.js src/scenes/GameScene.js
git commit -m "feat: add live score multiplier display to HUD top-left panel"
```

---

## Task 13: Replace emoji powerup icons with text icons

**Files:**
- Modify: `src/ui/UIManager.js`

Emoji (`💀`, `🛡`, `👁`) render inconsistently across OS and look out of place in the neon aesthetic.

- [ ] **Step 1: Replace iconMap**

In `src/ui/UIManager.js`, in `update()`, change:
```js
const iconMap  = { clash: '💀 CLASH', phase: '🛡 PHASE', decoy: '👁 DECOY' };
```
to:
```js
const iconMap  = { clash: '[C] CLASH', phase: '[P] PHASE', decoy: '[D] DECOY' };
```

- [ ] **Step 2: Verify**

Run game. Pick up each powerup type. The HUD should show `[C] CLASH`, `[P] PHASE`, `[D] DECOY` with their respective colors and no emoji.

- [ ] **Step 3: Commit**
```bash
git add src/ui/UIManager.js
git commit -m "fix: replace emoji powerup icons with cross-platform text icons"
```

---

## Task 14: Fix warp ring size and label clarity

**Files:**
- Modify: `src/ui/UIManager.js`

The warp ring has a radius of 16px. When on cooldown it shows `73%` text inside the ring at 11px — unreadable at that size.

- [ ] **Step 1: Increase ring radius**

In the UIManager constructor, change:
```js
this._warpRX = wx - 18; this._warpRY = wy - 22; this._warpRad = 16;
```
to:
```js
this._warpRX = wx - 20; this._warpRY = wy - 22; this._warpRad = 20;
```

- [ ] **Step 2: Widen the bottom-right panel to fit**

Change:
```js
this._drawPanel(this._panelBR, wx - 120, wy - 44, 128, 50);
```
to:
```js
this._drawPanel(this._panelBR, wx - 124, wy - 48, 132, 54);
```

- [ ] **Step 3: Verify**

Run game. Use warp and let it go on cooldown. The ring should be noticeably larger. The `73%` text appears in `warpStatusText` below the ring (this is already the case), not crammed inside the ring circle.

- [ ] **Step 4: Commit**
```bash
git add src/ui/UIManager.js
git commit -m "fix: increase warp ring radius from 16 to 20 for readability"
```

---

## Task 15: Add nerve bar label and sub-label

**Files:**
- Modify: `src/ui/UIManager.js`

New players have no idea what "NERVE" means or what the bar measures.

- [ ] **Step 1: Add a proximity sublabel text object**

In the UIManager constructor, after `this.nerveBar = ...`, add:
```js
this.nerveSubLabel = scene.add.text(trX - 70, p + 44, 'PROXIMITY BONUS', {
  fontFamily: 'Share Tech Mono, monospace', fontSize: '7px', color: '#334455', align: 'center'
}).setOrigin(0.5).setDepth(50);
```

- [ ] **Step 2: Show/hide based on nerve state**

In `update()`, after the nerve block, add:
```js
this.nerveSubLabel.setAlpha(nerveMultiplier <= 1.05 ? 0.7 : 0);
```

- [ ] **Step 3: Add nerveSubLabel to destroy()**

In `destroy()`, add `this.nerveSubLabel` to the array.

- [ ] **Step 4: Verify**

Run game. Top-right panel should show `PROXIMITY BONUS` in tiny muted text when nerve is at baseline. It disappears once you start building nerve.

- [ ] **Step 5: Commit**
```bash
git add src/ui/UIManager.js
git commit -m "fix: add 'PROXIMITY BONUS' sublabel to nerve bar so new players understand it"
```

---

## Task 16: Fix echo countdown alpha fighting with tween system

**Files:**
- Modify: `src/ui/UIManager.js`

The echo countdown calls `setAlpha(pulse)` every frame where `pulse = 0.7 + 0.3 * Math.sin(now / 200)`. But the text was also faded in from alpha 0 via a `_fade()` tween on creation. The ongoing `setAlpha` fights the tween.

- [ ] **Step 1: Remove alpha pulsing from echo countdown**

In `update()`, find the echo countdown block. Change:
```js
this.echoCountdownText.setText(`ECHO #${nextGhostNumber} IN ${(timeUntilNextSpawnMs / 1000).toFixed(1)}s`).setColor(col).setAlpha(pulse);
```
to:
```js
this.echoCountdownText.setText(`ECHO #${nextGhostNumber} IN ${(timeUntilNextSpawnMs / 1000).toFixed(1)}s`).setColor(col).setAlpha(1);
```

Also remove the `const pulse = ...` line above it.

- [ ] **Step 2: Pulse via color instead**

When under 3s, alternate between `#ff3355` and `#ff8c00` using time-based color switch instead of alpha:
```js
const col = timeUntilNextSpawnMs < 3000
  ? (Math.floor(this.scene.time.now / 250) % 2 === 0 ? '#ff3355' : '#ff8c00')
  : '#ff8c00';
```

- [ ] **Step 3: Verify**

Run game. Observe echo countdown. It should be solid and readable. Under 3 seconds it should flash between red and orange via color, not flicker via alpha.

- [ ] **Step 4: Commit**
```bash
git add src/ui/UIManager.js
git commit -m "fix: echo countdown uses color pulsing instead of alpha to avoid tween conflict"
```

---

## Task 17: Fix death screen stat spacing and add difficulty label

**Files:**
- Modify: `src/scenes/GameScene.js`

6 stat lines at 38px spacing starts at `cy - 100` and reaches `cy + 90` — fits in the 400px panel but is visually cramped. Also the death screen shows no indication of which difficulty was played.

- [ ] **Step 1: Tighten stat spacing and add difficulty line**

In `_showDeathScreen()`, change the `stats` array and rendering:

Replace the existing `stats` array with:
```js
const stats = [
  { t: `SURVIVED: ${(this.survivalTime / 1000).toFixed(2)}s`, c: '#ffffff',  s: '20px' },
  { t: `ECHOES: ${this.ghostManager.ghostCount}  |  RANK #${rank} / 10`,     c: '#a855f7', s: '14px' },
  { t: isNew ? '✦  NEW BEST  ✦' : `BEST: ${(best / 1000).toFixed(2)}s`,     c: isNew ? '#ffd700' : '#556677', s: '13px' },
  { t: `NEAR-MISSES: ${this.scoreSystem.stats.nearMisses}  ${comboText}`,    c: '#ff8c00', s: '12px' },
  { t: `WARP USED: ${this.scoreSystem.stats.warpUses}  |  CLASHES: ${this.scoreSystem.stats.clashKills}`, c: '#00f5ff', s: '12px' },
  { t: `NERVE PEAK: ×${this.scoreSystem.nerveMultiplier.toFixed(1)}  |  POWERUPS: ${this.scoreSystem.stats.powerupsCollected}`, c: '#aabbcc', s: '12px' },
  { t: this._difficulty.toUpperCase(), c: '#334455', s: '10px' },
];
```

Change the rendering loop from step 38 to step 30, and start 10px higher:
```js
stats.forEach(({ t, c, s }, i) => {
  const el = this.add.text(cx, cy - 105 + i * 30, t, {
    fontFamily: 'Share Tech Mono, monospace', fontSize: s, color: c, align: 'center'
  }).setOrigin(0.5).setDepth(95).setAlpha(0);
  this.time.delayedCall(400 + i * 120, () => {
    this.tweens.add({ targets: el, alpha: 1, y: { from: cy - 85 + i * 30, to: cy - 105 + i * 30 }, duration: 260, ease: 'Back.easeOut' });
  });
});
```

- [ ] **Step 2: Move restart prompt up slightly**

Change:
```js
const prompt = this.add.text(cx, cy + 175, 'SPACE  /  TAP TO RESTART', ...
```
to:
```js
const prompt = this.add.text(cx, cy + 160, 'SPACE  /  TAP TO RESTART', ...
```

- [ ] **Step 3: Verify**

Die in Normal mode. Death screen should show 7 stat lines with readable spacing, and `NORMAL` label at the bottom in muted color. Nothing overflows the panel.

- [ ] **Step 4: Commit**
```bash
git add src/scenes/GameScene.js
git commit -m "fix: death screen tighter stat spacing and adds difficulty label"
```

---

## Task 18: Fix buff choice panel — bigger targets and readable fonts

**Files:**
- Modify: `src/scenes/GameScene.js`

Buff cards are 110×90px with 10px label and 9px description. Targets are too small and text is too small to read in a tense game moment.

- [ ] **Step 1: Expand panel and card dimensions**

In `_showBuffChoice()`, change the panel rect:
```js
panel.fillRoundedRect(cx - 220, cy - 120, 440, 240, 14);
panel.strokeRoundedRect(cx - 220, cy - 120, 440, 240, 14);
```
to:
```js
panel.fillRoundedRect(cx - 240, cy - 130, 480, 270, 14);
panel.strokeRoundedRect(cx - 240, cy - 130, 480, 270, 14);
```

- [ ] **Step 2: Change card layout to be taller with larger spacing**

Change the card loop. The cards are positioned at `cx - 130 + i * 130`. Update to `cx - 150 + i * 150` for more spacing. Card size from 110×90 to 130×110:
```js
buffs.forEach((b, i) => {
  const bx = cx - 150 + i * 150;
  const by = cy - 10;
  const bg = this.add.graphics().setDepth(202);
  bg.fillStyle(0x111111, 0.9);
  bg.fillRoundedRect(bx - 60, by - 50, 120, 110, 8);
  bg.lineStyle(2, Phaser.Display.Color.HexStringToColor(b.color).color, 0.7);
  bg.strokeRoundedRect(bx - 60, by - 50, 120, 110, 8);
  group.push(bg);

  const numT = this.add.text(bx, by - 32, `[${i + 1}]`, {
    fontFamily: 'Orbitron, monospace', fontSize: '13px', color: b.color
  }).setOrigin(0.5).setDepth(203);
  const lbl  = this.add.text(bx, by,     b.label, {
    fontFamily: 'Orbitron, monospace', fontSize: '13px', color: b.color
  }).setOrigin(0.5).setDepth(203);
  const dsc  = this.add.text(bx, by + 26, b.desc, {
    fontFamily: 'Share Tech Mono, monospace', fontSize: '11px', color: '#aabbcc',
    align: 'center', wordWrap: { width: 110 }
  }).setOrigin(0.5).setDepth(203);
  group.push(numT, lbl, dsc);
});
```

- [ ] **Step 3: Update title position to match new panel**

Change:
```js
const title = this.add.text(cx, cy - 98, 'CHOOSE YOUR BUFF', ...
```
to:
```js
const title = this.add.text(cx, cy - 112, 'CHOOSE YOUR BUFF', ...
```

- [ ] **Step 4: Verify**

Run to 30s. Buff choice panel should be noticeably larger. Cards should have clear readable labels and descriptions. Numbers `[1]`, `[2]`, `[3]` should be in the buff's own color.

- [ ] **Step 5: Commit**
```bash
git add src/scenes/GameScene.js
git commit -m "fix: buff choice panel enlarged, fonts increased to 13/11px for readability"
```

---

## Task 19: Fix menu leaderboard invisible text colors

**Files:**
- Modify: `src/scenes/MenuScene.js`

Colors `#445566` and `#223344` for ranks 6–10 are nearly invisible on the `#030912` background.

- [ ] **Step 1: Brighten rank colors**

In `MenuScene.create()`, find the leaderboard color assignments and replace:
```js
const col = i === 0 ? CONFIG.COLOR_GOLD : i < 3 ? CONFIG.COLOR_CYAN : i < 5 ? '#667788' : '#445566';
const col2 = i === 0 ? '#aaaa00' : i < 3 ? '#007799' : i < 5 ? '#334455' : '#111122';
const col3 = i === 0 ? '#888800' : i < 3 ? '#005566' : i < 5 ? '#223344' : '#111122';
```
with:
```js
const col = i === 0 ? CONFIG.COLOR_GOLD : i < 3 ? CONFIG.COLOR_CYAN : i < 5 ? '#8899bb' : '#667788';
```
Remove `col2` and `col3` entirely (they are never used in any text call — the text only uses `col`).

- [ ] **Step 2: Add a leaderboard clear button**

After the leaderboard entries are drawn, add:
```js
const clearBtn = this.add.text(cx, lbY + 14 + Math.min(shown.length, 5) * 15 + 10,
  'CLEAR SCORES', {
    fontFamily: 'Share Tech Mono, monospace', fontSize: '9px', color: '#334455'
  }
).setOrigin(0.5).setDepth(10).setAlpha(0).setInteractive({ useHandCursor: true });
clearBtn.on('pointerover', () => clearBtn.setColor('#667788'));
clearBtn.on('pointerout',  () => clearBtn.setColor('#334455'));
clearBtn.on('pointerdown', () => {
  localStorage.removeItem('echorun_lb');
  localStorage.removeItem('echorun_best');
  this.scene.restart();
});
this._fade(clearBtn, 1800);
```

- [ ] **Step 3: Verify**

Open menu with 10 leaderboard entries. All ranks 1–10 should be readable. Rank 1 = gold, 2–3 = cyan, 4–5 = medium blue-grey, 6–10 = dimmer but visible grey-blue. The CLEAR SCORES link should appear below.

- [ ] **Step 4: Commit**
```bash
git add src/scenes/MenuScene.js
git commit -m "fix: leaderboard colors brightened for ranks 6-10 and clear button added"
```

---

## Task 20: Fix difficulty button active indicator

**Files:**
- Modify: `src/scenes/MenuScene.js`

Selected difficulty only changes text color — no shape or border indicator. Hard to tell which is selected at a glance.

- [ ] **Step 1: Store button position data alongside text**

Change `_diffTexts` to store objects with position. Replace the `_diffTexts[d] = btn` line with:
```js
this._diffTexts[d] = { text: btn, bx, by };
```

- [ ] **Step 2: Update _setDifficulty to redraw the border**

In `_setDifficulty()`, after the color update loop, add a redraw of `_diffGfx`:
```js
this._diffGfx.clear();
const active = this._diffTexts[d];
if (active) {
  this._diffGfx.lineStyle(1.5, CONFIG.COLOR_CYAN, 0.8);
  this._diffGfx.strokeRoundedRect(active.bx - 38, active.by - 10, 76, 22, 4);
  this._diffGfx.fillStyle(CONFIG.COLOR_CYAN, 0.06);
  this._diffGfx.fillRoundedRect(active.bx - 38, active.by - 10, 76, 22, 4);
}
```

- [ ] **Step 3: Update pointerover/pointerout to use .text property**

Change:
```js
btn.on('pointerover', () => { if (d !== this._difficulty) btn.setColor('#a8bddd'); });
btn.on('pointerout',  () => { btn.setColor(d === this._difficulty ? CONFIG.COLOR_CYAN : '#7b94b5'); });
btn.on('pointerdown', () => { this._setDifficulty(d); });
```
These still work as-is since `btn` is still the Phaser text object.

- [ ] **Step 4: Draw initial border on create**

After the difficulty button loop, call `_setDifficulty(this._difficulty)` to draw the border on the initially selected difficulty:
```js
this._setDifficulty(this._difficulty);
```

- [ ] **Step 5: Verify**

Open menu. The currently selected difficulty should have a cyan border box around it. Clicking another difficulty moves the border.

- [ ] **Step 6: Commit**
```bash
git add src/scenes/MenuScene.js
git commit -m "fix: difficulty selector shows active border around selected option"
```

---

## Task 21: Fix controls hint readability on menu

**Files:**
- Modify: `src/scenes/MenuScene.js`

Controls are one long line at 10px — barely readable, no structure.

- [ ] **Step 1: Split into two labelled lines**

Replace the single controls text:
```js
this._fade(this.add.text(cx, cy + 56, 'WASD/ARROWS — MOVE   SHIFT — WARP   E — POWERUP   ESC — PAUSE', {
  fontFamily: 'Share Tech Mono, monospace', fontSize: '10px', color: '#7b94b5', align: 'center'
}).setOrigin(0.5).setDepth(10).setAlpha(0), 1100);
```
with three items:
```js
this._fade(this.add.text(cx, cy + 52, 'CONTROLS', {
  fontFamily: 'Orbitron, monospace', fontSize: '8px', color: '#445566', align: 'center'
}).setOrigin(0.5).setDepth(10).setAlpha(0), 1000);

this._fade(this.add.text(cx, cy + 65, 'WASD / ARROWS — MOVE     SHIFT — TIME WARP', {
  fontFamily: 'Share Tech Mono, monospace', fontSize: '11px', color: '#8899bb', align: 'center'
}).setOrigin(0.5).setDepth(10).setAlpha(0), 1100);

this._fade(this.add.text(cx, cy + 82, 'E — USE POWERUP     ESC — PAUSE', {
  fontFamily: 'Share Tech Mono, monospace', fontSize: '11px', color: '#8899bb', align: 'center'
}).setOrigin(0.5).setDepth(10).setAlpha(0), 1150);
```

- [ ] **Step 2: Adjust vertical layout**

The controls are now taller. Bump the difficulty selector and leaderboard down accordingly. Change:
- `const diffY = cy + 100` → `const diffY = cy + 110`
- `const lbY = cy + 155` → `const lbY = cy + 170`

- [ ] **Step 3: Verify**

Open menu. Controls should appear as a two-line block with a small `CONTROLS` header, readable at normal desktop viewing distance.

- [ ] **Step 4: Commit**
```bash
git add src/scenes/MenuScene.js
git commit -m "fix: controls hint split into two readable lines with header label"
```

---

## Task 22: Move WaveAnnouncer banner to bottom to avoid z-fighting

**Files:**
- Modify: `src/ui/WaveAnnouncer.js`

The wave banner renders at `cy` (screen center), depth 70/71. Milestone banners render at `cy`, depth 75. They overlap during simultaneous triggers (e.g. ghost #4 spawns exactly at 30s milestone).

- [ ] **Step 1: Move the banner to a bottom strip**

In `src/ui/WaveAnnouncer.js`, change `announce()` to render at the bottom of the arena instead of center:

```js
announce(ghostNumber) {
  const W   = CONFIG.CANVAS_WIDTH;
  const H   = CONFIG.CANVAS_HEIGHT;
  const p   = CONFIG.ARENA_PADDING;
  const by  = H - p - 50;   // bottom strip y center
  const msg = MESSAGES[(ghostNumber - 1) % MESSAGES.length].replace('{n}', ghostNumber);

  const banner = this.scene.add.graphics().setDepth(70);
  banner.fillStyle(0x000000, 0.7);
  banner.fillRect(0, by - 20, W, 40);
  banner.lineStyle(1, 0xa855f7, 0.4);
  banner.beginPath(); banner.moveTo(0, by - 20); banner.lineTo(W, by - 20); banner.strokePath();
  banner.beginPath(); banner.moveTo(0, by + 20); banner.lineTo(W, by + 20); banner.strokePath();

  const label = this.scene.add.text(W / 2, by, msg, {
    fontFamily: 'Orbitron, monospace', fontSize: '13px',
    color: CONFIG.COLOR_PURPLE, align: 'center',
    stroke: '#000000', strokeThickness: 6
  }).setOrigin(0.5).setDepth(71).setAlpha(0);

  const echoPfx = this.scene.add.text(W / 2, by - 12, `// ECHO SYSTEM //`, {
    fontFamily: 'Share Tech Mono, monospace', fontSize: '9px',
    color: '#334455', align: 'center'
  }).setOrigin(0.5).setDepth(71).setAlpha(0);

  this.scene.tweens.add({
    targets: [banner, label, echoPfx], alpha: 1, duration: 180, ease: 'Power2',
    onComplete: () => {
      this.scene.time.delayedCall(1600, () => {
        this.scene.tweens.add({
          targets: [banner, label, echoPfx], alpha: 0, duration: 350,
          onComplete: () => { banner.destroy(); label.destroy(); echoPfx.destroy(); }
        });
      });
    }
  });
}
```

- [ ] **Step 2: Verify**

Run game. Ghost spawn announcements should appear as a bottom-of-screen banner, leaving the center clear for milestone text and warp banners.

- [ ] **Step 3: Commit**
```bash
git add src/ui/WaveAnnouncer.js
git commit -m "fix: wave announcer banner moved to bottom strip to avoid overlap with center-screen banners"
```

---

## Task 23: Add warp and powerup status to pause menu

**Files:**
- Modify: `src/scenes/GameScene.js`

Pause shows `TIME` and `ECHOES` only. Players can't assess their warp charge or held powerup while paused.

- [ ] **Step 1: Expand pause panel height**

In `_pause()`, change:
```js
panel.fillRoundedRect(cx - 160, cy - 110, 320, 220, 12);
panel.strokeRoundedRect(cx - 160, cy - 110, 320, 220, 12);
```
to:
```js
panel.fillRoundedRect(cx - 160, cy - 120, 320, 250, 12);
panel.strokeRoundedRect(cx - 160, cy - 120, 320, 250, 12);
```

- [ ] **Step 2: Add warp and powerup lines to the stats text**

In `_pause()`, change the `stats` text:
```js
const stats = this.add.text(cx, cy - 30, `TIME: ${(this.survivalTime / 1000).toFixed(2)}s\nECHOES: ${this.ghostManager.ghostCount}`, { ... });
```
to:
```js
const warpStr = this.timeWarpActive ? 'WARP: ACTIVE'
  : this.timeWarpAvailable ? 'WARP: READY'
  : 'WARP: RECHARGING';
const pwStr = this.powerupManager.heldType
  ? `HELD: ${this.powerupManager.heldType.toUpperCase()}`
  : 'HELD: NONE';
const stats = this.add.text(cx, cy - 30,
  `TIME: ${(this.survivalTime / 1000).toFixed(2)}s\nECHOES: ${this.ghostManager.ghostCount}\n${warpStr}\n${pwStr}`,
  { fontFamily: 'Share Tech Mono, monospace', fontSize: '14px', color: '#aabbcc', align: 'center' }
).setOrigin(0.5).setDepth(202);
```

- [ ] **Step 3: Move hint text down**

In `_pause()`, change hint `y` from `cy + 60` to `cy + 88` to fit below the extra lines.

- [ ] **Step 4: Verify**

Run game. Press ESC. Pause screen should show 4 info lines: time, echoes, warp status, held powerup.

- [ ] **Step 5: Commit**
```bash
git add src/scenes/GameScene.js
git commit -m "fix: pause menu now shows warp status and held powerup"
```

---

## Task 24: Clamp floating text to screen bounds

**Files:**
- Modify: `src/scenes/GameScene.js`

`_showFloatingText(x, y, ...)` spawns at player or ghost position. If the player is near a wall, text spawns off-screen or gets clipped.

- [ ] **Step 1: Clamp in _showFloatingText()**

In `_showFloatingText()`, after the function parameters, add clamping before creating the text object:
```js
_showFloatingText(x, y, text, color = '#ffffff', fontSize = '12px') {
  const pad = CONFIG.ARENA_PADDING;
  const cx  = Phaser.Math.Clamp(x, pad + 40, CONFIG.CANVAS_WIDTH  - pad - 40);
  const cy  = Phaser.Math.Clamp(y, pad + 20, CONFIG.CANVAS_HEIGHT - pad - 60);
  const t   = this.add.text(cx, cy, text, {
    fontFamily: 'Orbitron, monospace', fontSize, color,
    stroke: '#000000', strokeThickness: 4, align: 'center'
  }).setOrigin(0.5).setDepth(89).setAlpha(0);
  this.tweens.add({
    targets: t, alpha: { from: 1, to: 0 },
    y: { from: cy, to: cy - 50 },
    duration: 1100, ease: 'Power2',
    onComplete: () => t.destroy()
  });
}
```

- [ ] **Step 2: Verify**

Run game. Move player to the far top-left corner. Trigger a near-miss. The floating text should appear nudged inward rather than partially off-screen.

- [ ] **Step 3: Commit**
```bash
git add src/scenes/GameScene.js
git commit -m "fix: clamp floating text position to stay within arena bounds"
```

---

## Task 25: Add player acceleration / deceleration

**Files:**
- Modify: `src/entities/Player.js`

Movement velocity is set instantly to target speed each frame. This feels floaty — there's no weight or momentum.

- [ ] **Step 1: Add velocity state to constructor**

In `src/entities/Player.js`, add to the constructor after `this.vy = 0;`:
```js
this._velX = 0;
this._velY = 0;
```

- [ ] **Step 2: Replace instant velocity with lerp**

In `update()`, replace:
```js
this.vx = dx * CONFIG.PLAYER_SPEED;
this.vy = dy * CONFIG.PLAYER_SPEED;
```
with:
```js
const targetVX = dx * CONFIG.PLAYER_SPEED;
const targetVY = dy * CONFIG.PLAYER_SPEED;
const accelRate = Math.min(1, 14 * dt);
this._velX += (targetVX - this._velX) * accelRate;
this._velY += (targetVY - this._velY) * accelRate;
this.vx = this._velX;
this.vy = this._velY;
```
`accelRate` of 14/s gives a responsive but weighted feel — full speed reached in ~0.07s, stops in ~0.07s.

- [ ] **Step 3: Verify**

Run game. Player movement should feel snappier than before but with a tiny ramp-up and coast. It should not feel sluggish or delayed — just weighted. If it feels too slow, increase `14` to `18`.

- [ ] **Step 4: Commit**
```bash
git add src/entities/Player.js
git commit -m "feat: add player movement acceleration for weighted responsive feel"
```

---

## Task 26: Add touch / mobile input

**Files:**
- Modify: `src/entities/Player.js`
- Modify: `src/scenes/GameScene.js`

The game has no touch input — completely unplayable on mobile. A virtual joystick approach: track touch start and current to derive direction.

- [ ] **Step 1: Add touch input state to Player**

In `src/entities/Player.js`, add to the constructor:
```js
this._touchDX = 0;
this._touchDY = 0;
```

Add a setter method:
```js
setTouchInput(dx, dy) {
  this._touchDX = dx;
  this._touchDY = dy;
}
```

- [ ] **Step 2: Merge touch into movement direction in update()**

In `update()`, change:
```js
let dx = 0, dy = 0;
if (this.keys.left.isDown  || this.keys.a.isDown) dx -= 1;
if (this.keys.right.isDown || this.keys.d.isDown) dx += 1;
if (this.keys.up.isDown    || this.keys.w.isDown) dy -= 1;
if (this.keys.down.isDown  || this.keys.s.isDown) dy += 1;
```
to:
```js
let dx = this._touchDX;
let dy = this._touchDY;
if (this.keys.left.isDown  || this.keys.a.isDown) dx -= 1;
if (this.keys.right.isDown || this.keys.d.isDown) dx += 1;
if (this.keys.up.isDown    || this.keys.w.isDown) dy -= 1;
if (this.keys.down.isDown  || this.keys.s.isDown) dy += 1;
```

- [ ] **Step 3: Add touch tracking to GameScene**

In `src/scenes/GameScene.js`, add to `create()` after the existing `this.input.on('pointerdown', ...)`:
```js
this._touchStartX = null;
this._touchStartY = null;

this.input.on('pointerdown', (ptr) => {
  if (this.state !== 'PLAYING') return;
  this._touchStartX = ptr.x;
  this._touchStartY = ptr.y;
});

this.input.on('pointermove', (ptr) => {
  if (this.state !== 'PLAYING' || this._touchStartX === null) return;
  if (!ptr.isDown) return;
  const ddx = ptr.x - this._touchStartX;
  const ddy = ptr.y - this._touchStartY;
  const len = Math.hypot(ddx, ddy);
  const deadzone = 12;
  if (len > deadzone) {
    this.player.setTouchInput(ddx / len, ddy / len);
  } else {
    this.player.setTouchInput(0, 0);
  }
});

this.input.on('pointerup', () => {
  this._touchStartX = null;
  this._touchStartY = null;
  this.player.setTouchInput(0, 0);
});
```

- [ ] **Step 4: Make sure existing dead-state pointerdown restart still works**

The existing `this.input.on('pointerdown', () => { if (this.state === 'DEAD') this.restartGame(); })` should remain. The new handler added in step 3 also checks `this.state !== 'PLAYING'` and bails, so both coexist without conflict. Confirm both handlers are present.

- [ ] **Step 5: Verify**

Open game on a touch device or use Chrome DevTools mobile simulation. Tap and drag to move the player. Releasing touch stops movement. Keyboard still works alongside touch.

- [ ] **Step 6: Commit**
```bash
git add src/entities/Player.js src/scenes/GameScene.js
git commit -m "feat: add touch/mobile input via drag joystick"
```

---

## Task 27: Add ghost expiry / despawn

**Files:**
- Modify: `src/config/GameConfig.js`
- Modify: `src/entities/Ghost.js`
- Modify: `src/systems/GhostManager.js`

Ghosts live forever until the player dies. All 8 can be present simultaneously with no relief. Adding a max-age expiry keeps the pressure variable and allows the ghost count to breathe.

- [ ] **Step 1: Add GHOST_MAX_AGE_MS to config**

In `src/config/GameConfig.js`, add after `GHOST_FADE_IN_MS`:
```js
GHOST_MAX_AGE_MS:   50000,  // ghost fades out and despawns after 50s
```

- [ ] **Step 2: Add expiry flag to Ghost**

In `src/entities/Ghost.js`, add to the constructor:
```js
this._expired = false;
```

- [ ] **Step 3: Trigger expiry in Ghost.update()**

In `update()`, after `this._age += delta;`, add:
```js
if (!this._expired && this._age > CONFIG.GHOST_MAX_AGE_MS) {
  this._expired = true;
  this.scene.tweens.add({
    targets: this, alpha: 0, duration: 1200, ease: 'Power2',
    onComplete: () => { this.alive = false; }
  });
}
```

- [ ] **Step 4: Track expiry in GhostManager**

In `src/systems/GhostManager.js`, in `update()`, before the dead-ghost cleanup loop, track newly-expired ghosts:
```js
this.ghosts.forEach(g => {
  g.update(timeWarpMultiplier, delta);
  g._inkTimer = (g._inkTimer || 0) + delta;
  if (g._inkTimer >= 80) { this._recordInk(g); g._inkTimer -= 80; }
});

// Detect natural expiry (not clash-kill) to reschedule a spawn
const before = this.ghosts.length;
for (let i = this.ghosts.length - 1; i >= 0; i--) {
  if (!this.ghosts[i].alive) {
    const wasExpired = this.ghosts[i]._expired;
    this.ghosts.splice(i, 1);
    if (wasExpired) {
      this.ghostCount--;
      this._scheduleSpawn(this.getDynamicInterval());
    }
  }
}
```

- [ ] **Step 5: Verify**

Run game. Keep a ghost alive for 50s (survive to wave 6+). The oldest ghost should gradually fade out and disappear, and a new one should eventually spawn to replace it. Ghost count should not drop permanently below the expected curve.

- [ ] **Step 6: Commit**
```bash
git add src/config/GameConfig.js src/entities/Ghost.js src/systems/GhostManager.js
git commit -m "feat: ghosts expire after 50s and are replaced, preventing permanent 8-ghost deadlock"
```

---

## Task 28: Add responsive canvas scaling

**Files:**
- Modify: `src/main.js`

The canvas is hardcoded at 900×650. On small screens or mobile, it overflows. On large screens it sits small.

- [ ] **Step 1: Read the current main.js game config**

Open `src/main.js` and find the Phaser `Game` config object (the `{type, width, height, ...}` object passed to `new Phaser.Game(...)`).

- [ ] **Step 2: Add scale config**

Add a `scale` property to the Phaser game config object:
```js
scale: {
  mode:       Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  width:      900,
  height:     650,
},
```
This keeps the logical resolution at 900×650 (all existing coordinate math stays correct) but scales the canvas to fill the window while maintaining aspect ratio, centering it with letterboxing on mismatch.

- [ ] **Step 3: Verify**

Open the game. Resize the browser window. The game should scale up/down to fill the available space with letterbox bars on mismatched aspect ratios. All UI positions and gameplay physics remain identical.

- [ ] **Step 4: Commit**
```bash
git add src/main.js
git commit -m "feat: add Phaser Scale.FIT for responsive canvas — scales to any window size"
```

---

## Self-Review

**Spec coverage check:**

| Flaw from audit | Task |
|-----------------|------|
| Hardcoded pixel positions / responsive canvas | T28 |
| Emoji icons | T13 |
| No mobile/gamepad warp label | T14 (label stays as SHIFT — mobile covered by T26) |
| Warp ring small / % unreadable | T14 |
| Nerve bar no label | T15 |
| Echo countdown alpha/tween conflict | T16 |
| No score display | T12 |
| Powerup hint too small | T13 (also T12 adds score) |
| Menu title hardcoded offsets | Not changed — cosmetic only, no breakage |
| Leaderboard invisible colors | T19 |
| Difficulty button no indicator | T20 |
| No leaderboard clear | T19 |
| Controls hint too small | T21 |
| Pause missing warp/powerup | T23 |
| Death screen stat overflow | T17 |
| Death screen no difficulty | T17 |
| Buff choice small targets/font | T18 |
| Key listener stacking | T2 |
| Milestone labels unexplained | Not fixed — requires doc/tutorial design, flagged below |
| Floating text off-screen | T24 |
| No acceleration | T25 |
| No touch input | T26 |
| Trail in dead state | T10 |
| Ghost drift unfair | T9 |
| eyeFlicker harsh | T7 |
| Ghost trail in draw() | T4 |
| Ghost behindMs crowding | Not fixed — changing behindMs formula affects core mechanic, needs separate design |
| Ink sampling inconsistent | T6 |
| killGhost mutation | T5 |
| No ghost despawn | T27 |
| Near-miss distance | T8 |
| Warp cooldown overflow | T3 |
| Warp near-invincibility | Not fixed — balance issue, not a bug; needs separate tuning discussion |
| CONFIG mutation | T1 |
| Powerup replacement | T11 |
| WaveAnnouncer z-fighting | T22 |

**Two items intentionally deferred (not bugs, require design discussion):**
- Ghost behindMs crowding at wave 8 — changing this changes the core difficulty curve
- Warp near-invincibility — changing this changes the balance of a core mechanic

**Placeholder scan:** No TBDs. All steps contain actual code.

**Type consistency:** `scoreMult` passed from `GameScene` → `UIManager.update()` matches the added parameter name. `setTouchInput(dx, dy)` defined in T26-Step-1 and called in T26-Step-3. All method names consistent.
