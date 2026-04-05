export class AudioManager {
  constructor() {
    this.ctx     = null;
    this.enabled = true;
    this._bgNode = null;
    this._bgGain = null;
    this._arpeggioNode = null;  // overdrive arpeggio layer
    this._tensionLevel = 0;
    this._clashComboCount = 0;
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

  _sweep(type, f1, f2, gainVal, duration, delay = 0, dest = null) {
    if (!this.enabled || !this.ctx) return;
    const d = dest || this.ctx.destination;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g); g.connect(d);
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

  playDeath(survivalMs = 0) {
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

    // Duration-scaled descend — longer run = deeper, more dramatic sweep
    const runFactor = Math.min(1, survivalMs / 90000);
    const startFreq = 200 + runFactor * 200;  // 200→400 hz
    const endFreq   = 30  - runFactor * 20;   // 30→10 hz (deeper for longer runs)
    const duration  = 0.5 + runFactor * 0.8;
    this._sweep('sawtooth', startFreq, Math.max(10, endFreq), 0.3, duration);

    // Extra dramatic low rumble for long runs
    if (runFactor > 0.5) {
      this._osc('sine', 40, 0.2 * runFactor, 0.6, 0.1);
    }
  }

  playWarning() { this._osc('square', 330, 0.045, 0.1); }

  /** Near-miss sound — pitch shifts higher the closer the miss was (0=barely, 1=extremely close) */
  playNearMiss(closeness = 0.5) {
    const basePitch = 300 + closeness * 400;  // 300→700 start
    const peakPitch = 900 + closeness * 600;  // 900→1500 peak
    this._sweep('sine', basePitch, peakPitch, 0.08 + closeness * 0.04, 0.12);
    this._sweep('sine', peakPitch, 200 + closeness * 100, 0.05, 0.15, 0.1);
  }

  playCountdownBeep(step) {
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
    this._clashComboCount = 0;  // reset combo on new clash activation
  }

  playClashKill() {
    this._clashComboCount++;
    // Impact
    this._sweep('sawtooth', 800, 120, 0.25, 0.4);
    this._osc('square', 220, 0.12, 0.3, 0.05);
    this._sweep('sine', 1200, 300, 0.1, 0.35, 0.1);
    // Combo voice: synthesized ascending tones for chained kills
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

  playPhaseEnd() { this._sweep('sine', 1600, 400, 0.08, 0.3); }

  playPowerupExpire() { this._sweep('square', 400, 150, 0.06, 0.25); }

  /** Decoy deployed sound */
  playDecoyDeploy() {
    this._sweep('sine', 440, 880, 0.1, 0.2);
    this._sweep('triangle', 220, 660, 0.08, 0.3, 0.1);
  }

  /** Decoy expire sound */
  playDecoyExpire() {
    this._sweep('sine', 880, 220, 0.07, 0.35);
  }

  playMilestone() {
    this._sweep('sine', 440, 880, 0.12, 0.5);
    this._osc('sine', 1320, 0.08, 0.5, 0.2);
  }

  /** Powerup incoming ping — faint chime to hint at upcoming spawn */
  playPowerupPing() {
    this._osc('sine', 1760, 0.04, 0.3);
    this._osc('sine', 2200, 0.02, 0.25, 0.1);
  }

  // ── Adaptive background music ─────────────────────────────
  startAdaptiveBg() {
    if (!this.enabled || !this.ctx || this._bgNode) return;
    if (this._bgStopTime && this.ctx.currentTime < this._bgStopTime) return;
    this._bgGain = this.ctx.createGain();
    this._bgGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this._bgGain.connect(this.ctx.destination);

    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(55, this.ctx.currentTime);
    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    drone.connect(droneGain); droneGain.connect(this._bgGain);
    drone.start();

    const pulse = this.ctx.createOscillator();
    pulse.type = 'triangle';
    pulse.frequency.setValueAtTime(110, this.ctx.currentTime);
    const pulseGain = this.ctx.createGain();
    pulseGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
    pulse.connect(pulseGain); pulseGain.connect(this._bgGain);
    pulse.start();

    this._bgNode    = { drone, droneGain, pulse, pulseGain };
    this._bgTension = 0;

    this._bgGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 3);
  }

  setTension(level) {
    if (!this.enabled || !this.ctx || !this._bgNode) return;
    const t = this.ctx.currentTime;
    const targetFreq  = 55 + level * 30;
    const targetGain  = 0.18 + level * 0.18;
    const pulseFreq   = 110 + level * 55;
    this._bgNode.drone.frequency.linearRampToValueAtTime(targetFreq, t + 2);
    this._bgGain.gain.linearRampToValueAtTime(targetGain, t + 2);
    this._bgNode.pulse.frequency.linearRampToValueAtTime(pulseFreq, t + 2);

    // Overdrive arpeggio layer: starts when tension >= 0.6
    if (level >= 0.6) {
      this._startArpeggio(level);
    } else {
      this._stopArpeggio();
    }
  }

  _startArpeggio(tension) {
    if (!this.enabled || !this.ctx) return;
    // Only start if not already running
    if (this._arpeggioInterval) return;
    const notes = [220, 277, 330, 415, 494];  // Am pentatonic
    let noteIdx = 0;
    const playNote = () => {
      if (!this._arpeggioInterval) return;
      const freq = notes[noteIdx % notes.length];
      noteIdx++;
      const gain = 0.03 + (tension - 0.6) * 0.08;
      this._osc('triangle', freq, gain, 0.18);
    };
    const bpm = 120 + (tension - 0.6) * 100;  // faster at higher tension
    const interval = Math.round(60000 / bpm / 2);
    this._arpeggioInterval = setInterval(playNote, interval);
    this._arpTension = tension;
  }

  _stopArpeggio() {
    if (this._arpeggioInterval) {
      clearInterval(this._arpeggioInterval);
      this._arpeggioInterval = null;
    }
  }

  stopAdaptiveBg() {
    if (!this._bgNode || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._bgGain.gain.linearRampToValueAtTime(0.001, t + 1.5);
    try { this._bgNode.drone.stop(t + 1.6); this._bgNode.pulse.stop(t + 1.6); } catch (e) {}
    this._bgStopTime = t + 1.6;
    this._bgNode = null; this._bgGain = null;
    this._stopArpeggio();
  }
}
