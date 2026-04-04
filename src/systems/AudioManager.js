export class AudioManager {
  constructor() {
    this.ctx     = null;
    this.enabled = true;
    this._bgNode = null;
    this._bgGain = null;
    this._tensionLevel = 0; // 0–1, drives bg intensity
    this.init();
  }

  init() {
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { this.enabled = false; }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── Core helpers ──────────────────────────────────────────
  _osc(type, freq, gainVal, duration, delay = 0, dest = null) {
    if (!this.enabled || !this.ctx) return;
    const d = dest || this.ctx.destination;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g); g.connect(d);
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
    o.connect(g); g.connect(this.ctx.destination);
    o.type = type;
    const t = this.ctx.currentTime + delay;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + duration);
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.start(t); o.stop(t + duration);
  }

  // ── Gameplay sounds ───────────────────────────────────────
  playMove() { this._osc('sine', 880, 0.018, 0.05); }

  playGhostSpawn() {
    this._sweep('triangle', 180, 420, 0.12, 0.4);
    this._osc('sine', 280, 0.06, 0.6, 0.1);
  }

  playDeath() {
    if (!this.enabled || !this.ctx) return;
    // Noise burst
    const bufSize = this.ctx.sampleRate * 0.3;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) dat[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const ng = this.ctx.createGain();
    noise.connect(ng); ng.connect(this.ctx.destination);
    ng.gain.setValueAtTime(0.4, this.ctx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    noise.start();
    this._sweep('sawtooth', 200, 30, 0.3, 0.5);
  }

  playWarning() { this._osc('square', 330, 0.045, 0.1); }

  playNearMiss() {
    // Satisfying whoosh — sweeps up then down
    this._sweep('sine', 300, 900, 0.08, 0.12);
    this._sweep('sine', 900, 200, 0.05, 0.15, 0.1);
  }

  playCountdownBeep(step) {
    // step 0=3s, 1=2s, 2=1s — pitch rises
    const freqs = [440, 550, 880];
    const f = freqs[Math.min(step, 2)];
    this._osc('square', f, 0.07, 0.12);
  }

  // ── Powerup sounds ───────────────────────────────────────
  playPowerupPickup() {
    this._sweep('sine', 600, 1200, 0.12, 0.2);
    this._osc('sine', 1400, 0.06, 0.15, 0.15);
  }

  playClashActivate() {
    this._sweep('sawtooth', 200, 800, 0.15, 0.3);
    this._osc('square', 440, 0.08, 0.2, 0.1);
  }

  playClashKill() {
    // Satisfying impact
    this._sweep('sawtooth', 800, 120, 0.25, 0.4);
    this._osc('square', 220, 0.12, 0.3, 0.05);
    this._sweep('sine', 1200, 300, 0.1, 0.35, 0.1);
  }

  playPhaseActivate() {
    this._sweep('sine', 800, 1600, 0.1, 0.35);
    this._osc('sine', 2000, 0.05, 0.4, 0.2);
  }

  playPhaseEnd() { this._sweep('sine', 1600, 400, 0.08, 0.3); }

  playPowerupExpire() { this._sweep('square', 400, 150, 0.06, 0.25); }

  playMilestone() {
    this._sweep('sine', 440, 880, 0.12, 0.5);
    this._osc('sine', 1320, 0.08, 0.5, 0.2);
  }

  // ── Adaptive background music ─────────────────────────────
  startAdaptiveBg() {
    if (!this.enabled || !this.ctx || this._bgNode) return;
    this._bgGain = this.ctx.createGain();
    this._bgGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this._bgGain.connect(this.ctx.destination);

    // Low drone oscillator
    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(55, this.ctx.currentTime);
    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    drone.connect(droneGain); droneGain.connect(this._bgGain);
    drone.start();

    // Pulse LFO on a second oscillator
    const pulse = this.ctx.createOscillator();
    pulse.type = 'triangle';
    pulse.frequency.setValueAtTime(110, this.ctx.currentTime);
    const pulseGain = this.ctx.createGain();
    pulseGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
    pulse.connect(pulseGain); pulseGain.connect(this._bgGain);
    pulse.start();

    this._bgNode    = { drone, droneGain, pulse, pulseGain };
    this._bgTension = 0;

    // Fade in
    this._bgGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 3);
  }

  setTension(level) {
    // level 0–1, drives pitch and gain of bg music
    if (!this.enabled || !this.ctx || !this._bgNode) return;
    const t = this.ctx.currentTime;
    const targetFreq  = 55 + level * 30;     // drone rises from 55→85 hz
    const targetGain  = 0.18 + level * 0.18; // gets louder
    const pulseFreq   = 110 + level * 55;    // pulse rises 110→165 hz
    this._bgNode.drone.frequency.linearRampToValueAtTime(targetFreq, t + 2);
    this._bgGain.gain.linearRampToValueAtTime(targetGain, t + 2);
    this._bgNode.pulse.frequency.linearRampToValueAtTime(pulseFreq, t + 2);
  }

  stopAdaptiveBg() {
    if (!this._bgNode || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._bgGain.gain.linearRampToValueAtTime(0.001, t + 1.5);
    try { this._bgNode.drone.stop(t + 1.6); this._bgNode.pulse.stop(t + 1.6); } catch (e) {}
    this._bgNode = null; this._bgGain = null;
  }
}
