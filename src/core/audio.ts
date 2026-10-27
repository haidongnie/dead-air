import * as THREE from 'three';

// All sound is synthesized with WebAudio: no audio files to license or download.
// Positional sounds use HRTF panners; anything on a different floor than the
// listener gets muffled.

export type Vec = { x: number; y: number; z: number };

export class Sound {
  ctx!: AudioContext;
  master!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private pink!: AudioBuffer;
  private listenerY = 0;
  private heartbeatT = 0;
  ready = false;

  /** Must run inside a user gesture. */
  init() {
    if (this.ready) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.noise = this.makeNoise(false);
    this.pink = this.makeNoise(true);
    this.ready = true;
  }

  resume() { if (this.ready && this.ctx.state !== 'running') this.ctx.resume(); }

  private makeNoise(pink: boolean) {
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }

  get now() { return this.ctx.currentTime; }

  updateListener(cam: THREE.Camera) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(_v);
    const f = cam.getWorldDirection(_f);
    this.listenerY = p.y;
    if (l.positionX) {
      const t = this.now;
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      (l as any).setPosition(p.x, p.y, p.z);
      (l as any).setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  /** A panner (+ floor occlusion filter) at a world position; returns the node to connect sources into. */
  spatial(pos: Vec, ref = 1.5, rolloff = 1.3): { input: AudioNode; panner: PannerNode; muffle: BiquadFilterNode } {
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = ref;
    panner.rolloffFactor = rolloff;
    panner.maxDistance = 40;
    this.setPos(panner, pos);
    const muffle = this.ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    this.applyOcclusion(muffle, pos.y);
    muffle.connect(panner).connect(this.sfx);
    return { input: muffle, panner, muffle };
  }

  setPos(p: PannerNode, pos: Vec) {
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else (p as any).setPosition(pos.x, pos.y, pos.z);
  }

  applyOcclusion(f: BiquadFilterNode, y: number) {
    const otherFloor = Math.abs(y - this.listenerY) > 2.2;
    f.frequency.setTargetAtTime(otherFloor ? 500 : 18000, this.now, 0.05);
  }

  private noiseSrc(pink = false, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = pink ? this.pink : this.noise;
    s.loop = loop;
    if (!loop) s.loopStart = 0;
    return s;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private out(pos?: Vec): AudioNode {
    return pos ? this.spatial(pos).input : this.sfx;
  }

  // ---------------------------------------------------------------------------
  // ambience

  startAmbience() {
    const c = this.ctx;
    // wind
    const wind = this.noiseSrc(true, true);
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.6;
    const wg = c.createGain(); wg.gain.value = 0.11;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 220;
    lfo.connect(lg).connect(wf.frequency);
    wind.connect(wf).connect(wg).connect(this.master);
    // rain on the roof
    const rain = this.noiseSrc(false, true);
    const rh = c.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 1400;
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 5200;
    const rg = c.createGain(); rg.gain.value = 0.035;
    rain.connect(rh).connect(rl).connect(rg).connect(this.master);
    // low drone
    const dg = c.createGain(); dg.gain.value = 0.045;
    const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 180;
    df.connect(dg).connect(this.master);
    for (const f of [41.2, 41.9, 61.7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(df); o.start();
    }
    wind.start(); rain.start(); lfo.start();
    this.droneGain = dg;
  }
  private droneGain?: GainNode;

  /** Raise the drone and heartbeat with creature proximity (0..1). */
  setDread(d: number, dt: number) {
    if (!this.ready || !this.droneGain) return;
    this.droneGain.gain.setTargetAtTime(0.045 + d * 0.12, this.now, 0.3);
    if (d > 0.15) {
      this.heartbeatT -= dt;
      if (this.heartbeatT <= 0) {
        this.heartbeat(0.25 + d * 0.5);
        this.heartbeatT = 1.25 - d * 0.75;
      }
    }
  }

  heartbeat(vol: number) {
    const t = this.now;
    for (const off of [0, 0.22]) {
      const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(70, t + off);
      o.frequency.exponentialRampToValueAtTime(38, t + off + 0.16);
      const g = this.ctx.createGain(); this.env(g, t + off, 0.01, vol * (off ? 0.7 : 1), 0.18);
      o.connect(g).connect(this.master); o.start(t + off); o.stop(t + off + 0.3);
    }
  }

  thunder(delay = 0.3) {
    const t = this.now + delay;
    const n = this.noiseSrc(true);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = this.ctx.createGain(); this.env(g, t, 0.05, 0.9, 4);
    n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + 4.2);
  }

  creak(pos: Vec) {
    const t = this.now;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    const base = 90 + Math.random() * 120;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.6), t + 0.9);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 6;
    const g = this.ctx.createGain(); this.env(g, t, 0.15, 0.25, 0.8);
    const am = this.ctx.createOscillator(); am.frequency.value = 26;
    const amg = this.ctx.createGain(); amg.gain.value = 0.5;
    am.connect(amg).connect(g.gain);
    o.connect(f).connect(g).connect(this.out(pos)); o.start(t); o.stop(t + 1.1); am.start(t); am.stop(t + 1.1);
  }

  // ---------------------------------------------------------------------------
  // one-shots

  footstep(pos: Vec, surface: 'wood' | 'concrete' | 'linoleum' | 'porch', vol: number) {
    const t = this.now;
    const n = this.noiseSrc();
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = surface === 'concrete' ? 1800 : surface === 'linoleum' ? 2400 : 520 + Math.random() * 120;
    f.Q.value = surface === 'concrete' ? 1.2 : 2.2;
    const g = this.ctx.createGain(); this.env(g, t, 0.004, vol, surface === 'concrete' ? 0.06 : 0.12);
    n.connect(f).connect(g).connect(this.out(pos));
    n.start(t, Math.random() * 2); n.stop(t + 0.2);
    if (surface === 'wood' && Math.random() < 0.18) this.creak(pos);
  }

  slam(pos: Vec) {
    const t = this.now;
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
    const g = this.ctx.createGain(); this.env(g, t, 0.005, 1.2, 0.5);
    const n = this.noiseSrc(true); const ng = this.ctx.createGain(); this.env(ng, t, 0.002, 0.8, 0.35);
    const dst = this.out(pos);
    o.connect(g).connect(dst); n.connect(ng).connect(dst);
    o.start(t); o.stop(t + 0.6); n.start(t); n.stop(t + 0.5);
  }

  click(pos?: Vec, pitch = 2400) {
    const t = this.now;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = pitch;
    const g = this.ctx.createGain(); this.env(g, t, 0.001, 0.25, 0.03);
    o.connect(g).connect(this.out(pos)); o.start(t); o.stop(t + 0.05);
  }

  unlock(pos: Vec) {
    [0, 0.09, 0.22].forEach((d, i) => setTimeout(() => this.click(pos, 900 + i * 500), d * 1000));
    setTimeout(() => this.slam(pos), 450);
  }

  beep(ok = true) {
    const t = this.now;
    const o = this.ctx.createOscillator(); o.type = ok ? 'sine' : 'square';
    o.frequency.value = ok ? 1320 : 140;
    const g = this.ctx.createGain(); this.env(g, t, 0.005, ok ? 0.18 : 0.3, ok ? 0.08 : 0.45);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.6);
  }

  pickup() {
    const t = this.now;
    [660, 990].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.frequency.value = f;
      const g = this.ctx.createGain(); this.env(g, t + i * 0.07, 0.005, 0.12, 0.25);
      o.connect(g).connect(this.sfx); o.start(t + i * 0.07); o.stop(t + 0.5);
    });
  }

  page() {
    const t = this.now;
    const n = this.noiseSrc(); const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = this.ctx.createGain(); this.env(g, t, 0.03, 0.25, 0.2);
    n.connect(f).connect(g).connect(this.sfx); n.start(t, Math.random()); n.stop(t + 0.3);
  }

  buzz(pos: Vec, dur = 0.6) {
    const t = this.now;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 120;
    const g = this.ctx.createGain(); this.env(g, t, 0.01, 0.35, dur);
    const dst = this.out(pos);
    o.connect(g); o2.connect(g); g.connect(dst);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  powerOn(pos: Vec) {
    this.slam(pos);
    this.buzz(pos, 1.6);
    const t = this.now;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(30, t); o.frequency.exponentialRampToValueAtTime(120, t + 1.8);
    const g = this.ctx.createGain(); this.env(g, t, 0.3, 0.3, 2);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 2.5);
  }

  bell(pos: Vec, freq: number, vol = 0.5, at = 0) {
    const t = this.now + at;
    for (const [mul, amp] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]] as const) {
      const o = this.ctx.createOscillator(); o.frequency.value = freq * mul;
      const g = this.ctx.createGain(); this.env(g, t, 0.004, vol * amp, 2.8 / mul + 0.4);
      o.connect(g).connect(this.out(pos)); o.start(t); o.stop(t + 3.5);
    }
  }

  chime(pos: Vec, count: number) {
    for (let i = 0; i < count; i++) this.bell(pos, 146.8, 0.55, i * 1.1);
  }

  /** A few bars of Brahms' lullaby (public domain) on a music box. */
  musicBox(pos: Vec) {
    const notes = [64, 64, 67, 64, 64, 67, 64, 67, 72, 71, 69, 69, 67, 62, 64, 65, 62, 62, 64, 65];
    const durs = [0.5, 0.5, 1.5, 0.5, 0.5, 1.5, 0.5, 0.5, 1, 1, 1, 1, 1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1.5];
    let at = 0;
    notes.forEach((n, i) => {
      // detune slightly: an old, unwound mechanism
      const f = 440 * 2 ** ((n + 12 - 69) / 12) * (1 - i * 0.002);
      this.bell(pos, f, 0.12, at);
      at += durs[i] * 0.42 * (1 + i * 0.015);
    });
  }

  scream(pos: Vec) {
    const t = this.now;
    const dst = this.spatial(pos, 3, 0.8).input;
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 6); }
    shaper.curve = curve;
    const g = this.ctx.createGain(); this.env(g, t, 0.03, 0.55, 1.6);
    shaper.connect(g).connect(dst);
    for (const f of [620, 655, 940, 1240]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 1.6);
      const vib = this.ctx.createOscillator(); vib.frequency.value = 9 + Math.random() * 4;
      const vg = this.ctx.createGain(); vg.gain.value = f * 0.04;
      vib.connect(vg).connect(o.frequency);
      o.connect(shaper); o.start(t); o.stop(t + 1.8); vib.start(t); vib.stop(t + 1.8);
    }
    const n = this.noiseSrc(); const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000;
    const ng = this.ctx.createGain(); this.env(ng, t, 0.01, 0.4, 1.2);
    n.connect(nf).connect(ng).connect(dst); n.start(t); n.stop(t + 1.4);
  }

  stinger() {
    const t = this.now;
    for (const f of [92.5, 98, 138.6, 196, 207.7]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(3000, t + 0.4);
      const g = this.ctx.createGain(); this.env(g, t, 0.06, 0.09, 2.2);
      o.connect(lp).connect(g).connect(this.master); o.start(t); o.stop(t + 2.5);
    }
  }

  /** The Emergency Alert System attention signal: SAME header bursts, then the 853+960 Hz tone. */
  eas(): () => void {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.16; g.connect(this.master);
    const nodes: AudioScheduledSourceNode[] = [];
    let t = this.now + 0.3;
    const bit = 1 / 520.83;
    for (let burst = 0; burst < 3; burst++) {
      const o = c.createOscillator(); o.type = 'square';
      for (let i = 0; i < 260; i++) o.frequency.setValueAtTime(Math.random() < 0.5 ? 2083.3 : 1562.5, t + i * bit);
      o.connect(g); o.start(t); o.stop(t + 260 * bit); nodes.push(o);
      t += 260 * bit + 1.0;
    }
    for (const f of [853, 960]) {
      const o = c.createOscillator(); o.frequency.value = f;
      o.connect(g); o.start(t); o.stop(t + 8); nodes.push(o);
    }
    return () => { const n = this.now; g.gain.setTargetAtTime(0, n, 0.05); nodes.forEach((o) => { try { o.stop(n + 0.3); } catch { /* done */ } }); };
  }

  // ---------------------------------------------------------------------------
  // persistent emitters (radio static, TV hum, creature whisper)

  loop(pos: Vec, kind: 'static' | 'hum' | 'whisper'): Emitter {
    const sp = this.spatial(pos, kind === 'whisper' ? 1 : 1.5, kind === 'whisper' ? 2 : 1.2);
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    gain.connect(sp.input);
    if (kind === 'hum') {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 15734 / 1000 * 3.8; // flyback-ish whine, low
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      o.connect(f).connect(gain); o.start();
      const hi = this.ctx.createOscillator(); hi.frequency.value = 15734 / 2;
      const hg = this.ctx.createGain(); hg.gain.value = 0.02; hi.connect(hg).connect(gain); hi.start();
    } else {
      const n = this.noiseSrc(kind === 'whisper', true);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = kind === 'whisper' ? 1600 : 2200; f.Q.value = kind === 'whisper' ? 3 : 0.5;
      n.connect(f).connect(gain); n.start(0, Math.random() * 2);
      if (kind === 'whisper') {
        const am = this.ctx.createOscillator(); am.frequency.value = 3.3;
        const ag = this.ctx.createGain(); ag.gain.value = 0.6; am.connect(ag).connect(gain.gain); am.start();
      }
    }
    return {
      gain,
      move: (p: Vec) => { this.setPos(sp.panner, p); this.applyOcclusion(sp.muffle, p.y); },
      set: (v: number) => gain.gain.setTargetAtTime(v, this.now, 0.08),
    };
  }

  // ---------------------------------------------------------------------------
  // the numbers voice on the radio

  private voice: SpeechSynthesisVoice | null = null;
  speak(text: string, volume: number, onEnd?: () => void) {
    const ss = window.speechSynthesis;
    if (!ss) { onEnd?.(); return; }
    if (!this.voice) {
      const vs = ss.getVoices().filter((v) => v.lang.startsWith('en'));
      this.voice = vs.find((v) => /daniel|alex|fred|male|david|george/i.test(v.name)) ?? vs[0] ?? null;
    }
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.pitch = 0.1; u.rate = 0.62; u.volume = Math.max(0, Math.min(1, volume));
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    ss.speak(u);
  }
  stopSpeech() { window.speechSynthesis?.cancel(); }
}

export interface Emitter { gain: GainNode; move(p: Vec): void; set(v: number): void; }

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
export const sound = new Sound();
