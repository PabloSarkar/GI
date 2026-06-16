/* ==========================================================================
   GLADIVS IMPERIVM  —  audio.js
   Fully procedural sound via WebAudio. No audio files are shipped; every
   clash, horn and trumpet is synthesised on the fly. Sounds are throttled so
   a thousand simultaneous sword hits don't melt the speakers.
   ========================================================================== */
(function (GI) {
  'use strict';

  class Audio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.muted = false;
      this._lastHit = 0;
      this._hitsThisFrame = 0;
      this._noise = null;
    }
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        this._noise = this._makeNoiseBuffer();
      } catch (e) { this.enabled = false; }
    }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }
    _makeNoiseBuffer() {
      const n = this.ctx.sampleRate * 1.0;
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }
    _env(node, t0, peak, attack, decay) {
      const g = node.gain;
      g.setValueAtTime(0.0001, t0);
      g.exponentialRampToValueAtTime(peak, t0 + attack);
      g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    }
    _noiseSrc() {
      const s = this.ctx.createBufferSource();
      s.buffer = this._noise; s.loop = true;
      return s;
    }
    // Short metallic clash — band-passed noise burst. Throttled hard.
    clash(vol) {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      if (this._hitsThisFrame > 4) return;
      this._hitsThisFrame++;
      const src = this._noiseSrc();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1600 + Math.random() * 2200;
      bp.Q.value = 2 + Math.random() * 3;
      const g = this.ctx.createGain();
      src.connect(bp); bp.connect(g); g.connect(this.master);
      this._env(g, t, (vol || 0.25) * 0.5, 0.002, 0.06 + Math.random() * 0.05);
      src.start(t); src.stop(t + 0.16);
    }
    // Dull thud of bodies / shields colliding.
    thud(vol) {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this.master);
      this._env(g, t, (vol || 0.3) * 0.4, 0.004, 0.13);
      o.start(t); o.stop(t + 0.2);
    }
    bow() {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      const src = this._noiseSrc();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2200;
      const g = this.ctx.createGain();
      src.connect(hp); hp.connect(g); g.connect(this.master);
      this._env(g, t, 0.06, 0.001, 0.05);
      src.start(t); src.stop(t + 0.1);
    }
    // Low brass war horn — the cornu — stacked detuned saws.
    horn(base) {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      const freq = base || 110;
      const g = this.ctx.createGain();
      g.connect(this.master);
      this._env(g, t, 0.5, 0.08, 1.1);
      [1, 1.005, 1.5, 2.0].forEach((m, i) => {
        const o = this.ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.setValueAtTime(freq * m * 0.5, t);
        o.frequency.exponentialRampToValueAtTime(freq * m, t + 0.15);
        const og = this.ctx.createGain();
        og.gain.value = i < 2 ? 0.5 : 0.18;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 1.3);
      });
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1400;
    }
    // Elephant trumpet — a rising, snarling glide.
    trumpet() {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(640, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(220, t + 0.7);
      const wob = this.ctx.createOscillator();
      wob.frequency.value = 18;
      const wobg = this.ctx.createGain(); wobg.gain.value = 40;
      wob.connect(wobg); wobg.connect(o.frequency);
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this.master);
      this._env(g, t, 0.5, 0.04, 0.9);
      o.start(t); o.stop(t + 1.0); wob.start(t); wob.stop(t + 1.0);
    }
    // Soft crowd roar for charges / routs.
    roar(vol) {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      const src = this._noiseSrc();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
      const g = this.ctx.createGain();
      src.connect(bp); bp.connect(g); g.connect(this.master);
      this._env(g, t, (vol || 0.3) * 0.4, 0.12, 0.8);
      src.start(t); src.stop(t + 1.1);
    }
    // Deep marching drum — call on a slow cadence during battle.
    drum() {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this.master);
      this._env(g, t, 0.4, 0.005, 0.22);
      o.start(t); o.stop(t + 0.3);
    }
    // UI click.
    click() {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = 520;
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this.master);
      this._env(g, t, 0.12, 0.002, 0.05);
      o.start(t); o.stop(t + 0.08);
    }
    victory() {
      if (!this._ok()) return;
      [0, 0.18, 0.36, 0.6].forEach((d, i) => {
        const freqs = [262, 330, 392, 523];
        const t = this.ctx.currentTime + d;
        const o = this.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = freqs[i];
        const g = this.ctx.createGain();
        o.connect(g); g.connect(this.master);
        this._env(g, t, 0.3, 0.02, 0.4);
        o.start(t); o.stop(t + 0.5);
      });
    }
    defeat() {
      if (!this._ok()) return;
      [0, 0.25, 0.5].forEach((d, i) => {
        const freqs = [294, 247, 196];
        const t = this.ctx.currentTime + d;
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = freqs[i];
        const g = this.ctx.createGain();
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 800;
        o.connect(lp); lp.connect(g); g.connect(this.master);
        this._env(g, t, 0.3, 0.04, 0.6);
        o.start(t); o.stop(t + 0.7);
      });
    }
    frameReset() { this._hitsThisFrame = 0; }
    _ok() { return this.enabled && !this.muted && this.ctx; }
  }

  GI.audio = new Audio();
})(window.GI = window.GI || {});
