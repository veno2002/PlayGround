export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.dry = null;
    this.wet = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.ambient = null;
    this.lastFootstep = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.58;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 20;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.82;
    this.dry.connect(this.master);

    const conv = this.ctx.createConvolver();
    conv.buffer = this.makeImpulse(2.2, 2.7);
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.32;
    this.wet.connect(conv);
    conv.connect(this.master);

    this.noiseBuffer = this.makeNoise();
    this.startAmbient();
  }

  makeNoise(seconds = 2) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.96 * last + 0.04 * white;
      data[i] = white * 0.7 + last * 0.5;
    }
    return buffer;
  }

  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * seconds;
    const buffer = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buffer;
  }

  startAmbient() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.12;
    out.connect(this.dry);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    filter.Q.value = 2;
    out.connect(filter);
    filter.connect(this.wet);

    const freqs = [41.2, 61.7, 82.4, 123.5];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sawtooth' : 'sine';
      osc.frequency.value = f;
      osc.detune.value = (i - 1.5) * 7;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.16 : 0.035;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc.connect(g);
      g.connect(out);
      osc.start();
      lfo.start();
    });

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 380;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0.03;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lg = ctx.createGain();
    lg.gain.value = 0.018;
    lfo.connect(lg);
    lg.connect(wg.gain);
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.wet);
    wind.start();
    lfo.start();

    this.ambient = { out, filter };
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.58 : 0, this.ctx.currentTime, 0.05);
    }
    return this.enabled;
  }

  setIntensity(value) {
    if (!this.ambient) return;
    this.ambient.out.gain.setTargetAtTime(0.09 + value * 0.08, this.ctx.currentTime, 0.5);
  }

  route(node, pan = 0) {
    if (Math.abs(pan) < 0.02) {
      node.connect(this.dry);
      node.connect(this.wet);
      return;
    }
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner);
    panner.connect(this.dry);
    panner.connect(this.wet);
  }

  tone({ freq = 220, end = null, type = 'sine', dur = 0.15, gain = 0.2, delay = 0, filter = null, pan = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.setValueAtTime(filter.freq || 1000, t);
      if (filter.end) f.frequency.exponentialRampToValueAtTime(filter.end, t + dur);
      f.Q.value = filter.q ?? 1;
      g.connect(f);
      node = f;
    }
    osc.connect(g);
    this.route(node, pan);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, gain = 0.2, freq = 2000, end = null, q = 1, type = 'lowpass', delay = 0, pan = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (end) f.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    this.route(g, pan);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  playWeapon(type, pan = 0) {
    if (!this.ctx) return;
    if (type === 'pulse') {
      this.tone({ freq: 880, end: 250, type: 'square', dur: 0.09, gain: 0.1, filter: { freq: 3200, end: 900 }, pan });
      this.noise({ dur: 0.06, gain: 0.08, freq: 4200, end: 900, pan });
    } else if (type === 'scatter') {
      this.noise({ dur: 0.28, gain: 0.38, freq: 1600, end: 300, q: 0.8, pan });
      this.tone({ freq: 130, end: 45, type: 'triangle', dur: 0.25, gain: 0.25, pan });
    } else if (type === 'rocket') {
      this.tone({ freq: 170, end: 55, type: 'sine', dur: 0.32, gain: 0.34, pan });
      this.noise({ dur: 0.38, gain: 0.24, freq: 900, end: 2600, type: 'bandpass', q: 1.4, pan });
    } else if (type === 'rail') {
      this.tone({ freq: 2600, end: 160, type: 'sawtooth', dur: 0.28, gain: 0.15, filter: { freq: 4200, end: 600 }, pan });
      this.tone({ freq: 95, end: 45, type: 'sine', dur: 0.3, gain: 0.18, pan });
      this.noise({ dur: 0.18, gain: 0.1, freq: 5000, end: 1200, type: 'bandpass', pan });
    }
  }

  playExplosion(pan = 0, big = true) {
    if (!this.ctx) return;
    const g = big ? 0.62 : 0.35;
    this.noise({ dur: big ? 0.95 : 0.5, gain: g, freq: 900, end: 80, q: 0.7, pan });
    this.tone({ freq: 88, end: 24, type: 'sine', dur: big ? 0.9 : 0.45, gain: 0.5, pan });
    this.tone({ freq: 210, end: 45, type: 'triangle', dur: 0.5, gain: 0.22, pan });
    this.noise({ dur: 0.2, gain: 0.25, freq: 5200, end: 1800, type: 'highpass', pan });
  }

  playHit(head = false) {
    this.tone({ freq: head ? 1650 : 1100, end: head ? 800 : 600, type: 'triangle', dur: head ? 0.16 : 0.08, gain: head ? 0.18 : 0.12 });
    if (head) this.tone({ freq: 2300, end: 1400, type: 'sine', dur: 0.1, gain: 0.1, delay: 0.03 });
  }

  playDamage() {
    this.noise({ dur: 0.25, gain: 0.22, freq: 420, end: 110, q: 1.2 });
    this.tone({ freq: 75, end: 38, type: 'sine', dur: 0.3, gain: 0.2 });
  }

  playPickup(kind = 'health') {
    const base = kind === 'armor' ? 440 : 520;
    [1, 1.25, 1.5].forEach((m, i) => {
      this.tone({ freq: base * m, type: 'triangle', dur: 0.22, gain: 0.11, delay: i * 0.055 });
    });
  }

  playJump() {
    this.noise({ dur: 0.16, gain: 0.07, freq: 450, end: 1000, type: 'bandpass', q: 0.7 });
  }

  playLand() {
    this.noise({ dur: 0.12, gain: 0.09, freq: 200, end: 90, q: 1.2 });
  }

  playFootstep() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastFootstep < 210) return;
    this.lastFootstep = now;
    this.noise({ dur: 0.08, gain: 0.045, freq: 300 + Math.random() * 160, end: 120, q: 1.5 });
  }

  playBotSpawn(pan = 0) {
    this.tone({ freq: 120, end: 360, type: 'sawtooth', dur: 0.45, gain: 0.08, filter: { freq: 2400, end: 500 }, pan });
    this.noise({ dur: 0.35, gain: 0.05, freq: 900, end: 2400, type: 'bandpass', pan });
  }

  playKill() {
    [1, 1.5, 2].forEach((m, i) => {
      this.tone({ freq: 330 * m, type: 'square', dur: 0.16, gain: 0.05, delay: i * 0.07, filter: { freq: 1800 } });
    });
  }

  playUi() {
    this.tone({ freq: 440, end: 660, type: 'square', dur: 0.08, gain: 0.05, filter: { freq: 2500 } });
  }
}
