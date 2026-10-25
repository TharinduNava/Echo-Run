/**
 * End-to-end tests: boots the dev server, drives the real game in headless Chrome through the
 * dev harness (src/dev/harness.js) and asserts on game state.
 *
 *   npm run test:e2e                      run all tests
 *   E2E_SHOTS=out/ npm run test:e2e       also save screenshots of key screens
 *   CHROME_PATH=/path/to/chrome           override browser detection
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('No Chrome found; set CHROME_PATH'); process.exit(2); }

const SHOTS = process.env.E2E_SHOTS ? path.resolve(process.env.E2E_SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY, 'i') : null;

const server = await createServer({ logLevel: 'error', server: { port: 5288 } });
await server.listen();
const URL = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

const allErrors = [];
const results = [];

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function near(a, b, tol, msg) { assert(Math.abs(a - b) <= tol, `${msg}: expected ~${b} (±${tol}), got ${a}`); }

async function open({ touch = false, storage = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, hasTouch: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errors.push('console.error: ' + t);
    if (m.type() === 'warning' && !/GPU stall|swiftshader|WebGL/i.test(t)) errors.push('console.warn: ' + t);
  });
  await page.addInitScript((seed) => {
    if (seed) for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    const AC = window.AudioContext;
    let n = 0;
    window.__acCount = () => n;
    window.AudioContext = class extends AC { constructor(...a) { super(...a); n++; } };
  }, storage);
  await page.goto(URL);
  await page.waitForFunction(() => window.T && window.T.active() === 'MenuScene', null, { timeout: 20000 });
  await page.evaluate(() => T.run(2600)); // menu intro animations
  return { page, ctx, errors };
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.evaluate(() => T.run(17));
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const env = await open(fn.options || {});
  const t0 = Date.now();
  try {
    await fn(env);
    const harnessErrors = await env.page.evaluate(() => T.errors);
    assert(!harnessErrors.length, 'harness errors: ' + harnessErrors.join('\n'));
    assert(!env.errors.length, 'page errors: ' + env.errors.join('\n'));
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  \u2717 ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  } finally {
    allErrors.push(...env.errors);
    await env.ctx.close();
  }
}
const withOpts = (options, fn) => Object.assign(fn, { options });

const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function clickGame(page, x, y) {
  const p = await ev(page, ([x, y]) => T.toPage(x, y), [x, y]);
  await page.mouse.click(p.x, p.y);
  await ev(page, () => T.run(50));
}

console.log(`Echo Run e2e — ${URL}`);

// ─────────────────────────────────────────────────────────────── MENU
await test('boot: menu renders, one AudioContext, no errors', async ({ page }) => {
  const r = await ev(page, () => ({ active: T.active(), ac: window.__acCount(), texts: T.scene('MenuScene').children.list.filter(o => o.type === 'Text').length }));
  assert(r.active === 'MenuScene', 'menu not active: ' + r.active);
  assert(r.ac === 1, 'expected exactly 1 AudioContext, got ' + r.ac);
  assert(r.texts > 15, 'menu text missing');
  await shot(page, '01-menu');
});

await test('menu: clicking difficulty/settings never starts the game', async ({ page }) => {
  await clickGame(page, 450 - 168 + 3 * 112, 360); // NIGHTMARE
  let r = await ev(page, () => ({ active: T.active(), d: JSON.parse(localStorage.getItem('echorun_settings')).difficulty }));
  assert(r.active === 'MenuScene', 'difficulty click started the game');
  assert(r.d === 'nightmare', 'difficulty not saved: ' + r.d);
  await clickGame(page, 450 - 90, 625); // SOUND toggle
  r = await ev(page, () => ({ active: T.active(), muted: JSON.parse(localStorage.getItem('echorun_settings')).muted }));
  assert(r.active === 'MenuScene' && r.muted === true, 'sound toggle failed / started game');
  await clickGame(page, 450 + 90, 625); // FLASH toggle
  r = await ev(page, () => JSON.parse(localStorage.getItem('echorun_settings')).reducedFlash);
  assert(r === true, 'flash toggle failed');
  await ev(page, () => { T.tap('ArrowLeft'); T.tap('ArrowLeft'); });
  r = await ev(page, () => T.scene('MenuScene')._difficulty);
  assert(r === 'normal', 'keyboard difficulty nav failed: ' + r);
});

await test('menu: START button and keyboard both start on the chosen difficulty', async ({ page }) => {
  await ev(page, () => T.scene('MenuScene')._setDifficulty('hard'));
  await clickGame(page, 450, 548);
  await ev(page, () => T.run(600));
  const r = await ev(page, () => ({ active: T.active(), d: T.gs()._difficulty, state: T.gs().state }));
  assert(r.active === 'GameScene' && r.d === 'hard' && r.state === 'PLAYING', JSON.stringify(r));
});

await test('menu: legacy pre-1.3 saves are migrated', withOpts({ storage: { echorun_lb: '[45000,30000]', echorun_difficulty: 'hard' } }, async ({ page }) => {
  const r = await ev(page, () => ({ d: T.scene('MenuScene')._difficulty, rows: T.scene('MenuScene')._lbRows.map(t => t.text) }));
  assert(r.d === 'hard', 'legacy difficulty not migrated: ' + r.d);
  await ev(page, () => T.scene('MenuScene')._setDifficulty('normal'));
  const rows = await ev(page, () => T.scene('MenuScene')._lbRows.map(t => t.text));
  assert(rows[0].includes('450') && rows[0].includes('45.0s'), 'legacy board not migrated: ' + rows[0]);
}));

await test('menu: clear scores needs a confirming second click', withOpts({ storage: { echorun_lb: '[45000]' } }, async ({ page }) => {
  await ev(page, () => T.scene('MenuScene')._setDifficulty('normal'));
  await clickGame(page, 450, 522);
  let n = await ev(page, () => JSON.parse(localStorage.getItem('echorun_leaderboard_v2') || '{"normal":[1]}').normal?.length ?? 1);
  assert(n === 1, 'cleared on first click');
  await clickGame(page, 450, 522);
  n = await ev(page, () => JSON.parse(localStorage.getItem('echorun_leaderboard_v2')).normal.length);
  assert(n === 0, 'not cleared after confirm');
}));

// ─────────────────────────────────────────────────────────────── CORE LOOP
await test('echoes: first spawn follows difficulty delay', async ({ page }) => {
  for (const [d, delay] of [['normal', 10000], ['nightmare', 5000], ['easy', 15000]]) {
    const r = await ev(page, ([d, delay]) => {
      const gs = T.start(d);
      T.safe(delay - gs.survivalTime - 300);
      const before = gs.ghostManager.ghostCount;
      T.safe(600);
      return { before, after: gs.ghostManager.ghostCount };
    }, [d, delay]);
    assert(r.before === 0 && r.after === 1, `${d}: ${JSON.stringify(r)}`);
  }
});

await test('echoes: replay the recorded path behind the player', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    let a = 0;
    const path = [];
    T.safe(14000, () => { a += 0.01; gs.player.x = 450 + Math.cos(a) * 200; gs.player.y = 325 + Math.sin(a) * 150; path.push([gs.survivalTime, gs.player.x, gs.player.y]); });
    const g = gs.ghostManager.ghosts[0];
    // the echo should be near where the player was ~10s (+ grace drift) ago
    const target = g._pathT;
    const rec = gs.recorder.buffer.find(f => f.t >= target);
    return { lag: gs.recorder.now - g._pathT, dist: Math.hypot(g.x - rec.x, g.y - rec.y) };
  });
  near(r.lag, 10000, 50, 'echo lag');
  assert(r.dist < 12, 'echo off its recorded path by ' + r.dist.toFixed(1));
});

await test('echoes: cap of 8, unique slots, tier progression, expiry + respawn', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('nightmare');
    const gm = gs.ghostManager;
    const tiers = [];
    const orig = gm.spawnGhost.bind(gm);
    gm.spawnGhost = () => { const n = gm.ghostCount; orig(); if (gm.ghostCount > n) tiers.push(gm.ghosts.at(-1).tier); };
    let maxCount = 0, dupSlots = false, expired = 0, a = 0;
    T.safe(120000, () => {
      if (gs.state === 'CHOOSING') { gs._closeMenu(); gs._unfreeze(); }
      a += 0.012; gs.player.x = 450 + Math.cos(a) * 280; gs.player.y = 325 + Math.sin(a * 1.7) * 200;
      maxCount = Math.max(maxCount, gm.ghostCount);
      const slots = gm.ghosts.map(g => g.slot);
      if (new Set(slots).size !== slots.length) dupSlots = true;
      expired += gm.ghosts.filter(g => g._expired).length ? 0 : 0;
    });
    return { maxCount, dupSlots, total: gm.totalSpawned, tiers: tiers.slice(0, 9).join(''), graphicsLeak: gs.children.list.filter(o => o.type === 'Graphics' && o.depth === 18).length, alive: gm.ghostCount };
  });
  assert(r.maxCount === 8, 'max echoes ' + r.maxCount);
  assert(!r.dupSlots, 'duplicate slots');
  assert(r.total > 8, 'expired echoes were never replaced (total ' + r.total + ')');
  assert(r.tiers === '111222333', 'tier progression ' + r.tiers);
  assert(r.graphicsLeak === r.alive, `leaked echo graphics: ${r.graphicsLeak} objects for ${r.alive} echoes`);
});

await test('echoes: never sit on the live player (min-behind clamp)', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('nightmare');
    let minLag = Infinity;
    T.safe(90000, () => {
      if (gs.state === 'CHOOSING') { gs._closeMenu(); gs._unfreeze(); }
      for (const g of gs.ghostManager.ghosts) minLag = Math.min(minLag, gs.recorder.now - g._pathT);
    });
    return minLag;
  });
  assert(r >= 1400, 'echo caught up to within ' + r + 'ms');
});

await test('pause: freezes survival time, spawn and powerup timers; resumes cleanly', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    T.safe(4000);
    const snap = () => ({ t: gs.survivalTime, spawn: Math.round(gs.ghostManager.getTimeUntilNextSpawn()), pu: Math.round(gs.powerupManager._spawnTimer.getRemaining()), score: gs.scoreSystem.score });
    T.tap('Escape');
    const a = snap(); const state1 = gs.state;
    T.run(5000);
    const b = snap();
    T.tap('Escape'); const state2 = gs.state;
    T.tap('KeyP'); const state3 = gs.state; T.tap('KeyP');
    window.dispatchEvent(new Event('blur')); T.run(17); const state4 = gs.state;
    T.tap('Space'); const state5 = gs.state;
    return { state1, state2, state3, state4, state5, a, b };
  });
  assert(r.state1 === 'PAUSED' && r.state2 === 'PLAYING' && r.state3 === 'PAUSED' && r.state4 === 'PAUSED' && r.state5 === 'PLAYING', JSON.stringify(r));
  assert(r.a.t === r.b.t && r.a.spawn === r.b.spawn && r.a.pu === r.b.pu && r.a.score === r.b.score, 'time leaked during pause ' + JSON.stringify(r));
});

await test('pause menu: buttons work with the mouse', async ({ page }) => {
  await ev(page, () => { T.start('normal'); T.safe(1000); });
  await clickGame(page, 900 - 50 - 45, 25); // top-bar PAUSE
  let s = await ev(page, () => T.gs().state);
  assert(s === 'PAUSED', 'pause button: ' + s);
  await shot(page, '03-pause');
  await clickGame(page, 450, 325 - 62); // RESUME
  s = await ev(page, () => T.gs().state);
  assert(s === 'PLAYING', 'resume button: ' + s);
  await ev(page, () => T.tap('Escape'));
  await clickGame(page, 450, 325 - 16); // RESTART
  await ev(page, () => T.run(100));
  let r = await ev(page, () => ({ s: T.gs().state, t: T.gs().survivalTime, paused: T.gs().time.paused }));
  assert(r.s === 'PLAYING' && r.t < 500 && !r.paused, 'restart button: ' + JSON.stringify(r));
  await ev(page, () => T.tap('Escape'));
  await clickGame(page, 450, 325 + 122); // MAIN MENU
  await ev(page, () => T.run(600));
  r = await ev(page, () => T.active());
  assert(r === 'MenuScene', 'menu button: ' + r);
});

await test('death: results saved, screen shown, SPACE restarts, ESC goes to menu', async ({ page }) => {
  let r = await ev(page, () => {
    const gs = T.start('normal');
    T.fast(60000, () => gs.state === 'PLAYING');   // stand still until an echo walks into us
    T.run(1600);
    return { state: gs.state, score: gs._result.score, lb: JSON.parse(localStorage.getItem('echorun_leaderboard_v2')).normal.length, hud: gs.uiManager.echoCountdownText.text };
  });
  assert(r.state === 'DEAD', 'never died: ' + r.state);
  assert(r.lb === 1 && r.score > 0, 'run not saved ' + JSON.stringify(r));
  assert(r.hud === 'SIGNAL LOST', 'HUD countdown still running after death');
  await shot(page, '05-death');
  r = await ev(page, () => { T.tap('Space'); T.run(100); return { s: T.gs().state, t: T.gs().survivalTime }; });
  assert(r.s === 'PLAYING' && r.t < 500, 'SPACE restart ' + JSON.stringify(r));
  r = await ev(page, () => { const gs = T.gs(); T.fast(60000, () => gs.state === 'PLAYING'); T.run(1600); T.tap('Escape'); T.run(600); return { a: T.active(), row: T.scene('MenuScene')._lbRows[0].text }; });
  assert(r.a === 'MenuScene' && r.row.startsWith('#1'), 'ESC to menu / leaderboard row ' + JSON.stringify(r));
});

// ─────────────────────────────────────────────────────────────── ABILITIES
await test('time warp: slows echoes, cooldown, refunds, ready again', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    gs.godMode = true;
    T.safe(12000);
    const g = gs.ghostManager.ghosts[0];
    const p0 = g._pathT; T.safe(1000); const normalRate = g._pathT - p0;
    T.tap('ShiftLeft'); const s1 = gs._warp.state;
    const p1 = g._pathT; T.safe(1000); const warpRate = g._pathT - p1;
    T.safe(2100); const s2 = gs._warp.state; const prog = gs._warpProgress;
    T.tap('ShiftLeft'); const s3 = gs._warp.state;
    const left = gs._warp.left; gs._onNearMiss(g); const refund = left - gs._warp.left;
    T.safe(8100); const s4 = gs._warp.state;
    return { normalRate, warpRate, s1, s2, prog, s3, refund, s4, uses: gs.scoreSystem.stats.warpUses };
  });
  near(r.normalRate, 1000, 40, 'normal echo rate');
  near(r.warpRate, 200, 40, 'warped echo rate');
  assert(r.s1 === 'active' && r.s2 === 'cooldown' && r.s3 === 'cooldown' && r.s4 === 'ready', JSON.stringify(r));
  assert(r.prog < 0.1, 'cooldown progress should start near 0: ' + r.prog);
  near(r.refund, 2000, 1, 'near-miss refund');
  assert(r.uses === 1, 'warp uses ' + r.uses);
});

await test('powerups: spawn away from player, pickup, replace, empty use', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    const pm = gs.powerupManager;
    const firstAt = Math.round(pm._spawnTimer.getRemaining());
    let minDist = Infinity;
    for (let i = 0; i < 30; i++) {
      pm._spawn(); const p = pm._current;
      minDist = Math.min(minDist, Math.hypot(p.x - gs.player.x, p.y - gs.player.y));
    }
    pm._spawnTimer.remove(false);
    T.tap('KeyE'); const emptyUse = pm.activeType;
    pm._current.type = 'phase'; gs.player.x = pm._current.x; gs.player.y = pm._current.y; T.safe(50);
    const held1 = pm.heldType;
    pm._spawn(); pm._current.type = 'decoy'; gs.player.x = pm._current.x; gs.player.y = pm._current.y; T.safe(50);
    const held2 = pm.heldType;
    const stray = gs.children.list.filter(o => o.type === 'Text' && /^(CLASH|PHASE|DECOY)$/.test(o.text) && o.active).length;
    return { firstAt, minDist, emptyUse, held1, held2, collected: gs.scoreSystem.stats.powerupsCollected, stray };
  });
  assert(r.firstAt > 11000 && r.firstAt <= 12000, 'first powerup timing ' + r.firstAt);
  assert(r.minDist >= 140, 'powerup spawned too close: ' + r.minDist.toFixed(0));
  assert(r.emptyUse === null, 'E with nothing held activated something');
  assert(r.held1 === 'phase' && r.held2 === 'decoy' && r.collected === 2, JSON.stringify(r));
});

await test('powerups: clash destroys echoes, frees slot, awards points', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    const pm = gs.powerupManager, gm = gs.ghostManager;
    T.safe(11800, () => { gs.player.x = 150; gs.player.y = 150; });
    const g = gm.ghosts[0];
    gs.player.x = 150; gs.player.y = 150;
    pm._held = 'clash';
    const score0 = gs.scoreSystem.score;
    T.tap('KeyE');
    gs.player.x = g.x; gs.player.y = g.y; T.run(17);
    return { state: gs.state, kills: gs.scoreSystem.stats.clashKills, count: gm.ghostCount, slotFree: gm._slots[0] === null, gfx: g.graphics === null, pts: Math.round(gs.scoreSystem.score - score0), respawn: gm.getTimeUntilNextSpawn() > 0 };
  });
  assert(r.state === 'PLAYING' && r.kills === 1 && r.count === 0 && r.slotFree && r.gfx && r.respawn, JSON.stringify(r));
  assert(r.pts >= 150, 'clash points ' + r.pts);
});

await test('powerups: phase prevents death; ends after its duration', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    const pm = gs.powerupManager, gm = gs.ghostManager;
    T.safe(11800);
    pm._held = 'phase'; T.tap('KeyE');
    let died = false;
    T.fast(3800, () => { const g = gm.ghosts[0]; gs.player.x = g.x; gs.player.y = g.y; if (gs.state !== 'PLAYING') died = true; });
    T.safe(300);
    return { died, active: pm.activeType };
  });
  assert(!r.died && r.active === null, JSON.stringify(r));
});

await test('powerups: decoy lures echoes away, then releases them', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    gs.godMode = true;
    const pm = gs.powerupManager, gm = gs.ghostManager;
    T.safe(11800);
    const g = gm.ghosts[0];
    pm._held = 'decoy'; T.tap('KeyE');
    const d = pm.decoyPosition;
    const decoyFromPlayer = Math.hypot(d.x - gs.player.x, d.y - gs.player.y);
    T.safe(1500);
    const lure = g._lureW;
    T.safe(2600);
    const ended = pm.activeType;
    T.safe(2500);
    return { decoyFromPlayer, lure, ended, after: g._lureW };
  });
  assert(r.decoyFromPlayer >= 200, 'decoy placed too close: ' + r.decoyFromPlayer);
  assert(r.lure > 0.5, 'echo not lured: ' + r.lure);
  assert(r.ended === null && r.after < 0.05, 'lure not released ' + JSON.stringify(r));
});

await test('powerups: nothing spawns after death', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    T.safe(500);
    gs.onDeath();
    T.fast(45000);
    return { current: gs.powerupManager._current, labels: gs.children.list.filter(o => o.type === 'Text' && /^(CLASH|PHASE|DECOY)$/.test(o.text)).length };
  });
  assert(r.current === null && r.labels === 0, JSON.stringify(r));
});

// ─────────────────────────────────────────────────────────────── MILESTONES
await test('milestones: freeze, ignore ESC, offer untaken buffs, apply effects', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    const picks = [];
    let escOk = true, frozen = true;
    for (let m = 0; m < 5; m++) {
      T.safe(30000 - (gs.survivalTime % 30000) + 50);
      if (gs.state !== 'CHOOSING') return { err: 'no milestone ' + m + ' state ' + gs.state };
      if (!gs.time.paused) frozen = false;
      T.tap('Escape'); if (gs.state !== 'CHOOSING') escOk = false;
      T.run(2200);
      const offered = gs._menu.objects.filter(o => o.type === 'Text' && /^\[\d\]$/.test(o.text)).length;
      T.tap('Digit1');
      picks.push({ offered, buffs: gs._buffs.size, state: gs.state, invuln: gs._invulnLeft > 0 });
    }
    return {
      picks, escOk, frozen,
      decay: gs.scoreSystem._nerveDecayMult, zone: gs.scoreSystem._zoneMult, radius: gs.powerupManager._pickupRadius,
      clash: gs.powerupManager._clashBonusMs, phase: gs.powerupManager._phaseBonusMs, buffs: [...gs._buffs],
    };
  });
  assert(!r.err, r.err);
  assert(r.escOk && r.frozen, 'milestone not modal ' + JSON.stringify(r));
  r.picks.forEach((p, i) => {
    assert(p.buffs === i + 1 && p.state === 'PLAYING' && p.invuln, `pick ${i}: ${JSON.stringify(p)}`);
    assert(p.offered === Math.min(3, 6 - i), `pick ${i} offered ${p.offered}`);
  });
  const applied = { nerveDecay: r.decay === 0.6, zoneBoost: r.zone === 3, magnet: r.radius === 60, clashDuration: r.clash === 3000, phaseDuration: r.phase === 2000, warpRecharge: true };
  for (const b of r.buffs) assert(applied[b], 'buff not applied: ' + b);
});

await test('milestones: buff choice screen renders', async ({ page }) => {
  await ev(page, () => { const gs = T.start('normal'); T.safe(30050 - gs.survivalTime); T.run(2200); });
  await shot(page, '04-buffs');
  const r = await ev(page, () => T.gs().state);
  assert(r === 'CHOOSING', r);
  await clickGame(page, 450, 330); // middle card
  const s = await ev(page, () => ({ state: T.gs().state, buffs: T.gs()._buffs.size }));
  assert(s.state === 'PLAYING' && s.buffs === 1, 'card click ' + JSON.stringify(s));
});

await test('warp sprint buff shortens cooldown', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    gs._applyBuff('warpRecharge');
    T.tap('ShiftLeft'); T.safe(3100);
    return gs._warp.total;
  });
  near(r, 6500, 1, 'buffed cooldown');
});

// ─────────────────────────────────────────────────────────────── SCORE / FAIRNESS
await test('score: accrues ~10/s base, near-miss combos, difficulty multiplier', async ({ page }) => {
  const r = await ev(page, () => {
    let gs = T.start('normal'); let s0 = gs.scoreSystem.score; T.safe(5000); const normal = gs.scoreSystem.score - s0;
    const c1 = gs.scoreSystem.recordNearMiss(), c2 = gs.scoreSystem.recordNearMiss();
    T.safe(4100); const c3 = gs.scoreSystem.recordNearMiss();
    gs = T.start('nightmare'); s0 = gs.scoreSystem.score; T.safe(4500); const nightmare = gs.scoreSystem.score - s0;
    return { normal, nightmare, c1, c2, c3 };
  });
  near(r.normal, 50, 1, 'normal 5s score');
  near(r.nightmare, 78.75, 1, 'nightmare 4.5s score');
  assert(r.c1 === 1 && r.c2 === 2 && r.c3 === 1, 'combo ' + JSON.stringify(r));
});

await test('fairness: new echoes are harmless while materializing; resume grace', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    T.safe(10050);
    const g = gs.ghostManager.ghosts[0];
    gs.player.x = g.x; gs.player.y = g.y;
    let diedDuringGrace = false;
    T.fast(1000, () => { gs.player.x = g.x; gs.player.y = g.y; if (gs.state !== 'PLAYING') diedDuringGrace = true; });
    T.tap('Escape'); T.tap('Escape');
    let diedDuringResume = false;
    T.fast(900, () => { gs.player.x = g.x; gs.player.y = g.y; if (gs.state !== 'PLAYING') diedDuringResume = true; });
    T.fast(300, () => { gs.player.x = g.x; gs.player.y = g.y; });
    return { diedDuringGrace, diedDuringResume, finallyDead: gs.state !== 'PLAYING' };
  });
  assert(!r.diedDuringGrace && !r.diedDuringResume && r.finallyDead, JSON.stringify(r));
});

// ─────────────────────────────────────────────────────────────── SETTINGS / AUDIO
await test('audio: single AudioContext across many restarts; M toggles mute', async ({ page }) => {
  const r = await ev(page, () => {
    for (let i = 0; i < 6; i++) { const gs = T.start('normal'); T.safe(300); T.tap('Escape'); T.tap('KeyR'); T.run(100); }
    const before = JSON.parse(localStorage.getItem('echorun_settings') || '{}').muted ?? false;
    T.tap('KeyM');
    const after = JSON.parse(localStorage.getItem('echorun_settings')).muted;
    return { ac: window.__acCount(), before, after, label: T.gs()._soundBtn.text.text };
  });
  assert(r.ac === 1, 'AudioContexts created: ' + r.ac);
  assert(r.before === false && r.after === true && r.label === 'SOUND OFF', JSON.stringify(r));
});

// ─────────────────────────────────────────────────────────────── TOUCH
await test('touch: joystick moves the player; HUD panels act as buttons', withOpts({ touch: true }, async ({ page }) => {
  await ev(page, () => T.start('normal'));
  const cdp = await page.context().newCDPSession(page);
  const p0 = await ev(page, () => T.toPage(450, 400));
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const x0 = await ev(page, () => T.gs().player.x);
  await send('touchStart', [{ x: p0.x, y: p0.y, id: 1 }]);
  await ev(page, () => T.safe(50, null, false));
  await send('touchMove', [{ x: p0.x + 80, y: p0.y, id: 1 }]);
  await ev(page, () => T.safe(600, null, false));
  const mid = await ev(page, () => ({ x: T.gs().player.x, v: T.gs().touchControls.vector }));
  await send('touchEnd', []);
  await ev(page, () => T.safe(50, null, false));
  const end = await ev(page, () => T.gs().touchControls.vector);
  assert(mid.x - x0 > 60, `player did not move right (${x0} -> ${mid.x})`);
  assert(mid.v.x > 0.9, 'joystick vector ' + JSON.stringify(mid.v));
  assert(end.x === 0 && end.y === 0, 'joystick not released');

  const w = await ev(page, () => { const r = T.gs().uiManager.warpRect; return T.toPage(r.x + r.w / 2, r.y + r.h / 2); });
  await send('touchStart', [{ x: w.x, y: w.y, id: 2 }]);
  await send('touchEnd', []);
  await ev(page, () => T.run(34));
  const warp = await ev(page, () => T.gs()._warp.state);
  assert(warp === 'active', 'warp panel tap: ' + warp);
}));

// ─────────────────────────────────────────────────────────────── VISUAL / PERF
await test('visual: gameplay HUD with echoes + per-frame cost', async ({ page }) => {
  const r = await ev(page, () => {
    const gs = T.start('normal');
    let a = 0;
    T.safe(70000, () => {
      if (gs.state === 'CHOOSING') { gs._closeMenu(); gs._unfreeze(); }
      a += 0.012; gs.player.x = 450 + Math.cos(a) * 280; gs.player.y = 325 + Math.sin(a * 1.7) * 200;
    });
    gs.powerupManager._spawn();
    gs.godMode = true;
    const t0 = performance.now(); T.fast(1000); const upd = (performance.now() - t0) / 60;
    gs.godMode = false;
    return { ghosts: gs.ghostManager.ghostCount, upd };
  });
  await ev(page, () => { T.gs().godMode = true; T.run(200); });
  await shot(page, '02-gameplay');
  console.log(`      update cost with ${r.ghosts} echoes: ${r.upd.toFixed(2)} ms/frame`);
  assert(r.ghosts >= 6, 'too few echoes for visual check');
  assert(r.upd < 4, 'update too slow: ' + r.upd);
});

await browser.close();
await server.close();

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
