import * as THREE from 'three';
import { character, prop } from '../core/assets';

export const VARIANTS = ['player_a', 'player_b', 'player_c', 'player_d'];
// order matches the action_ids requested from Meshy's animation API
export const PLAYER_CLIPS = ['idle', 'caught', 'downed', 'standup'];
export const CREATURE_CLIPS = ['idle', 'stalk', 'scream', 'attack'];
export const CREATURE_MODEL = 'listener2b';

/** Text label that floats above a head. */
export function nametag(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '600 46px "Special Elite", "Courier New", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.9)';
  g.shadowBlur = 10;
  g.fillStyle = color;
  g.fillText(text.slice(0, 16), 256, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(0.9, 0.17, 1);
  s.renderOrder = 10;
  return s;
}

export class Character {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  current = '';
  readonly head: THREE.Object3D | null;
  readonly rightHand: THREE.Object3D | null;
  height: number;

  constructor(name: string, clipNames: string[], height: number) {
    const asset = character(name, clipNames);
    this.height = height;
    if (!asset) {
      // missing model: a dark silhouette keeps the game playable
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, height - 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      m.position.y = height / 2;
      this.model = m;
      this.root.add(m);
      this.mixer = new THREE.AnimationMixer(m);
      this.head = this.rightHand = null;
      return;
    }
    this.model = asset.scene;
    this.root.add(this.model);
    this.model.updateMatrixWorld(true);
    // normalize to the requested height using the skinned rest pose
    const box = new THREE.Box3();
    this.model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) { sm.computeBoundingBox(); box.union(sm.boundingBox!.clone().applyMatrix4(sm.matrixWorld)); }
    });
    if (!box.isEmpty()) {
      const h = box.max.y - box.min.y;
      const s = height / h;
      this.model.scale.multiplyScalar(s);
      this.model.position.y = -box.min.y * s;
    }
    this.model.updateMatrixWorld(true);
    this.head = this.model.getObjectByName('Head') ?? null;
    this.rightHand = this.model.getObjectByName('RightHand') ?? null;
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [k, clip] of Object.entries(asset.clips)) this.actions[k] = this.mixer.clipAction(clip);
    for (const k of ['caught', 'standup', 'scream', 'attack']) {
      const a = this.actions[k];
      if (a) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    }
    this.play(this.actions.idle ? 'idle' : 'walk', 0);
  }

  has(name: string) { return !!this.actions[name]; }

  play(name: string, fade = 0.25, timeScale = 1) {
    const next = this.actions[name];
    if (!next) return;
    next.timeScale = timeScale;
    if (this.current === name) return;
    const prev = this.actions[this.current];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = name;
  }

  setTimeScale(t: number) { const a = this.actions[this.current]; if (a) a.timeScale = t; }

  update(dt: number) { this.mixer.update(dt); }

  /** Rest-pose-compensated attachment: `obj` keeps its world orientation relative to the character root. */
  attach(bone: THREE.Object3D, obj: THREE.Object3D, worldSize: number) {
    this.root.updateMatrixWorld(true);
    const bq = bone.getWorldQuaternion(new THREE.Quaternion());
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const bs = bone.getWorldScale(new THREE.Vector3());
    obj.quaternion.copy(bq.invert().multiply(rq));
    obj.scale.setScalar(worldSize / bs.x);
    bone.add(obj);
  }
}

/** The creature's true form: a gaunt preacher whose head is a 1950s radio. */
export function makeCreature(): { char: Character; dial: THREE.MeshStandardMaterial } {
  const char = new Character(CREATURE_MODEL, CREATURE_CLIPS, 2.3);
  const dial = new THREE.MeshStandardMaterial({ color: 0x220a00, emissive: 0xff6a20, emissiveIntensity: 3 });
  const head = char.head;
  const neck = head?.parent;
  if (head && neck) {
    // collapse the human head and seat a radio on the neck instead
    const headLocal = head.position.clone();
    head.scale.setScalar(0.001);
    const radio = new THREE.Group();
    const r = prop('radio_head', { size: 0.42, axis: 'max' });
    r.position.y = -0.05;
    radio.add(r);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), dial);
    glow.position.set(0, 0.2, 0.17);
    radio.add(glow);
    const pl = new THREE.PointLight(0xff6a20, 0.8, 2.5, 2);
    pl.position.set(0, 0.15, 0.35);
    radio.add(pl);
    char.attach(neck, radio, 1);
    radio.position.copy(headLocal).multiplyScalar(0.9);
    radio.traverse((o) => { o.castShadow = true; });
  }
  return { char, dial };
}
