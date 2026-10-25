// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

async function fresh(path) {
  vi.resetModules();
  return import(path);
}

beforeEach(() => localStorage.clear());

describe('Storage', () => {
  it('round-trips JSON and namespaces keys', async () => {
    const { Storage } = await fresh('../src/systems/Storage.js');
    Storage.set('x', { a: 1 });
    expect(localStorage.getItem('echorun_x')).toBe('{"a":1}');
    expect(Storage.get('x')).toEqual({ a: 1 });
  });

  it('returns raw strings that are not JSON (legacy values)', async () => {
    const { Storage } = await fresh('../src/systems/Storage.js');
    localStorage.setItem('echorun_difficulty', 'hard');
    expect(Storage.get('difficulty')).toBe('hard');
  });

  it('returns the fallback when missing or when storage throws', async () => {
    const { Storage } = await fresh('../src/systems/Storage.js');
    expect(Storage.get('missing', 42)).toBe(42);
    const spy = vi.spyOn(Storage, 'get');
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      expect(Storage.get('x', 'fb')).toBe('fb');
      expect(() => Storage.set('x', 1)).not.toThrow();
      expect(() => Storage.remove('x')).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', orig);
      spy.mockRestore();
    }
  });
});

describe('Settings', () => {
  it('has sane defaults', async () => {
    const { Settings } = await fresh('../src/systems/Settings.js');
    expect(Settings.get('difficulty')).toBe('normal');
    expect(Settings.get('muted')).toBe(false);
    expect(Settings.get('reducedFlash')).toBe(false);
  });

  it('migrates the legacy difficulty key and rejects unknown values', async () => {
    localStorage.setItem('echorun_difficulty', 'nightmare');
    let { Settings } = await fresh('../src/systems/Settings.js');
    expect(Settings.get('difficulty')).toBe('nightmare');

    localStorage.clear();
    localStorage.setItem('echorun_settings', JSON.stringify({ difficulty: 'impossible' }));
    ({ Settings } = await fresh('../src/systems/Settings.js'));
    expect(Settings.get('difficulty')).toBe('normal');
  });

  it('persists, toggles and notifies listeners', async () => {
    const { Settings } = await fresh('../src/systems/Settings.js');
    const seen = [];
    const off = Settings.onChange((k, v) => seen.push([k, v]));
    expect(Settings.toggle('muted')).toBe(true);
    expect(JSON.parse(localStorage.getItem('echorun_settings')).muted).toBe(true);
    off();
    Settings.set('muted', false);
    expect(seen).toEqual([['muted', true]]);
  });

  it('scales flashes and skips shake in reduced-flash mode', async () => {
    const { Settings } = await fresh('../src/systems/Settings.js');
    const cam = { shake: vi.fn() };
    expect(Settings.flash(0.5)).toBe(0.5);
    Settings.shake(cam, 100, 0.01);
    expect(cam.shake).toHaveBeenCalledTimes(1);

    Settings.set('reducedFlash', true);
    expect(Settings.flash(0.5)).toBeCloseTo(0.1);
    Settings.shake(cam, 100, 0.01);
    expect(cam.shake).toHaveBeenCalledTimes(1);
  });
});

describe('Leaderboard', () => {
  it('keeps separate sorted top-10 boards per difficulty', async () => {
    const { Leaderboard } = await fresh('../src/systems/Leaderboard.js');
    for (let i = 1; i <= 12; i++) Leaderboard.add('hard', { score: i * 10, time: i * 1000, echoes: 0, date: 0 });
    Leaderboard.add('easy', { score: 5, time: 1, echoes: 0, date: 0 });
    const hard = Leaderboard.top('hard');
    expect(hard).toHaveLength(10);
    expect(hard[0].score).toBe(120);
    expect(hard[9].score).toBe(30);
    expect(Leaderboard.top('easy')).toHaveLength(1);
    expect(Leaderboard.top('normal')).toEqual([]);
  });

  it('reports rank and new bests', async () => {
    const { Leaderboard } = await fresh('../src/systems/Leaderboard.js');
    let r = Leaderboard.add('normal', { score: 100, time: 5000, echoes: 1, date: 0 });
    expect(r).toEqual({ rank: 1, newBestScore: true, newBestTime: true });
    r = Leaderboard.add('normal', { score: 50, time: 9000, echoes: 1, date: 0 });
    expect(r).toEqual({ rank: 2, newBestScore: false, newBestTime: true });
    r = Leaderboard.add('normal', { score: 50, time: 100, echoes: 1, date: 0 });
    expect(r.rank).toBe(3);
    expect(r.newBestScore || r.newBestTime).toBe(false);
  });

  it('returns rank 0 for runs that do not make the board', async () => {
    const { Leaderboard } = await fresh('../src/systems/Leaderboard.js');
    for (let i = 0; i < 10; i++) Leaderboard.add('normal', { score: 1000 + i, time: 1, echoes: 0, date: 0 });
    expect(Leaderboard.add('normal', { score: 1, time: 1, echoes: 0, date: 0 }).rank).toBe(0);
  });

  it('migrates the pre-1.3 time-only board into normal', async () => {
    localStorage.setItem('echorun_lb', JSON.stringify([30000, 60000, 'junk', -5]));
    const { Leaderboard } = await fresh('../src/systems/Leaderboard.js');
    const normal = Leaderboard.top('normal');
    expect(normal.map(e => e.time)).toEqual([60000, 30000]);
    expect(normal[0].score).toBe(600);
  });

  it('persists and clears one board only', async () => {
    let { Leaderboard } = await fresh('../src/systems/Leaderboard.js');
    Leaderboard.add('hard', { score: 1, time: 1, echoes: 0, date: 0 });
    Leaderboard.add('easy', { score: 2, time: 1, echoes: 0, date: 0 });
    ({ Leaderboard } = await fresh('../src/systems/Leaderboard.js'));
    expect(Leaderboard.top('hard')).toHaveLength(1);
    Leaderboard.clear('hard');
    expect(Leaderboard.top('hard')).toEqual([]);
    expect(Leaderboard.top('easy')).toHaveLength(1);
  });
});

describe('Recorder', () => {
  it('records on the gameplay clock at RECORD_INTERVAL', async () => {
    const { Recorder } = await fresh('../src/systems/Recorder.js');
    const r = new Recorder();
    for (let i = 0; i < 10; i++) r.record(i, i, 8);   // 8ms frames → every other frame
    expect(r.now).toBe(80);
    expect(r.buffer.length).toBe(5);
    expect(r.buffer.every((f, i, a) => i === 0 || f.t > a[i - 1].t)).toBe(true);
  });

  it('prunes frames outside the rolling window', async () => {
    const { Recorder } = await fresh('../src/systems/Recorder.js');
    const { CONFIG } = await import('../src/config/GameConfig.js');
    const r = new Recorder();
    const frames = Math.ceil((CONFIG.RECORD_WINDOW_MS + 5000) / 20);
    for (let i = 0; i < frames; i++) r.record(0, 0, 20);
    expect(r.buffer[0].t).toBeGreaterThanOrEqual(r.now - CONFIG.RECORD_WINDOW_MS);
    expect(r.buffer.at(-1).t).toBe(r.now);
  });

  it('reset clears everything', async () => {
    const { Recorder } = await fresh('../src/systems/Recorder.js');
    const r = new Recorder();
    r.record(1, 1, 50);
    r.reset();
    expect(r.buffer).toEqual([]);
    expect(r.now).toBe(0);
  });

  it('frameIndexAt finds the last frame at or before t', async () => {
    const { frameIndexAt } = await fresh('../src/systems/Recorder.js');
    const buf = [0, 16, 32, 48, 64].map(t => ({ t }));
    expect(frameIndexAt(buf, -5)).toBe(0);
    expect(frameIndexAt(buf, 0)).toBe(0);
    expect(frameIndexAt(buf, 31)).toBe(1);
    expect(frameIndexAt(buf, 32)).toBe(2);
    expect(frameIndexAt(buf, 999)).toBe(4);
    expect(frameIndexAt([{ t: 7 }], 3)).toBe(0);
  });
});

describe('GameConfig', () => {
  it('difficulty presets are complete and ordered', async () => {
    const { CONFIG } = await import('../src/config/GameConfig.js');
    expect(CONFIG.DIFFICULTY_ORDER).toEqual(Object.keys(CONFIG.DIFFICULTIES));
    for (const d of Object.values(CONFIG.DIFFICULTIES)) {
      expect(d.ghostDelay).toBeGreaterThan(0);
      expect(d.ghostInterval).toBeGreaterThan(0);
      expect(d.ghostSpeed).toBeGreaterThan(0);
      expect(d.scoreMult).toBeGreaterThan(0);
      // the furthest echo slot must stay inside the recording window
      expect(d.ghostDelay + (CONFIG.MAX_GHOSTS - 1) * d.ghostInterval).toBeLessThan(CONFIG.RECORD_WINDOW_MS);
    }
  });

  it('there are enough buffs for every milestone', async () => {
    const { CONFIG } = await import('../src/config/GameConfig.js');
    expect(CONFIG.BUFFS.length).toBeGreaterThanOrEqual(CONFIG.MILESTONES.length);
    expect(new Set(CONFIG.BUFFS.map(b => b.key)).size).toBe(CONFIG.BUFFS.length);
    const ms = CONFIG.MILESTONES.map(m => m.ms);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
  });
});
