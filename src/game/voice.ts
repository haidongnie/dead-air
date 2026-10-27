import { sound, type Vec } from '../core/audio';
import { lineOfSight } from '../world/layout';
import type { Net } from './net';

// Proximity voice over WebRTC (peer-to-peer mesh, Playroom RPC for signaling).
// Each client also keeps a few short clips of what each person said, in memory
// only, so the mimic can talk back in a familiar voice. Nothing leaves the device.

const ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const MAX_CLIPS = 6;

interface Peer {
  pc: RTCPeerConnection;
  el: HTMLAudioElement;
  gain?: GainNode;
  panner?: PannerNode;
  muffle?: BiquadFilterNode;
  analyser?: AnalyserNode;
  level: number;
  rec?: Recorder;
  pending: RTCIceCandidateInit[];
}

/** Records short utterances from a stream whenever its level crosses a threshold. */
class Recorder {
  clips: AudioBuffer[] = [];
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private quiet = 0;
  private len = 0;

  constructor(private stream: MediaStream) {}

  update(level: number, dt: number) {
    if (typeof MediaRecorder === 'undefined') return;
    const loud = level > 0.035;
    if (!this.mr && loud) {
      try {
        this.mr = new MediaRecorder(this.stream);
      } catch { return; }
      this.chunks = [];
      this.mr.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.mr.onstop = () => this.finish();
      this.mr.start();
      this.quiet = 0; this.len = 0;
    }
    if (!this.mr) return;
    this.len += dt;
    this.quiet = loud ? 0 : this.quiet + dt;
    if (this.quiet > 0.6 || this.len > 4) {
      const keep = this.len - this.quiet > 0.6;
      const mr = this.mr;
      this.mr = null;
      if (!keep) mr.onstop = null;
      try { mr.stop(); } catch { /* already stopped */ }
    }
  }

  private async finish() {
    try {
      const buf = await new Blob(this.chunks).arrayBuffer();
      const audio = await sound.ctx.decodeAudioData(buf);
      this.clips.push(audio);
      if (this.clips.length > MAX_CLIPS) this.clips.shift();
    } catch { /* codec not decodable here; skip */ }
  }
}

export class Voice {
  private peers = new Map<string, Peer>();
  private mic: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private selfRec: Recorder | null = null;
  muted = false;
  selfLevel = 0;
  private mimicCooldown = 12;
  mimicEnabled = true;

  constructor(private net: Net) {
    net.onSignal = (msg, from) => this.onSignal(msg, from.id);
  }

  get hasMic() { return !!this.mic; }

  async enableMic(): Promise<boolean> {
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.mic = null;
      return false;
    }
    const src = sound.ctx.createMediaStreamSource(this.mic);
    this.micAnalyser = sound.ctx.createAnalyser();
    this.micAnalyser.fftSize = 512;
    src.connect(this.micAnalyser);
    this.selfRec = new Recorder(this.mic);
    return true;
  }

  toggleMute() {
    if (!this.mic) return;
    this.muted = !this.muted;
    for (const t of this.mic.getAudioTracks()) t.enabled = !this.muted;
  }

  private create(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const el = new Audio();
    el.muted = true; // Chrome only routes remote WebRTC audio into WebAudio while an element plays it
    el.autoplay = true;
    const peer: Peer = { pc, el, level: 0, pending: [] };
    pc.onicecandidate = (e) => { if (e.candidate) this.net.signal(id, { t: 'ice', c: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      el.srcObject = stream;
      el.play().catch(() => {});
      const src = sound.ctx.createMediaStreamSource(stream);
      const sp = sound.spatial({ x: 0, y: -50, z: 0 }, 2, 1.1);
      const gain = sound.ctx.createGain();
      const analyser = sound.ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      src.connect(gain).connect(sp.input);
      Object.assign(peer, { gain, panner: sp.panner, muffle: sp.muffle, analyser, rec: new Recorder(stream) });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce?.();
    };
    this.peers.set(id, peer);
    return peer;
  }

  /** Call for every other player in the room. The lower id makes the offer. */
  async addPeer(id: string) {
    if (this.peers.has(id) || id === this.net.me.id) return;
    const peer = this.create(id);
    if (this.net.me.id < id) {
      const tr = peer.pc.addTransceiver('audio', { direction: this.mic ? 'sendrecv' : 'recvonly' });
      if (this.mic) await tr.sender.replaceTrack(this.mic.getAudioTracks()[0]);
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.net.signal(id, { t: 'offer', sdp: offer.sdp });
    }
  }

  removePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.el.srcObject = null;
    p.gain?.disconnect();
    this.peers.delete(id);
  }

  private async onSignal(msg: any, from: string) {
    const peer = this.peers.get(from) ?? this.create(from);
    try {
      if (msg.t === 'offer') {
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        const tr = peer.pc.getTransceivers()[0];
        if (tr && this.mic) {
          await tr.sender.replaceTrack(this.mic.getAudioTracks()[0]);
          tr.direction = 'sendrecv';
        }
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.net.signal(from, { t: 'answer', sdp: answer.sdp });
        for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c);
      } else if (msg.t === 'answer') {
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c);
      } else if (msg.t === 'ice') {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(msg.c);
        else peer.pending.push(msg.c);
      }
    } catch (e) {
      console.warn('voice signaling', e);
    }
  }

  level(id: string) { return id === this.net.me.id ? (this.muted ? 0 : this.selfLevel) : this.peers.get(id)?.level ?? 0; }

  private rms(a: AnalyserNode) {
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  update(dt: number, listener: Vec, positions: Map<string, Vec>, creature: { pos: Vec; wearing: string; mode: number }) {
    if (this.micAnalyser) {
      this.selfLevel = this.rms(this.micAnalyser);
      if (!this.muted) this.selfRec?.update(this.selfLevel, dt);
    }
    for (const [id, p] of this.peers) {
      if (!p.analyser || !p.gain || !p.panner || !p.muffle) continue;
      p.level = this.rms(p.analyser);
      p.rec?.update(p.level, dt);
      const pos = positions.get(id);
      if (!pos) { p.gain.gain.value = 0; continue; }
      const head = { x: pos.x, y: pos.y + 1.6, z: pos.z };
      sound.setPos(p.panner, head);
      const d = Math.hypot(head.x - listener.x, head.z - listener.z);
      const floors = Math.abs(head.y - listener.y) > 2;
      const los = !floors && lineOfSight(listener.x, listener.z, head.x, head.z, listener.y - 0.5);
      const fall = d < 3 ? 1 : Math.max(0, 1 - (d - 3) / 16);
      p.gain.gain.setTargetAtTime(fall * (floors ? 0.35 : los ? 1.4 : 0.8), sound.now, 0.1);
      p.muffle.frequency.setTargetAtTime(floors ? 450 : los ? 18000 : 1100, sound.now, 0.1);
    }

    // the mimic speaks with the voice of whoever it is wearing
    this.mimicCooldown -= dt;
    if (!this.mimicEnabled || creature.mode !== 1 || this.mimicCooldown > 0) return;
    const d = Math.hypot(creature.pos.x - listener.x, creature.pos.z - listener.z);
    if (d > 15 || Math.abs(creature.pos.y + 1.6 - listener.y) > 2.2) return;
    const rec = creature.wearing === this.net.me.id ? this.selfRec : this.peers.get(creature.wearing)?.rec;
    const clips = rec?.clips ?? [];
    if (!clips.length) return;
    this.mimicCooldown = 10 + Math.random() * 12;
    const clip = clips[Math.floor(Math.random() * clips.length)];
    const src = sound.ctx.createBufferSource();
    src.buffer = clip;
    src.playbackRate.value = 0.9 + Math.random() * 0.06;
    const lp = sound.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3200;
    const g = sound.ctx.createGain(); g.gain.value = 1.3;
    const sp = sound.spatial({ x: creature.pos.x, y: creature.pos.y + 1.6, z: creature.pos.z }, 2, 1.1);
    src.connect(lp).connect(g).connect(sp.input);
    src.start();
  }
}
