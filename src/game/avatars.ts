import * as THREE from 'three';
import { sound, type Emitter } from '../core/audio';
import { Character, VARIANTS, PLAYER_CLIPS, nametag, makeCreature } from './characters';
import { surfaceAt } from './player';
import type { CreatureNet, PlayerNet } from './state';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function flashlightMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.8, roughness: 0.4 }));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  return g;
}

/** Another player in the house. */
export class RemoteAvatar {
  readonly char: Character;
  readonly light: THREE.SpotLight;
  private tag: THREE.Sprite;
  private target = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private bob = 0;
  private lastStep = 0;
  private downed = false;
  moving = 0;
  flash = true;
  focus = false;
  speaking = 0; // 0..1, from voice activity

  constructor(scene: THREE.Scene, readonly id: string, variant: number, name: string, color: string) {
    this.char = new Character(VARIANTS[variant % VARIANTS.length], PLAYER_CLIPS, 1.72);
    scene.add(this.char.root);
    this.tag = nametag(name, color);
    this.tag.position.y = 2.0;
    this.char.root.add(this.tag);
    this.light = new THREE.SpotLight(0xfff0d8, 0, 18, 0.5, 0.55, 1.5);
    this.light.position.set(0.2, 1.35, 0.25);
    this.char.root.add(this.light, this.light.target);
    if (this.char.rightHand) this.char.attach(this.char.rightHand, flashlightMesh(), 1);
  }

  apply(p: PlayerNet['p'], snap = false) {
    this.target.set(p[0], p[1], p[2]);
    if (snap) this.char.root.position.copy(this.target);
    this.yawT = p[3];
    this.pitch = p[4];
    this.moving = p[5];
    this.flash = !!p[6];
    this.focus = !!p[7];
  }
  private yawT = 0;

  setDowned(d: boolean) {
    if (d === this.downed) return;
    this.downed = d;
    if (d) { this.char.play('caught', 0.15, 1.4); setTimeout(() => this.downed && this.char.play('downed', 0.6), 3200); }
    else { this.char.play('standup', 0.2, 2.6); setTimeout(() => !this.downed && this.char.play('idle', 0.5), 2900); }
  }

  update(dt: number, camPos: THREE.Vector3) {
    const root = this.char.root;
    const k = 1 - Math.exp(-dt * 10);
    root.position.lerp(this.target, k);
    this.yaw = lerpAngle(this.yaw, this.yawT, k);
    root.rotation.y = this.yaw + Math.PI;
    if (!this.downed) {
      if (this.moving === 2) this.char.play('run');
      else if (this.moving === 1) this.char.play('walk');
      else this.char.play(this.char.has('idle') ? 'idle' : 'walk', 0.3, this.char.has('idle') ? 1 : 0);
    }
    this.char.update(dt);
    // light follows the player's view pitch
    this.light.target.position.set(0, 1.35 + Math.sin(this.pitch) * 6, 6 * Math.cos(this.pitch));
    const on = this.flash && !this.downed;
    this.light.intensity = on ? (this.focus ? 90 : 26) : 0;
    this.light.angle = this.focus ? 0.27 : 0.5;
    // nametag shows within a few meters
    const d = root.position.distanceTo(camPos);
    this.tag.visible = d < 9;
    // footsteps
    if (this.moving && !this.downed) {
      this.bob += dt * (this.moving === 2 ? 4.5 : 2.3) * 2.6;
      const step = Math.floor(this.bob / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        const p = root.position;
        sound.footstep({ x: p.x, y: p.y + 0.05, z: p.z }, surfaceAt(p.x, p.y, p.z), this.moving === 2 ? 0.55 : 0.32);
      }
    }
  }

  get headPos() { return _v.copy(this.char.root.position).setY(this.char.root.position.y + 1.6); }

  dispose(scene: THREE.Scene) { scene.remove(this.char.root); }
}

/**
 * Client-side view of the mimic. While disguised it wears a teammate's model and
 * name; its tells are: no light, no footsteps, a slightly slow gait, and eyes that
 * catch your flashlight.
 */
export class CreatureView {
  private disguises = new Map<number, Character>();
  private tags = new Map<string, THREE.Sprite>();
  private trueForm: Character;
  private dial: THREE.MeshStandardMaterial;
  private eyes: THREE.Mesh[];
  readonly pos = new THREE.Vector3(0, -50, 0);
  private yaw = 0;
  mode: CreatureNet['m'] = 0;
  wearing = '';
  private shown: Character | null = null;
  private lastAction = 0;
  private whisper: Emitter | null = null;
  private screamT = 0;
  visible = false;

  constructor(private scene: THREE.Scene) {
    const { char, dial } = makeCreature();
    this.trueForm = char;
    this.dial = dial;
    char.root.visible = false;
    scene.add(char.root);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a10, toneMapped: false, fog: false });
    this.eyes = [0, 1].map(() => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), eyeMat);
      e.visible = false;
      scene.add(e);
      return e;
    });
  }

  private disguise(variant: number): Character {
    let c = this.disguises.get(variant);
    if (!c) {
      c = new Character(VARIANTS[variant % VARIANTS.length], PLAYER_CLIPS, 1.72);
      c.root.visible = false;
      this.scene.add(c.root);
      this.disguises.set(variant, c);
    }
    return c;
  }

  private tagFor(id: string, name: string, color: string) {
    let t = this.tags.get(id);
    if (!t) { t = nametag(name, color); t.position.y = 2.0; this.tags.set(id, t); }
    return t;
  }

  update(dt: number, c: CreatureNet | undefined, info: {
    variantOf: (id: string) => number; nameOf: (id: string) => string; colorOf: (id: string) => string;
    cam: THREE.Camera; flashOn: boolean;
  }) {
    if (!sound.ready) return;
    if (!this.whisper) this.whisper = sound.loop(this.pos, 'whisper');
    if (!c) return;
    const k = 1 - Math.exp(-dt * 8);
    const jump = this.pos.distanceToSquared(_w.set(c.x, c.y, c.z)) > 9;
    if (jump || this.mode === 0) this.pos.set(c.x, c.y, c.z);
    else this.pos.lerp(_w.set(c.x, c.y, c.z), k);
    this.yaw = jump ? c.r : lerpAngle(this.yaw, c.r, k);
    if (c.m !== this.mode && c.m === 3) { this.screamT = 1.5; }
    this.mode = c.m;

    // which body to show
    let body: Character | null = null;
    if (c.m === 1) body = this.disguise(info.variantOf(c.d));
    else if (c.m === 2 || c.m === 3) body = this.trueForm;
    if (body !== this.shown) {
      if (this.shown) this.shown.root.visible = false;
      this.shown = body;
    }
    this.visible = !!body;
    if (body) {
      body.root.visible = true;
      body.root.position.copy(this.pos);
      body.root.rotation.y = this.yaw;
      if (c.m === 1) {
        // disguised: a person's walk, just a little too slow
        body.play(c.s > 0.2 ? 'walk' : 'idle', 0.3, c.s > 0.2 ? c.s / 2.6 : 1);
        const tag = this.tagFor(c.d, info.nameOf(c.d), info.colorOf(c.d));
        if (tag.parent !== body.root) body.root.add(tag);
        tag.visible = this.pos.distanceTo(info.cam.position) < 9 && Math.random() > 0.004;
        this.wearing = c.d;
      } else if (c.m === 3) {
        body.play(body.has('scream') ? 'scream' : 'idle', 0.1);
      } else {
        if (c.a !== this.lastAction && body.has('attack') && c.s > 3) body.play('attack', 0.1);
        else if (body.current !== 'attack' || c.s < 0.5) body.play(c.s > 3 ? 'run' : c.s > 0.2 ? (body.has('stalk') ? 'stalk' : 'walk') : 'idle', 0.25, c.s > 3 ? 1.1 : 1);
      }
      this.lastAction = c.a;
      body.update(dt);
    }
    this.dial.emissiveIntensity = 2 + Math.random() * 3;

    // eye glints: only when your own beam is on it
    const head = body?.head;
    let glint = false;
    if (head && c.m === 1 && info.flashOn) {
      const hp = head.getWorldPosition(_v);
      const camDir = info.cam.getWorldDirection(_w);
      const to = hp.clone().sub(info.cam.position);
      const dist = to.length();
      glint = dist < 11 && to.normalize().dot(camDir) > Math.cos(0.3);
      if (glint) {
        const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
        const base = head.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.11).add(new THREE.Vector3(0, 0.06, 0));
        this.eyes[0].position.copy(base).addScaledVector(right, 0.032);
        this.eyes[1].position.copy(base).addScaledVector(right, -0.032);
      }
    }
    for (const e of this.eyes) e.visible = glint;

    // radio-static whisper around it
    this.whisper.move({ x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z });
    this.whisper.set(c.m === 0 ? 0 : c.m === 1 ? 0.05 : 0.35);
    if (this.screamT > 0) this.screamT -= dt;
  }

  get chest() { return _v.set(this.pos.x, this.pos.y + 1.3, this.pos.z); }
}
