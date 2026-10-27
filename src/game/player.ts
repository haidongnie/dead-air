import * as THREE from 'three';
import type { Input } from '../core/input';
import { sound } from '../core/audio';
import { groundY, resolveCircle, roomAt, SPAWN } from '../world/layout';

const EYE = 1.62;
const WALK = 2.3;
const RUN = 4.5;
const RADIUS = 0.3;

export function surfaceAt(x: number, y: number, z: number) {
  const r = roomAt(x, y, z);
  return r === 'kitchen' ? 'linoleum' : r === 'basement' ? 'concrete' : r === 'porch' ? 'porch' : 'wood';
}

/** Soft-edged flashlight cookie with a hot center and a faint outer ring, like a real reflector. */
function cookie(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.18, '#f4f0e8');
  grad.addColorStop(0.42, '#9a968e');
  grad.addColorStop(0.62, '#5a5650');
  grad.addColorStop(0.72, '#6e6a62');
  grad.addColorStop(0.8, '#2a2826');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // lens grime
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.beginPath();
    g.arc(128 + (Math.random() - 0.5) * 140, 128 + (Math.random() - 0.5) * 140, Math.random() * 14, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LocalPlayer {
  readonly pos = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z);
  yaw = SPAWN.yaw;
  pitch = 0;
  private vel = new THREE.Vector2();
  stamina = 1;
  beam = 1;
  private beamLock = false;
  private beamIdle = 0;
  flashOn = true;
  focusing = false;
  moveState = 0;
  private bobT = 0;
  private lastStep = 0;
  private downT = 0;
  readonly flashlight: THREE.SpotLight;
  private flashModel: THREE.Group;
  private lens: THREE.MeshStandardMaterial;
  flicker = 0; // 0..1, set from creature proximity

  constructor(readonly camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    scene.add(camera);
    const fl = new THREE.SpotLight(0xfff0d8, 0, 24, 0.52, 0.5, 1.5);
    fl.map = cookie();
    fl.castShadow = true;
    fl.shadow.mapSize.set(1024, 1024);
    fl.shadow.camera.near = 0.15;
    fl.shadow.camera.far = 24;
    fl.shadow.bias = -0.0004;
    fl.shadow.normalBias = 0.03;
    fl.shadow.intensity = 0.92;
    fl.position.set(0.19, -0.2, -0.5);
    fl.target.position.set(0.02, -0.08, -6);
    camera.add(fl, fl.target);
    this.flashlight = fl;

    // the flashlight in hand
    this.flashModel = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.85, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.2, 14), metal);
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.06, 16), metal);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.12;
    this.lens = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2d0, emissiveIntensity: 2 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 16), this.lens);
    lens.position.z = -0.151;
    lens.rotation.y = Math.PI;
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.02), new THREE.MeshStandardMaterial({ color: 0x8a1010 }));
    sw.position.set(0, 0.018, -0.02);
    this.flashModel.add(body, head, lens, sw);
    this.flashModel.position.set(0.2, -0.21, -0.34);
    this.flashModel.rotation.set(0.04, 0.12, 0);
    this.flashModel.traverse((o) => { o.castShadow = false; });
    camera.add(this.flashModel);
  }

  respawn(i = 0) {
    const a = (i / 4) * Math.PI * 2;
    this.pos.set(SPAWN.x + Math.cos(a) * 0.6, SPAWN.y, SPAWN.z + Math.sin(a) * 0.4);
    this.yaw = SPAWN.yaw;
    this.pitch = 0;
    this.stamina = 1;
    this.beam = 1;
    this.flashOn = true;
  }

  get eye() { return _eye.set(this.pos.x, this.pos.y + EYE, this.pos.z); }

  update(dt: number, input: Input, opts: { frozen: boolean; downed: boolean; escaped: boolean; sensitivity: number }) {
    // look
    if (input.locked) {
      this.yaw -= input.mouseDX * 0.0022 * opts.sensitivity;
      this.pitch -= input.mouseDY * 0.0022 * opts.sensitivity;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }
    if (input.hit('KeyF')) { this.flashOn = !this.flashOn; sound.click(undefined, 1800); }

    // focus beam: limited charge, must recover before reuse after running dry
    const wantFocus = input.rmb && this.flashOn && !opts.downed && !opts.frozen;
    if (this.beam <= 0.02) this.beamLock = true;
    if (this.beamLock && this.beam > 0.35) this.beamLock = false;
    this.focusing = wantFocus && !this.beamLock;
    if (this.focusing) { this.beam = Math.max(0, this.beam - dt * 0.34); this.beamIdle = 0; }
    else { this.beamIdle += dt; if (this.beamIdle > 1) this.beam = Math.min(1, this.beam + dt * 0.11); }

    // move
    let mx = 0, mz = 0;
    if (!opts.frozen && !opts.downed) {
      if (input.down('KeyW') || input.down('ArrowUp')) mz -= 1;
      if (input.down('KeyS') || input.down('ArrowDown')) mz += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    }
    const len = Math.hypot(mx, mz);
    const running = len > 0 && (input.down('ShiftLeft') || input.down('ShiftRight')) && this.stamina > 0.05 && mz < 0;
    const speed = running ? RUN : WALK;
    if (running) this.stamina = Math.max(0, this.stamina - dt * 0.2);
    else this.stamina = Math.min(1, this.stamina + dt * (len ? 0.08 : 0.16));
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const tx = len ? ((mx * cos + mz * sin) / len) * speed : 0;
    const tz = len ? ((-mx * sin + mz * cos) / len) * speed : 0;
    const k = 1 - Math.exp(-dt * 12);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (tz - this.vel.y) * k;
    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.y * dt };
    resolveCircle(p, this.pos.y, RADIUS);
    if (opts.escaped) p.z = Math.max(p.z, 7.8);
    this.pos.x = p.x; this.pos.z = p.z;
    const gy = groundY(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 14);

    const moving = Math.hypot(this.vel.x, this.vel.y);
    this.moveState = moving < 0.3 ? 0 : running ? 2 : 1;

    // bob + footsteps
    if (moving > 0.3) {
      this.bobT += dt * moving * 2.6;
      const step = Math.floor(this.bobT / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        sound.footstep({ x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z }, surfaceAt(this.pos.x, this.pos.y, this.pos.z), running ? 0.45 : 0.25);
      }
    } else {
      this.bobT += (Math.round(this.bobT / Math.PI) * Math.PI - this.bobT) * Math.min(1, dt * 6);
    }
    const bob = Math.sin(this.bobT) * (running ? 0.05 : 0.032);
    const sway = Math.cos(this.bobT * 0.5) * (running ? 0.03 : 0.015);

    // camera
    this.downT += ((opts.downed ? 1 : 0) - this.downT) * Math.min(1, dt * 3);
    const eyeY = EYE - this.downT * 1.3 + bob * (1 - this.downT);
    this.camera.position.set(this.pos.x, this.pos.y + eyeY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, sway * 0.3 + this.downT * 0.45, 'YXZ');

    // flashlight
    const flick = this.flicker > 0 && Math.random() < this.flicker * 0.35 ? Math.random() * 0.3 : 1;
    const on = this.flashOn && !opts.downed;
    const target = !on ? 0 : (this.focusing ? 140 : 44) * flick;
    this.flashlight.intensity += (target - this.flashlight.intensity) * Math.min(1, dt * 18);
    const ang = this.focusing ? 0.27 : 0.52;
    this.flashlight.angle += (ang - this.flashlight.angle) * Math.min(1, dt * 10);
    this.flashlight.color.setHex(this.focusing ? 0xe8f0ff : 0xfff0d8);
    this.lens.emissiveIntensity = on ? (this.focusing ? 6 : 2) * flick : 0;
    this.flashModel.visible = !opts.downed;
    this.flashModel.position.set(0.2 + sway * 0.6, -0.21 + bob * 0.4, -0.34);
  }

  /** Compact pose for the network. */
  netPose(): [number, number, number, number, number, number, number, number] {
    return [
      +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2),
      +this.yaw.toFixed(2), +this.pitch.toFixed(2), this.moveState, this.flashOn ? 1 : 0, this.focusing ? 1 : 0,
    ];
  }
}

const _eye = new THREE.Vector3();
