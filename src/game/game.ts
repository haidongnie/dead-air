import * as THREE from 'three';
import type { PlayerState } from 'playroomkit';
import { Renderer } from '../core/renderer';
import { Input } from '../core/input';
import { sound, type Emitter } from '../core/audio';
import { buildHouse, SPOTS, type World } from '../world/house';
import { colliders, lineOfSight, roomAt } from '../world/layout';
import { t, DOCS, EAS_LINES, EAS_ZH, lang, type Key } from '../i18n';
import { Hud } from '../ui/hud';
import { Net } from './net';
import { Host } from './host';
import { LocalPlayer } from './player';
import { RemoteAvatar, CreatureView } from './avatars';
import { Voice } from './voice';
import { objective, radioTuned, teamItems, ROUND_MS, type Fx, type GameState, type Objective } from './state';

interface Interactable {
  id: string;
  pos: THREE.Vector3;
  range?: number;
  prompt(g: GameState): string | null;
  actionable?(g: GameState): boolean;
  use?(g: GameState): void;
  hold?: 'a' | 'b';
}

const OBJ_KEY: Record<Objective, Key> = {
  fuses: 'objFuses', lever: 'objLever', radio: 'objRadio', safe: 'objSafe',
  basement: 'objBasement', valves: 'objValves', relics: 'objRelics', escape: 'objEscape',
};
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 60);
  readonly renderer: Renderer;
  readonly input: Input;
  readonly hud = new Hud();
  readonly net = new Net();
  readonly host = new Host(this.net);
  readonly voice = new Voice(this.net);
  world!: World;
  player!: LocalPlayer;
  creature!: CreatureView;
  private avatars = new Map<string, RemoteAvatar>();
  private timer = new THREE.Timer();
  private prev: GameState | null = null;
  private round = 0;
  private wasHost = false;
  private poseT = 0;
  private interactables: Interactable[] = [];
  private holdT = 0;
  private reviveT = 0;
  private radioStatic: Emitter | null = null;
  private tvHum: Emitter | null = null;
  private ring: Emitter | null = null;
  private radioVoiceBusy = false;
  private radioVoiceCooldown = 0;
  private lightningT = 12;
  private lightningPhase = -1;
  private tvT = 0;
  private flickerBurst = 0;
  private glitch = 0;
  private dread = 0;
  started = false;
  private sensitivity = 1;
  private modelCheckT = 0;
  private ringing = false;
  private escapedSent = false;
  private dust!: THREE.Points;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, this.scene, this.camera);
    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.hud.lockHint(!locked && !this.hud.modalOpen && this.started);
    this.hud.onModalClose = () => { this.input.modal = null; this.input.lock(); };
    try { this.sensitivity = Number(localStorage.getItem('deadair.sens')) || 1; } catch { /* storage blocked */ }
  }

  /** Build the world after models are loaded. */
  build() {
    this.world = buildHouse(this.scene);
    this.player = new LocalPlayer(this.camera, this.scene);
    this.creature = new CreatureView(this.scene);
    this.buildInteractables();
    this.buildDust();
  }

  async connect(room: { roomCode?: string; name?: string } = {}) {
    this.net.onFx = (f) => this.onFx(f);
    this.net.onJoin = (p) => this.onJoin(p);
    this.net.onQuit = (p) => {
      this.avatars.get(p.id)?.dispose(this.scene);
      this.avatars.delete(p.id);
      this.voice.removePeer(p.id);
      if (this.started) this.hud.toast(t('tLeft', { n: this.net.name(p) }));
    };
    await this.net.start(room);
    if (this.net.isHost) this.host.ensureGame();
    this.pickModel();
  }

  private onJoin(p: PlayerState) {
    if (p.id === this.net.me.id) return;
    this.voice.addPeer(p.id);
    if (!this.started) return;
    // the joiner sets its nickname right after connecting: give it a moment to arrive
    let tries = 0;
    const announce = () => {
      if (typeof p.getState('name') !== 'string' || !p.getState('name')) { if (++tries < 15) { setTimeout(announce, 100); return; } }
      this.hud.toast(t('tJoin', { n: this.net.name(p) }));
    };
    announce();
  }

  /** Choose a character variant nobody else is wearing. */
  private pickModel() {
    const used = new Set<number>();
    for (const [id, p] of this.net.players) if (id !== this.net.me.id) used.add(p.getState('model'));
    const mine = this.net.me.getState('model');
    if (mine >= 0 && !used.has(mine)) return;
    let v = 0;
    while (used.has(v) && v < 3) v++;
    this.net.me.setState('model', v, true);
  }

  /** A gift relayed from TikFinity on this (the streamer's) machine. */
  onTikTokGift(g: { nick: string; name: string; count: number; diamonds: number }) {
    if (!this.started) return;
    if (this.net.game()?.phase !== 'play') {
      // between rounds the gift can't lure anything, but the streamer should still see it arrive
      this.hud.giftToast(t('giftIdle', { n: g.nick, g: g.name, c: g.count }), 1);
      return;
    }
    this.net.act({ k: 'gift', n: g.nick, g: g.name, c: g.count, d: g.diamonds });
  }

  async begin(withMic: boolean) {
    this.started = true;
    this.hud.show(true);
    if (withMic) await this.voice.enableMic();
    this.hud.mic(this.voice.hasMic ? 'on' : 'none');
    for (const id of this.net.players.keys()) if (id !== this.net.me.id) this.voice.addPeer(id);
    sound.startAmbience();
    this.hud.room(this.net.roomCode);
    const idx = [...this.net.players.keys()].sort().indexOf(this.net.me.id);
    this.player.respawn(Math.max(0, idx));
    this.timer.connect(document);
    this.input.reset();
    this.renderer.renderer.setAnimationLoop((ts) => this.frame(ts));
    // the intro: every TV in town cuts to the emergency broadcast
    const stop = sound.eas();
    await this.hud.eas(EAS_LINES, EAS_ZH, 11);
    stop();
    sound.slam({ x: 0, y: 1, z: 7 });
    this.glitch = 1;
    this.hud.subtitle(lang === 'zh' ? '（门在你们身后猛地关上了）' : '(The door slams shut behind you)', 4);
    this.input.lock();
  }

  // ---------------------------------------------------------------------------
  // interaction

  private buildInteractables() {
    const act = this.net.act.bind(this.net);
    const pick = (id: string, key: Key, need?: (g: GameState) => boolean): Interactable => ({
      id, pos: id.startsWith('f') ? SPOTS[`fuse${id[1]}` as 'fuse1'] : SPOTS[id as 'key'],
      prompt: (g) => (g.picked.includes(id) || (need && !need(g)) ? null : t(key)),
      use: () => { act({ k: 'pickup', id }); sound.pickup(); },
    });
    const doc = (id: keyof typeof DOCS, pos: THREE.Vector3, need?: (g: GameState) => boolean): Interactable => ({
      id: `doc-${id}`, pos,
      prompt: (g) => (need && !need(g) ? null : `${t('read')} · ${DOCS[id].title}`),
      use: (g) => this.openDoc(id, g),
    });
    this.interactables = [
      pick('f1', 'pickFuse'), pick('f2', 'pickFuse'), pick('f3', 'pickFuse'),
      pick('key', 'takeKey', (g) => g.safe), pick('musicbox', 'takeMusicBox', (g) => g.safe),
      pick('doll', 'takeDoll'), pick('watch', 'takeWatch', (g) => g.clock),
      {
        id: 'fusebox', pos: SPOTS.fuseBox,
        prompt: (g) => g.power ? null : g.installed >= 3 ? t('throwLever') : teamItems(g).fuses > 0 ? t('installFuses') : `${t('needFuses')} (${g.installed}/3)`,
        actionable: (g) => g.installed >= 3 || teamItems(g).fuses > 0,
        use: (g) => act(g.installed >= 3 ? { k: 'lever' } : { k: 'install' }),
      },
      {
        id: 'radio', pos: SPOTS.radio,
        prompt: (g) => (g.power ? t('useRadio') : t('noPower')),
        actionable: (g) => g.power,
        use: () => this.openTuner(),
      },
      {
        id: 'safe', pos: SPOTS.safe,
        prompt: (g) => (g.safe ? null : t('useSafe')),
        use: () => this.openKeypad(),
      },
      doc('journal', SPOTS.journal, (g) => g.safe),
      { id: 'clock', pos: SPOTS.clock, prompt: (g) => (g.clock ? null : t('clockClosed')), actionable: () => false },
      {
        id: 'bdoor', pos: SPOTS.basementDoor, range: 2.4,
        prompt: (g) => (g.basement ? null : teamItems(g).key ? t('unlock') : t('locked')),
        actionable: (g) => teamItems(g).key,
        use: () => act({ k: 'unlock' }),
      },
      { id: 'fdoor', pos: SPOTS.frontDoor, range: 2.6, prompt: (g) => (g.exit ? t('escape') : t('chained')), actionable: () => false },
      { id: 'valveA', pos: SPOTS.valveA, prompt: (g) => (g.basement && !g.clock ? t('turnValve') : null), hold: 'a' },
      { id: 'valveB', pos: SPOTS.valveB, prompt: (g) => (g.basement && !g.clock ? t('turnValve') : null), hold: 'b' },
      {
        id: 'altar', pos: SPOTS.altar, range: 2.6,
        prompt: (g) => teamItems(g).relics.length ? t('placeRelics') : g.exit ? null : `${t('altarNeed')} (${g.altar.length}/3)`,
        actionable: (g) => teamItems(g).relics.length > 0,
        use: () => act({ k: 'place' }),
      },
      {
        id: 'phone', pos: this.world.phone,
        prompt: () => (this.ringing ? t('answerPhone') : null),
        use: () => act({ k: 'answer' }),
      },
      doc('newspaper', SPOTS.newspaper), doc('sermon', SPOTS.sermon), doc('ruth', SPOTS.ruth), doc('log', SPOTS.log),
    ];
  }

  private openDoc(id: keyof typeof DOCS, g: GameState) {
    const d = DOCS[id];
    const fill = (s: string) => s.replaceAll('{freq}', String(g.freq));
    sound.page();
    this.input.unlock();
    this.input.modal = (e) => { if (e.code === 'Escape' || e.code === 'KeyE') this.hud.closeModal(); };
    this.hud.openDoc(d.title, fill(d.en), fill(d.zh));
    this.net.act({ k: 'doc', id });
  }

  private openKeypad() {
    this.input.unlock();
    this.input.modal = this.hud.openKeypad((code) => {
      this.net.act({ k: 'safe', code });
      const g = this.net.game();
      const ok = g?.code === code;
      sound.beep(ok);
      this.hud.keypadResult(ok);
      if (ok) setTimeout(() => this.hud.closeModal(), 700);
    });
  }

  private tunerFreq = 1010;
  private openTuner() {
    this.input.unlock();
    this.tunerFreq = this.net.game()?.radio ?? 1010;
    let sendT = 0;
    this.input.modal = this.hud.openTuner(() => this.tunerFreq, (f) => {
      this.tunerFreq = Math.max(530, Math.min(1700, f));
      sound.click(undefined, 600);
      const now = performance.now();
      if (now - sendT > 120) { sendT = now; this.net.act({ k: 'tune', f: this.tunerFreq }); }
      clearTimeout(this.tuneDebounce);
      this.tuneDebounce = window.setTimeout(() => this.net.act({ k: 'tune', f: this.tunerFreq }), 150);
    });
  }
  private tuneDebounce = 0;

  private updateInteraction(dt: number, g: GameState, me: { downed: boolean; escaped: boolean }) {
    const eye = this.player.eye;
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    let best: Interactable | null = null;
    let bestScore = 0;
    let bestText: string | null = null;
    if (!me.downed && !me.escaped && g.phase === 'play' && !this.hud.modalOpen) {
      for (const it of this.interactables) {
        const text = it.prompt(g);
        if (!text) continue;
        const to = it.pos.clone().sub(eye);
        const d = to.length();
        if (d > (it.range ?? 2.2)) continue;
        const cos = to.normalize().dot(dir);
        const need = Math.cos(Math.max(0.22, Math.atan(0.3 / d)));
        if (cos < need) continue;
        if (!lineOfSight(eye.x, eye.z, it.pos.x, it.pos.z, eye.y - 0.4, it.id === 'bdoor' ? 'door-basement' : it.id === 'fdoor' ? 'door-front' : undefined)) continue;
        if (cos > bestScore) { bestScore = cos; best = it; bestText = text; }
      }
    }

    // reviving a downed teammate takes priority when you look at them
    let reviveTarget: string | null = null;
    if (!me.downed && !me.escaped && g.phase === 'play') {
      for (const [id, av] of this.avatars) {
        if (!g.downed[id]) continue;
        const p = av.char.root.position;
        const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
        if (d < 1.8 && Math.abs(p.y - this.player.pos.y) < 1) { reviveTarget = id; break; }
      }
    }

    const holdingE = this.input.down('KeyE');
    if (reviveTarget) {
      this.reviveT = holdingE ? this.reviveT + dt : 0;
      this.hud.prompt(`${t('revive')} · ${this.net.name(reviveTarget)}`, true, this.reviveT / 3);
      if (this.reviveT >= 3) { this.net.act({ k: 'revive', target: reviveTarget }); this.reviveT = 0; }
      this.hud.crosshair(true);
      this.setHold('');
      return;
    }
    this.reviveT = 0;

    const actionable = !!best && (best.actionable?.(g) ?? true);
    if (best?.hold) {
      const active = holdingE;
      this.setHold(active ? best.hold : '');
      this.holdT = active ? this.holdT + dt : 0;
      this.hud.prompt(bestText, true, active ? Math.min(1, this.holdT / 2.5) : 0);
    } else {
      this.setHold('');
      this.hud.prompt(bestText, actionable);
      if (best && actionable && this.input.hit('KeyE')) best.use?.(g);
    }
    this.hud.crosshair(!!best);
  }

  private holdState: '' | 'a' | 'b' = '';
  private setHold(h: '' | 'a' | 'b') {
    if (h === this.holdState) return;
    this.holdState = h;
    this.net.me.setState('hold', h, true);
  }

  // ---------------------------------------------------------------------------
  // events from the host

  private onFx(f: Fx) {
    if (!this.started) return;
    switch (f.k) {
      case 'toast': {
        const r = f.r ? t(f.r as Key) : undefined;
        this.hud.toast(t(f.key as Key, { n: f.n ?? '', r: r ?? '' }));
        break;
      }
      case 'sound': {
        const p = { x: f.x, y: f.y, z: f.z };
        if (f.s === 'click') sound.click(p, 1200);
        else if (f.s === 'power') { sound.powerOn(p); this.flickerBurst = 2.5; this.glitch = 0.8; }
        else if (f.s === 'unlock') sound.unlock(p);
        else if (f.s === 'buzz') sound.buzz(p);
        else if (f.s === 'chime') sound.chime(p, f.n ?? 12);
        else if (f.s === 'scream') { sound.scream(p); this.glitch = 1; }
        else if (f.s === 'musicbox') sound.musicBox(p);
        break;
      }
      case 'scare': {
        if (f.s === 'caught') { sound.stinger(); this.glitch = 1; }
        else if (f.s === 'doll') { sound.musicBox(SPOTS.doll); this.flickerBurst = 1.5; }
        else if (f.s === 'exit') { sound.stinger(); this.glitch = 1; this.flickerBurst = 3; sound.slam(SPOTS.frontDoor); }
        else if (f.s === 'respawn' && f.n === this.net.me.id) {
          this.player.respawn(0);
          this.hud.subtitle(lang === 'zh' ? '（你挣扎着爬回了门厅……）' : '(You drag yourself back to the hall…)', 4);
        }
        else if (f.s === 'phone') this.ringing = true;
        else if (f.s === 'phone-stop') this.ringing = false;
        else if (f.s === 'answered') {
          this.ringing = false;
          if (f.n === this.net.me.id) {
            const line = `It's me, ${f.r}. I'm in the basement. Come down. Come alone.`;
            sound.speak(line, 0.9);
            this.hud.subtitle(t('phoneSub', { r: f.r ?? '' }), 7);
          }
        }
        break;
      }
      case 'gift': {
        const vars = { n: f.n, g: f.g || 'Gift', c: f.c };
        const key: Key = !f.lured ? 'giftQuiet' : f.t === 3 ? 'giftT3' : f.t === 2 ? 'giftT2' : 'giftT1';
        this.hud.giftToast(t(key, vars), f.t);
        sound.giftNoise({ x: f.x, y: f.y, z: f.z }, f.t);
        if (f.t === 3 && f.lured) { this.flickerBurst = 3; this.glitch = 1; sound.stinger(); }
        else if (f.t === 2) this.glitch = Math.max(this.glitch, 0.35);
        // big gifts get an on-air dedication, read by whatever is in the radio
        const near = Math.hypot(f.x - this.player.pos.x, f.z - this.player.pos.z) < 12 && Math.abs(f.y - 1.2 - this.player.pos.y) < 2;
        if (f.t >= 2 && f.lured && near && !window.speechSynthesis?.speaking) {
          sound.speak(`This one goes out to ${f.n}.`, 0.8);
        }
        break;
      }
    }
  }

  /** React to state transitions that should animate or make noise locally. */
  private diff(g: GameState) {
    const p = this.prev;
    const w = this.world;
    if (!p || p.round !== g.round) {
      // new round: reset local presentation
      this.hud.hideEnd();
      if (p && p.round !== g.round) {
        const idx = [...this.net.players.keys()].sort().indexOf(this.net.me.id);
        this.player.respawn(Math.max(0, idx));
        this.escapedSent = false;
        this.ringing = false;
        this.input.lock();
      }
    }
    for (const [id, obj] of Object.entries(w.pickups)) {
      const needs = id === 'key' || id === 'musicbox' ? g.safe : id === 'watch' ? g.clock : true;
      obj.visible = needs && !g.picked.includes(id);
    }
    w.fuseSlots.forEach((f, i) => { f.visible = i < g.installed; });
    w.safeCavity.visible = w.safeDoor.visible = w.journal.visible = g.safe;
    const shelf = w.group.getObjectByName('safe-shelf');
    if (shelf) shelf.visible = g.safe;
    w.clockCavity.visible = w.clockDoor.visible = g.clock;
    for (const [r, o] of Object.entries(w.altarItems)) o.visible = g.altar.includes(r as never);
    w.chains.visible = !g.exit;
    if (p && !p.power && g.power) this.hud.subtitle(lang === 'zh' ? '（灯亮了。房子里某处……有脚步声。）' : '(The lights come on. Footsteps somewhere in the house.)', 5);
    if (p && !p.clock && g.clock) this.glitch = 0.6;
    if (g.phase !== 'play' && (!p || p.phase === 'play' || p.round !== g.round)) this.showEnd(g);
    if (g.phase === 'play' && p?.phase !== 'play') this.hud.hideEnd();
    this.prev = g;
  }

  private showEnd(g: GameState) {
    this.input.unlock();
    this.hud.closeModal();
    const total = this.net.players.size;
    const out = Object.keys(g.escaped).length;
    const won = g.phase === 'won';
    const elapsed = (g.endAt ?? Date.now()) - g.t0;
    const mm = Math.floor(elapsed / 60000), ss = Math.floor(elapsed / 1000) % 60;
    this.hud.end(
      won ? t('winTitle') : t('loseTitle'),
      won ? t('winText') : g.end === 'midnight' ? t('loseMidnight') : t('loseTaken'),
      `${t('escapedCount', { a: out, b: total })} · ${t('timeLeft', { t: `${mm}:${String(ss).padStart(2, '0')}` })}`,
      this.net.isHost,
      () => this.net.act({ k: 'restart' }),
    );
    if (won) sound.chime(SPOTS.frontDoor, 1);
    else { sound.stinger(); this.glitch = 1; }
  }

  // ---------------------------------------------------------------------------
  // per-frame

  private frame(ts: number) {
    this.timer.update(ts);
    const dt = Math.max(0, Math.min(this.timer.getDelta(), 0.1));
    const time = this.timer.getElapsed();
    const g = this.net.game();
    if (!g) { this.renderer.render(time); return; }
    if (g.round !== this.round || !this.prev) { this.round = g.round; }
    this.diff(g);

    const meId = this.net.me.id;
    const downed = !!g.downed[meId];
    const escaped = !!g.escaped[meId];
    this.hud.tick(dt);

    // hotkeys
    if (this.input.hit('KeyM')) { this.voice.toggleMute(); this.hud.mic(!this.voice.hasMic ? 'none' : this.voice.muted ? 'off' : 'on'); }

    // local player
    this.player.flicker = this.dread > 0.4 ? this.dread : 0;
    this.player.update(dt, this.input, { frozen: this.hud.modalOpen || g.phase !== 'play', downed, escaped, sensitivity: this.sensitivity });
    sound.updateListener(this.camera);
    this.poseT -= dt;
    if (this.poseT <= 0) { this.poseT = 1 / 12; this.net.setPose(this.player.netPose()); }

    // host simulation
    if (this.net.isHost) {
      if (!this.wasHost) { this.host.ensureGame(); this.host.adopt(); }
      this.host.update(dt);
    }
    this.wasHost = this.net.isHost;

    // other players
    this.modelCheckT -= dt;
    if (this.modelCheckT <= 0) { this.modelCheckT = 1; this.pickModelConflict(); }
    const positions = new Map<string, { x: number; y: number; z: number }>();
    for (const [id, p] of this.net.players) {
      if (id === meId) continue;
      const pose = this.net.pose(p);
      const model = p.getState('model') ?? -1;
      if (!pose || model < 0) continue;
      let av = this.avatars.get(id);
      if (av && av.char.root.userData.model !== model) { av.dispose(this.scene); this.avatars.delete(id); av = undefined; }
      if (!av) {
        av = new RemoteAvatar(this.scene, id, model, this.net.name(p), this.net.color(p));
        av.char.root.userData.model = model;
        av.apply(pose, true);
        this.avatars.set(id, av);
      }
      av.apply(pose);
      av.setName(this.net.name(p), this.net.color(p));
      av.setDowned(!!g.downed[id]);
      av.char.root.visible = !g.escaped[id] || this.player.pos.z > 7;
      av.update(dt, this.camera.position);
      positions.set(id, av.char.root.position);
      // valve wheels turn while someone holds them
      const hold = p.getState('hold') as '' | 'a' | 'b';
      if (hold === 'a' || hold === 'b') this.world.valveWheels[hold].rotation.z += dt * 1.5;
    }
    if (this.holdState) this.world.valveWheels[this.holdState].rotation.z += dt * 1.5;

    // creature
    const c = this.net.creature();
    this.creature.update(dt, c, {
      variantOf: (id) => (id === meId ? this.net.me.getState('model') : this.net.players.get(id)?.getState('model')) ?? 0,
      nameOf: (id) => this.net.name(id),
      colorOf: (id) => this.net.color(id),
      cam: this.camera,
      flashOn: this.player.flashOn,
    });
    let dread = 0;
    if (c && c.m !== 0 && this.creature.visible) {
      const d = this.creature.pos.distanceTo(this.player.pos);
      const sameFloor = Math.abs(this.creature.pos.y - this.player.pos.y) < 1.5;
      dread = sameFloor ? Math.max(0, 1 - d / (c.m === 1 ? 9 : 14)) : 0;
      if (c.m >= 2) dread = Math.max(dread, sameFloor ? 0.35 : 0.1);
    }
    this.dread += (dread - this.dread) * Math.min(1, dt * 3);
    sound.setDread(this.dread, dt);

    // voice
    this.voice.update(dt, this.camera.position, positions, { pos: this.creature.pos, wearing: this.creature.wearing, mode: this.creature.mode });

    // interaction and escape
    this.updateInteraction(dt, g, { downed, escaped });
    if (g.exit && !escaped && !downed && !this.escapedSent && this.player.pos.z > 7.35) {
      this.escapedSent = true;
      this.net.act({ k: 'escape' });
    }

    this.updateWorld(dt, time, g);
    this.updateAudio(dt, g);
    this.updateHud(g, downed, escaped);

    // post-processing intensity
    this.glitch = Math.max(0, this.glitch - dt * 1.5);
    const u = this.renderer.vhs.uniforms;
    u.danger.value = this.dread;
    u.glitch.value = this.glitch;
    u.hurt.value += ((downed ? 1 : 0) - u.hurt.value) * Math.min(1, dt * 2);
    this.hud.danger(this.dread);
    this.updateDust(dt);
    this.renderer.render(time);
    this.input.endFrame();
  }

  private pickModelConflict() {
    const mine = this.net.me.getState('model');
    for (const [id, p] of this.net.players) {
      if (id !== this.net.me.id && p.getState('model') === mine && id < this.net.me.id) { this.net.me.setState('model', -1, true); this.pickModel(); return; }
    }
  }

  private updateWorld(dt: number, time: number, g: GameState) {
    const w = this.world;
    // lamps: dead until power, then unreliable
    const room = roomAt(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.flickerBurst = Math.max(0, this.flickerBurst - dt);
    for (const l of w.lamps) {
      let target = g.power ? l.base : 0;
      if (g.power) {
        const n = Math.sin(time * 13 + l.phase) * Math.sin(time * 7.3 + l.phase * 2);
        if (n > 0.93) target *= 0.15;
        if (this.flickerBurst > 0 && Math.random() < 0.4) target *= Math.random() * 0.3;
        if (this.dread > 0.3 && Math.random() < this.dread * 0.25) target *= 0.2;
        if (g.exit) target *= 0.6;
      }
      l.light.intensity += (target - l.light.intensity) * Math.min(1, dt * 20);
      l.light.color.setHex(g.exit ? 0xff3020 : 0xffa860);
      (l.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = l.light.intensity * 0.8;
    }
    void room;

    // doors
    const swing = (obj: THREE.Object3D, open: boolean, angle: number) => {
      obj.rotation.y += ((open ? angle : 0) - obj.rotation.y) * Math.min(1, dt * 2.2);
    };
    swing(w.frontDoor, g.exit, -1.7);
    swing(w.basementDoor, g.basement, -1.6);
    if (g.clock) w.clockDoor.rotation.y += (-1.9 - w.clockDoor.rotation.y) * Math.min(1, dt * 3);
    else w.clockDoor.rotation.y = 0;
    const safeBase = -0.5;
    if (g.safe) w.safeDoor.rotation.y += (safeBase + 1.7 - w.safeDoor.rotation.y) * Math.min(1, dt * 2.5);
    else w.safeDoor.rotation.y = safeBase;
    w.lever.rotation.x += ((g.power ? -0.7 : 0.7) - w.lever.rotation.x) * Math.min(1, dt * 8);
    // colliders follow the locked doors
    setDoorCollider('door-front', !g.exit);
    setDoorCollider('door-basement', !g.basement);

    // candles and transmitter
    w.candleLight.intensity = 2.4 + Math.sin(time * 9) * 0.3 + Math.random() * 0.3;
    for (const f of w.candleFlames) f.scale.y = 0.85 + Math.random() * 0.3;
    w.transmitterGlow.emissiveIntensity = g.exit ? 0.1 : 1 + Math.random() * 0.8;
    w.radioDial.emissiveIntensity = g.power ? (radioTuned(g) ? 2.5 : 1.2) : 0;

    // police lights after the chains break
    w.police.intensity = g.exit ? 30 : 0;
    w.police.color.setHex(Math.floor(time * 3) % 2 ? 0xff2020 : 0x2040ff);

    // lightning
    this.lightningT -= dt;
    if (this.lightningT <= 0) {
      this.lightningT = 18 + Math.random() * 25;
      this.lightningPhase = 0;
      sound.thunder(1 + Math.random() * 2.5);
    }
    if (this.lightningPhase >= 0) {
      this.lightningPhase += dt;
      const ph = this.lightningPhase;
      const flash = ph < 0.08 ? 1 : ph < 0.16 ? 0 : ph < 0.3 ? 0.7 : ph < 0.5 ? 0.15 : 0;
      w.lightning.intensity = flash * 2.5;
      w.outside.color.setRGB(0.043 + flash * 0.6, 0.078 + flash * 0.65, 0.125 + flash * 0.8);
      if (ph > 0.6) this.lightningPhase = -1;
    }

    // TV
    this.tvT -= dt;
    if (this.tvT <= 0) { this.tvT = 1 / 12; this.drawTV(g, time); }
    w.tvLight.intensity = (g.exit ? 0.3 : 1.1) * (0.8 + Math.random() * 0.4);
  }

  private drawTV(g: GameState, time: number) {
    const cv = this.world.tvCanvas;
    const x = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    const snow = () => {
      const img = x.createImageData(W, H);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      x.putImageData(img, 0, 0);
    };
    if (g.exit) { snow(); x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, H / 2 - 18, W, 36); x.fillStyle = '#fff'; x.font = '24px VT323, monospace'; x.textAlign = 'center'; x.fillText('SIGNAL LOST', W / 2, H / 2 + 8); }
    else if (!g.power || Math.floor(time / 9) % 3 === 0) {
      // EAS crawl
      x.fillStyle = '#0a1a8a'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#c01010'; x.fillRect(0, 0, W, 46);
      x.fillStyle = '#fff'; x.font = 'bold 22px VT323, monospace'; x.textAlign = 'center';
      x.fillText('EMERGENCY ALERT SYSTEM', W / 2, 31);
      x.font = '22px VT323, monospace';
      const line = EAS_LINES.slice(1).join('  ·  ');
      const off = (time * 70) % (line.length * 11 + W);
      x.textAlign = 'left';
      x.fillText(line, W - off, 140);
      x.font = '18px VT323, monospace';
      x.fillText(`WHIS ${g.freq}  ·  MILLBROOK CO.  ·  ${new Date(g.t0).getSeconds() % 2 ? '■' : '□'}`, 12, H - 18);
      for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 1); }
    } else {
      snow();
      if (Math.random() < 0.08) { x.fillStyle = 'rgba(0,0,0,0.8)'; x.fillRect(0, 0, W, H); x.fillStyle = '#ddd'; x.font = '26px VT323, monospace'; x.textAlign = 'center'; x.fillText('I SEE YOU', W / 2, H / 2); }
    }
    this.world.tvTexture.needsUpdate = true;
  }

  private updateAudio(dt: number, g: GameState) {
    if (!sound.ready) return;
    if (!this.radioStatic) {
      this.radioStatic = sound.loop({ x: SPOTS.radio.x, y: SPOTS.radio.y, z: SPOTS.radio.z }, 'static');
      this.tvHum = sound.loop({ x: SPOTS.tv.x, y: SPOTS.tv.y, z: SPOTS.tv.z }, 'static');
      this.ring = sound.loop({ x: this.world.phone.x, y: this.world.phone.y, z: this.world.phone.z }, 'hum');
    }
    this.tvHum!.set(g.exit ? 0.04 : 0.07);
    // phone bell: two short bursts every 3 seconds
    const ph = performance.now() / 1000 % 3;
    this.ring!.set(this.ringing && g.phase === 'play' && (ph < 0.4 || (ph > 0.6 && ph < 1.0)) ? 0.9 : 0);

    // radio: static that thins out as you approach the frequency, then the numbers voice
    const tuned = radioTuned(g);
    const near = Math.abs(g.radio - g.freq);
    this.radioStatic!.set(!g.power ? 0 : tuned ? 0.04 : 0.12 + Math.min(1, near / 200) * 0.15);
    if (this.hud.modalOpen) this.hud.tuner(this.tunerFreq, g.power ? Math.max(0, 1 - near / 120) : 0);
    this.radioVoiceCooldown -= dt;
    const dRadio = this.player.pos.distanceTo(SPOTS.radio);
    if (tuned && !this.radioVoiceBusy && this.radioVoiceCooldown <= 0 && dRadio < 7.5 && Math.abs(this.player.pos.y) < 1) {
      this.radioVoiceBusy = true;
      const d = g.code.split('').map(Number);
      const spoken = `Ruth. ${DIGITS[d[0]]}. Annie. ${DIGITS[d[1]]}. Elias. ${DIGITS[d[2]]}. Home. ${DIGITS[d[3]]}.`;
      this.hud.subtitle(t('radioSub', { a: d[0], b: d[1], c: d[2], d: d[3] }) + ' ' + t('ttsHint'), 12);
      sound.speak(spoken, Math.max(0.3, 1 - dRadio / 8), () => {
        this.radioVoiceBusy = false;
        this.radioVoiceCooldown = 4;
        this.net.act({ k: 'heard' });
      });
      // some browsers have no speech voices: still advance after the subtitle
      if (!window.speechSynthesis) setTimeout(() => { this.radioVoiceBusy = false; this.net.act({ k: 'heard' }); }, 6000);
    }
  }

  private updateHud(g: GameState, downed: boolean, escaped: boolean) {
    const elapsed = g.phase === 'play' ? Date.now() - g.t0 : (g.endAt ?? Date.now()) - g.t0;
    this.hud.setClock(Math.min(elapsed, ROUND_MS));
    this.hud.setObjective(downed ? t('objDowned') : escaped ? t('objWaiting') : t(OBJ_KEY[objective(g)]));
    const rows = [...this.net.players.values()].map((p) => ({
      id: p.id, name: this.net.name(p), color: this.net.color(p), you: p.id === this.net.me.id,
      down: !!g.downed[p.id], out: !!g.escaped[p.id], speaking: this.voice.level(p.id) > 0.03,
    }));
    this.hud.team(rows);
    const items = teamItems(g);
    const list: string[] = [];
    if (items.fuses > 0) list.push(`${t('fuseItem')} ×${items.fuses}`);
    if (items.key) list.push(t('keyItem'));
    for (const r of items.relics) list.push(t(r as Key));
    this.hud.items(list);
    this.hud.bars(this.player.beam, this.player.stamina, this.player.beam < 0.35 && !this.player.focusing && this.input.rmb);
  }

  // ---------------------------------------------------------------------------
  // dust motes visible only inside your flashlight beam

  private buildDust() {
    const N = 500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * 8;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOn: { value: 1 }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uCam; uniform vec3 uDir;
        varying float vA;
        void main() {
          vec3 p = position;
          p += vec3(sin(uTime * 0.3 + p.y * 3.0), sin(uTime * 0.2 + p.x * 2.0) * 0.5, cos(uTime * 0.25 + p.z * 3.0)) * 0.15;
          // wrap motes in a box that follows the camera
          p = uCam + mod(p - uCam + 4.0, 8.0) - 4.0;
          vec3 to = p - uCam;
          float d = length(to);
          float c = dot(to / d, uDir);
          vA = smoothstep(0.88, 0.97, c) * smoothstep(7.0, 1.0, d) * smoothstep(0.2, 0.6, d);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 2.2 * (3.0 / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOn; varying float vA;
        void main() { vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vec3(1.0, 0.95, 0.85), a * vA * 0.5 * uOn); }`,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  private updateDust(dt: number) {
    const u = (this.dust.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value += dt;
    u.uCam.value.copy(this.camera.position);
    this.camera.getWorldDirection(u.uDir.value);
    u.uOn.value = this.player.flashOn ? (this.player.focusing ? 1.6 : 1) : 0;
  }
}

const doorBoxes = new Map<string, (typeof colliders)[number]>();
function setDoorCollider(id: string, closed: boolean) {
  const idx = colliders.findIndex((b) => b.id === id);
  if (closed && idx < 0) { const b = doorBoxes.get(id); if (b) colliders.push(b); }
  if (!closed && idx >= 0) { doorBoxes.set(id, colliders[idx]); colliders.splice(idx, 1); }
}
