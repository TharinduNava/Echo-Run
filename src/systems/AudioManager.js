import { Settings } from './Settings.js';

let shared = null;

/**
 * Procedural Web Audio sound. One AudioContext is shared for the whole session —
 * browsers cap how many contexts a page may create, so scenes must use AudioManager.get().
 */
export class AudioManager {
  static get() {
    if (!shared) shared = new AudioManager();
    return shared;
  }

  constructor() {
    this.ctx     = null;
    this.enabled = true;
    this._bgNode = null;
    this._arpeggioInterval = null;
    this._arpTension   = 0;
    this._lastTension  = -1;
    this._clashComboCount = 0;
    this._musicPaused  = false;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._master = this.ctx.createGain();
      this._master.connect(this.ctx.destination);
      this._sfx   = this.ctx.createGain();
      this._sfx.connect(this._master);
      this._music = this.ctx.createGain();
      this._music.connect(this._master);
      this._applyVolume();
    } catch {
      this.enabled = false;
    }

    Settings.onChange((key) => {
      if (key === 'muted' || key === 'volume') this._applyVolume();
    });
  }

  _applyVolume() {
    if (!this.ctx) return;
    const vol = Settings.get('muted') ? 0 : Settings.get('volume');
    this._master.gain.cancelScheduledValues(this.ctx.currentTime);
    this._master.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.03);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggleMute() { return Settings.toggle('muted'); }
  get muted()  { return Settings.get('muted'); }

  // ── Core helpers ──────────────────────────────────────────
  _osc(type, freq, gainVal, duration, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g); g.connect(this._sfx);
    o.type = type;
    const t = this.ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.start(t); o.stop(t + duration);
  }

  _sweep(type, f1, f2, gainVal, duration, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g); g.connect(this._sfx);
    o.type = type;
    const t = this.ctx.currentTime + delay;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + duration);
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.start(t); o.stop(t + duration);
  }

  // ── UI sounds ─────────────────────────────────────────────
  playUiMove()   { this._osc('sine', 660, 0.04, 0.06); }
  playUiSelect() { this._sweep('sine', 520, 1040, 0.07, 0.12); }
  playUiBack()   { this._sweep('sine', 700, 350, 0.06, 0.12); }

  // ── Gameplay sounds ───────────────────────────────────────
  playMove() { this._osc('sine', 880, 0.018, 0.05); }

  playGhostSpawn() {
    this._sweep('triangle', 180, 420, 0.12, 0.4);
    this._osc('sine', 280, 0.06, 0.6, 0.1);
  }

  playDeath(survivalMs = 0) {
    if (!this.enabled || !this.ctx) return;
    // Noise burst
    const bufSize = Math.floor(this.ctx.sampleRate * 0.3);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) dat[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const ng = this.ctx.createGain();
    noise.connect(ng); ng.connect(this._sfx);
    ng.gain.setValueAtTime(0.4, this.ctx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    noise.start();

    // Duration-scaled descend — longer run = deeper, more dramatic sweep
    const runFactor = Math.min(1, survivalMs / 90000);
    const startFreq = 200 + runFactor * 200;
    const endFreq   = 30  - runFactor * 20;
    const duration  = 0.5 + runFactor * 0.8;
    this._sweep('sawtooth', startFreq, Math.max(10, endFreq), 0.3, duration);

    if (runFactor > 0.5) this._osc('sine', 40, 0.2 * runFactor, 0.6, 0.1);
  }

  playWarning() { this._osc('square', 330, 0.045, 0.1); }

  /** Near-miss sound — pitch shifts higher the closer the miss was (0=barely, 1=extremely close) */
  playNearMiss(closeness = 0.5) {
    const basePitch = 300 + closeness * 400;
    const peakPitch = 900 + closeness * 600;
    this._sweep('sine', basePitch, peakPitch, 0.08 + closeness * 0.04, 0.12);
    this._sweep('sine', peakPitch, 200 + closeness * 100, 0.05, 0.15, 0.1);
  }

  playCountdownBeep(step) {
    const freqs = [440, 550, 880];
    this._osc('square', freqs[Math.min(step, 2)], 0.07, 0.12);
  }

  playWarp()      { this._sweep('sine', 1200, 200, 0.12, 0.5); this._osc('triangle', 90, 0.1, 0.6); }
  playWarpReady() { this._osc('sine', 1046, 0.06, 0.12); this._osc('sine', 1568, 0.05, 0.18, 0.08); }

  // ── Powerup sounds ───────────────────────────────────────
  playPowerupPickup() {
    this._sweep('sine', 600, 1200, 0.12, 0.2);
    this._osc('sine', 1400, 0.06, 0.15, 0.15);
  }

  playClashActivate() {
    this._sweep('sawtooth', 200, 800, 0.15, 0.3);
    this._osc('square', 440, 0.08, 0.2, 0.1);
    this._clashComboCount = 0;
  }

  playClashKill() {
    this._clashComboCount++;
    this._sweep('sawtooth', 800, 120, 0.25, 0.4);
    this._osc('square', 220, 0.12, 0.3, 0.05);
    this._sweep('sine', 1200, 300, 0.1, 0.35, 0.1);
    if (this._clashComboCount >= 2) {
      const comboFreq = 880 + (this._clashComboCount - 2) * 220;
      this._sweep('sine', comboFreq, comboFreq * 1.5, 0.15, 0.25, 0.25);
      this._osc('sine', comboFreq * 2, 0.08, 0.2, 0.35);
    }
  }

  playPhaseActivate() {
    this._sweep('sine', 800, 1600, 0.1, 0.35);
    this._osc('sine', 2000, 0.05, 0.4, 0.2);
  }

  playPhaseEnd()      { this._sweep('sine', 1600, 400, 0.08, 0.3); }
  playPowerupExpire() { this._sweep('square', 400, 150, 0.06, 0.25); }
  playEmpty()         { this._osc('square', 140, 0.05, 0.08); }

  playDecoyDeploy() {
    this._sweep('sine', 440, 880, 0.1, 0.2);
    this._sweep('triangle', 220, 660, 0.08, 0.3, 0.1);
  }

  playDecoyExpire() { this._sweep('sine', 880, 220, 0.07, 0.35); }

  playMilestone() {
    this._sweep('sine', 440, 880, 0.12, 0.5);
    this._osc('sine', 1320, 0.08, 0.5, 0.2);
  }

  playPowerupPing() {
    this._osc('sine', 1760, 0.04, 0.3);
    this._osc('sine', 2200, 0.02, 0.25, 0.1);
  }

  // ── Adaptive background music ─────────────────────────────
  startAdaptiveBg() {
    if (!this.enabled || !this.ctx || this._bgNode) return;
    const t = this.ctx.currentTime;
    const bgGain = this.ctx.createGain();
    bgGain.gain.setValueAtTime(0.0, t);
    bgGain.connect(this._music);

    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(55, t);
    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.06, t);
    drone.connect(droneGain); droneGain.connect(bgGain);
    drone.start();

    const pulse = this.ctx.createOscillator();
    pulse.type = 'triangle';
    pulse.frequency.setValueAtTime(110, t);
    const pulseGain = this.ctx.createGain();
    pulseGain.gain.setValueAtTime(0.03, t);
    pulse.connect(pulseGain); pulseGain.connect(bgGain);
    pulse.start();

    this._bgNode = { drone, pulse, gain: bgGain };
    this._lastTension = -1;
    bgGain.gain.linearRampToValueAtTime(0.18, t + 3);
    this.setMusicPaused(false);
  }

  setTension(level) {
    if (!this.enabled || !this.ctx || !this._bgNode) return;
    // Only reschedule on meaningful change — scheduling every frame piles up automation events
    if (Math.abs(level - this._lastTension) < 0.02) return;
    this._lastTension = level;

    const t = this.ctx.currentTime;
    const { drone, pulse, gain } = this._bgNode;
    [drone.frequency, pulse.frequency, gain.gain].forEach(p => p.cancelScheduledValues(t));
    drone.frequency.setTargetAtTime(55 + level * 30, t, 0.7);
    pulse.frequency.setTargetAtTime(110 + level * 55, t, 0.7);
    gain.gain.setTargetAtTime(0.18 + level * 0.18, t, 0.7);

    if (level >= 0.6 && !this._musicPaused) this._startArpeggio(level);
    else this._stopArpeggio();
  }

  /** Duck the music (pause menus) without tearing down the nodes. */
  setMusicPaused(paused) {
    if (!this.ctx) return;
    this._musicPaused = paused;
    const t = this.ctx.currentTime;
    this._music.gain.cancelScheduledValues(t);
    this._music.gain.setTargetAtTime(paused ? 0.25 : 1, t, 0.15);
    if (paused) this._stopArpeggio();
    else this._lastTension = -1; // force setTension to re-evaluate the arpeggio
  }

  _startArpeggio(tension) {
    if (!this.enabled || !this.ctx) return;
    // Restart when tension moved enough to change tempo
    if (this._arpeggioInterval && Math.abs(tension - this._arpTension) < 0.15) return;
    this._stopArpeggio();
    const notes = [220, 277, 330, 415, 494];  // A minor-ish pentatonic
    let noteIdx = 0;
    const gain = 0.03 + (tension - 0.6) * 0.08;
    const bpm  = 120 + (tension - 0.6) * 100;
    this._arpeggioInterval = setInterval(() => {
      this._osc('triangle', notes[noteIdx++ % notes.length], gain, 0.18);
    }, Math.round(60000 / bpm / 2));
    this._arpTension = tension;
  }

  _stopArpeggio() {
    if (this._arpeggioInterval) {
      clearInterval(this._arpeggioInterval);
      this._arpeggioInterval = null;
    }
  }

  stopAdaptiveBg() {
    this._stopArpeggio();
    if (!this._bgNode || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { drone, pulse, gain } = this._bgNode;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    try { drone.stop(t + 1.6); pulse.stop(t + 1.6); } catch { /* already stopped */ }
    this._bgNode = null;
  }
}
